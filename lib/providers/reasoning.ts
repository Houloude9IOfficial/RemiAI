import {
  normalizeQualityPolicy,
  type QualityPolicy,
} from "@/lib/chat/quality-policy";

/**
 * Provider-aware reasoning support.
 *
 * We only enable provider options when the configured provider and model
 * family are known to return reasoning text through the AI SDK stream. Ollama
 * tag-based reasoning is handled separately in the model factory because its
 * `<think>` content arrives as ordinary text. Unknown OpenAI-compatible models
 * stay disabled rather than showing a fabricated thinking UI.
 *
 * The reasoning-effort policy (Minimal/Low/Medium/High) is mapped to each
 * provider's native knob where one exists:
 * - OpenAI (gpt-5 / o-series): `reasoningEffort`, sent only for model families
 *   that support it. The `@ai-sdk/openai` chat provider forwards
 *   `reasoning_effort` unconditionally, so sending it to a non-reasoning model
 *   would make OpenAI's API reject the request with a 400.
 * - Ollama (OpenAI-compatible endpoint): `reasoningEffort` too — Ollama maps
 *   it to its internal think knob ("none" = thinking off) for thinking-capable
 *   models; the native `think` flag does not work on /v1/chat/completions.
 * - NVIDIA Nemotron 3 (openai-compatible NIM): `chat_template_kwargs` with
 *   `enable_thinking` / `low_effort`. Reasoning is ON by default — the knobs
 *   are: `{ enable_thinking: false }` (no reasoning), `{ low_effort: true }`
 *   (light reasoning), or omitted (full reasoning). Injected into the request
 *   body by the compat fetch layer, not via provider options.
 * - Anthropic budget families (claude-*-3-7, claude-*-4-5): `budgetTokens`
 *   scaled by effort.
 * - Anthropic adaptive families (claude-*-4-6+, claude-*-5): adaptive thinking
 *   has no budget knob — Anthropic decides per-turn how much to think — so the
 *   effort level guides via routing/token budget/system prompt instead.
 */

export function supportsStreamingReasoning(
  providerKind: string,
  modelId: string,
): boolean {
  if (providerKind !== "anthropic") return false;

  const id = modelId.toLowerCase();
  return (
    // Older extended-thinking models use the budget-based API.
    /claude-(?:opus|sonnet)-3-7/.test(id) ||
    /claude-(?:opus|sonnet)-4-5/.test(id) ||
    // Newer Opus/Sonnet models support adaptive thinking and summarized
    // display, which is required for visible realtime progress on 4.7+.
    /claude-(?:opus|sonnet)-(?:4-(?:6|7|8)|5(?:$|-))/.test(id)
  );
}

/**
 * Model families where OpenAI's `reasoning_effort` is accepted in Chat
 * Completions: o-series (`o1`, `o3`, `o4`, `o5`…) and `gpt-5.x`. Everything
 * else (gpt-4o, gpt-4.1, …) rejects the parameter server-side.
 */
export function supportsOpenAIReasoningEffort(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    /(^|[^a-z0-9])o(?:[1-9])(?:[^a-z0-9]|$)/.test(id) ||
    /(^|[^a-z0-9])gpt-5(?:\.[0-9]+)?(?:[^a-z0-9]|$)/.test(id)
  );
}

/** Common reasoning families exposed by OpenAI-compatible gateways. */
export function supportsCompatibleReasoning(modelId: string): boolean {
  return /(?:deepseek-r1|deepseek-v3(?:\.1)?|qwen3(?:[.:_-]|$)|qwq|nemotron-(?:3|prime)|gpt-oss|o[1-9](?:[.:_-]|$)|gpt-5(?:[.:_-]|$))/i.test(modelId);
}

/**
 * OpenAI only accepts `minimal` on newer families (gpt-5.1+, o3/o4-mini…);
 * the base gpt-5 supports low/medium/high. Clamp so a 400 can't happen.
 */
function clampOpenAIReasoningEffort(
  modelId: string,
  effort: QualityPolicy,
): QualityPolicy {
  if (
    effort === "minimal" &&
    /(^|[^a-z0-9])gpt-5(?:[^0-9.]|$)/.test(modelId.toLowerCase())
  ) {
    return "low";
  }
  return effort;
}

/**
 * NVIDIA reasoning models served through the OpenAI-compatible NIM API
 * (nemotron-3-super, nemotron-3-ultra, nemotron-prime). Returns the
 * `chat_template_kwargs` body to send, or `undefined` for unrelated models.
 */
const NEMOTRON_REASONING_RE = /nemotron-(?:3(?:-super|-ultra)?|prime)/i;

export function nemotronChatTemplateKwargs(
  modelId: string,
  effort: QualityPolicy,
): { chat_template_kwargs: { enable_thinking: boolean; low_effort?: boolean } } | undefined {
  if (!NEMOTRON_REASONING_RE.test(modelId)) return undefined;

  const normalized = normalizeQualityPolicy(effort);
  if (normalized === "minimal") {
    // "Least reasoning · fastest response" — skip reasoning tokens entirely.
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  if (normalized === "low") {
    // "Light reasoning" — NVIDIA's low_effort appends a light-reasoning
    // instruction while the reasoning channel stays active.
    return { chat_template_kwargs: { enable_thinking: true, low_effort: true } };
  }
  // medium/high — full reasoning (NVIDIA's default; explicitly enabled).
  return { chat_template_kwargs: { enable_thinking: true } };
}

/** Effort → Anthropic extended-thinking budget for budget-based families. */
const ANTHROPIC_BUDGET_BY_EFFORT: Record<QualityPolicy, number> = {
  minimal: 2_048,
  low: 4_096,
  medium: 8_192,
  high: 16_384,
};

/**
 * Return only provider options that are safe for the selected model family.
 * `undefined` means the request should use the provider's normal behavior.
 */
type ReasoningProviderOptions = {
  anthropic?: {
    sendReasoning: boolean;
    thinking:
      | { type: "adaptive"; display: "summarized" }
      | { type: "enabled"; budgetTokens: number }
      | { type: "disabled" };
  };
  openai?: {
    reasoningEffort: "none" | "minimal" | "low" | "medium" | "high";
  };
  openrouter?: {
    reasoning: {
      effort: "none" | "minimal" | "low" | "medium" | "high";
    };
  };
  google?: {
    thinkingConfig: {
      thinkingBudget?: number;
      thinkingLevel?: "minimal" | "low" | "medium" | "high";
      includeThoughts?: boolean;
    };
  };
  mistral?: {
    reasoningEffort: "none" | "high";
  };
  groq?: {
    reasoningEffort: "none" | "default" | "low" | "medium" | "high";
    reasoningFormat: "parsed";
  };
};

/**
 * Ollama thinking-capable model families. Ollama's OpenAI-compatible endpoint
 * maps `reasoning_effort` to its internal think knob: "none" turns thinking
 * off, low/medium/high scale it. Other models ignore the field.
 */
const OLLAMA_THINKING_MODELS = new RegExp(
  [
    "qwen3(?:-coder)?",
    "deepseek-r1",
    "deepseek-v3\\.1",
    "gpt-oss",
    "nemotron-3-super",
    "nemotron-3-ultra",
    "nemotron-prime",
    "granite-4",
  ].join("|"),
  "i",
);

function supportsOllamaReasoning(modelId: string): boolean {
  return OLLAMA_THINKING_MODELS.test(modelId);
}

/** Effort → Ollama `reasoning_effort`. "minimal" has no native level — none. */
function ollamaReasoningEffort(
  effort: QualityPolicy,
): "none" | "low" | "medium" | "high" {
  switch (effort) {
    case "minimal":
      return "none";
    case "low":
      return "low";
    case "high":
      return "high";
    default:
      return "medium";
  }
}

export function streamingReasoningProviderOptions(
  providerKind: string,
  modelId: string,
  effort: QualityPolicy = "medium",
): ReasoningProviderOptions | undefined {
  const normalized = normalizeQualityPolicy(effort);

  if (providerKind === "ollama") {
    if (!supportsOllamaReasoning(modelId)) return undefined;
    return { openai: { reasoningEffort: ollamaReasoningEffort(normalized) } };
  }

  if (providerKind === "openai-compatible" && supportsCompatibleReasoning(modelId)) {
    // Most gateways mirror OpenAI's reasoning_effort parameter. Nemotron's
    // direct NIM path is handled separately by chat_template_kwargs.
    if (NEMOTRON_REASONING_RE.test(modelId)) return undefined;
    return {
      openai: {
        reasoningEffort: normalized === "minimal" ? "none" : normalized,
      },
    };
  }

  if (providerKind === "openrouter") {
    return {
      openrouter: {
        reasoning: {
          effort: normalized,
        },
      },
    };
  }

  if (providerKind === "google") {
    if (!/(?:gemini-2\.5|gemini-3|gemini-3\.|gemini-3\d|gemini-4)/i.test(modelId)) {
      return undefined;
    }
    const isGemini3OrNewer = /gemini-(?:3|3\.|3\d|4)/i.test(modelId);
    if (normalized === "minimal") {
      return {
        google: {
          thinkingConfig: isGemini3OrNewer
            ? { thinkingLevel: "minimal", includeThoughts: false }
            : { thinkingBudget: 0, includeThoughts: false },
        },
      };
    }
    return {
      google: {
        thinkingConfig: isGemini3OrNewer
          ? { thinkingLevel: normalized, includeThoughts: true }
          : {
              thinkingBudget:
                normalized === "low" ? 4096 : normalized === "medium" ? 8192 : 16384,
              includeThoughts: true,
            },
      },
    };
  }

  if (providerKind === "mistral") {
    if (!/(?:magistral|mistral-small-(?:latest|2603)|mistral-medium-(?:3|3[.]5))/i.test(modelId)) return undefined;
    return {
      mistral: { reasoningEffort: normalized === "minimal" ? "none" : "high" },
    };
  }

  if (providerKind === "groq") {
    if (!/(?:gpt-oss|deepseek-r1|qwen.*(?:qwen3|qwq))/i.test(modelId)) return undefined;
    return {
      groq: {
        reasoningEffort: normalized === "minimal" ? "none" : normalized,
        reasoningFormat: "parsed",
      },
    };
  }

  if (providerKind === "openai") {
    if (!supportsOpenAIReasoningEffort(modelId)) return undefined;
    return {
      openai: { reasoningEffort: clampOpenAIReasoningEffort(modelId, normalized) },
    };
  }

  if (!supportsStreamingReasoning(providerKind, modelId)) return undefined;

  const id = modelId.toLowerCase();
  const supportsAdaptiveThinking =
    /claude-(?:opus|sonnet)-(?:4-(?:6|7|8)|5(?:$|-))/.test(id);

  if (normalized === "minimal") {
    return {
      anthropic: {
        sendReasoning: false,
        thinking: { type: "disabled" },
      },
    };
  }

  if (supportsAdaptiveThinking) {
    return {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "adaptive", display: "summarized" },
      },
    };
  }

  return {
    anthropic: {
      sendReasoning: true,
      thinking: {
        type: "enabled",
        budgetTokens: ANTHROPIC_BUDGET_BY_EFFORT[normalized],
      },
    },
  };
}