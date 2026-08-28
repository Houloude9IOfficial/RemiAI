/**
 * Auto-discover available models from AI providers.
 *
 * Each provider kind uses a different API endpoint and auth scheme.
 * If discovery fails (network error, bad auth, etc.) we gracefully
 * fall back to the static catalog. Discovery is best-effort — it
 * never throws.
 *
 * When the provider's models API publishes a context-window size per model
 * (Anthropic `context_window`, Google `inputTokenLimit`, Mistral
 * `max_context_length`, Groq/OpenRouter `context_length`, ...) it is captured
 * as `contextWindow` — the real source of truth used by the UI instead of
 * the hardcoded {@link MODEL_CONTEXT_WINDOWS} heuristics.
 */

type ProviderInfo = {
  kind: string;
  baseUrl: string | null;
  apiKey: string | null;
};

export type DiscoveredModel = {
  modelId: string;
  label: string | null;
  /** Provider-reported context window in tokens; null when not published. */
  contextWindow: number | null;
};

type DiscoveryResult = {
  models: DiscoveredModel[];
  discovered: boolean;
};

function toInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

// ── OpenAI ─────────────────────────────────────────────────────────────

async function discoverOpenAI(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as { data?: { id: string }[] };
    if (!body.data) return { models: [], discovered: false };

    return {
      // The OpenAI models list does not publish context windows.
      models: body.data.map((m) => ({
        modelId: m.id,
        label: null,
        contextWindow: null,
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Anthropic ─────────────────────────────────────────────────────────

async function discoverAnthropic(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      data?: { type: string; id: string; display_name?: string; context_window?: number }[];
    };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data.map((m) => ({
        modelId: m.id,
        label: m.display_name ?? null,
        contextWindow: toInt(m.context_window),
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Ollama ─────────────────────────────────────────────────────────────

async function discoverOllama(baseUrl: string | null): Promise<DiscoveryResult> {
  try {
    // The Ollama API for listing models lives at /api/tags, not under /v1
    const base = baseUrl?.replace(/\/v1\/?$/, "") ?? "http://localhost:11434";
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as { models?: { name: string }[] };
    if (!body.models) return { models: [], discovered: false };

    return {
      // /api/tags does not publish context windows.
      models: body.models.map((m) => ({
        modelId: m.name,
        label: null,
        contextWindow: null,
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Google (Gemini) ────────────────────────────────────────────────────

async function discoverGoogle(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: { "x-goog-api-key": apiKey },
      },
    );
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      models?: { name: string; displayName?: string; inputTokenLimit?: number }[];
    };
    if (!body.models) return { models: [], discovered: false };

    return {
      models: body.models
        // Only generation (chat) models — the list also contains embeddings,
        // image and TTS models that can't be used as chat models.
        .filter((m) => m.name.startsWith("models/gemini"))
        .map((m) => ({
          modelId: m.name.replace(/^models\//, ""),
          label: m.displayName ?? null,
          // Gemini reports its input (context) token limit per model.
          contextWindow: toInt(m.inputTokenLimit),
        })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Mistral ────────────────────────────────────────────────────────────

async function discoverMistral(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      data?: { id: string; max_context_length?: number }[];
    };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data
        .filter((m) => !m.id.includes("embed")) // embeddings aren't chat models
        .map((m) => ({
          modelId: m.id,
          label: null,
          contextWindow: toInt(m.max_context_length),
        })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Groq ───────────────────────────────────────────────────────────────

async function discoverGroq(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      data?: { id: string; context_window?: number }[];
    };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data.map((m) => ({
        modelId: m.id,
        label: null,
        contextWindow: toInt(m.context_window),
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── OpenRouter ─────────────────────────────────────────────────────────

async function discoverOpenRouter(apiKey: string): Promise<DiscoveryResult> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      data?: { id: string; name?: string; context_length?: number }[];
    };
    if (!body.data) return { models: [], discovered: false };

    return {
      models: body.data.map((m) => ({
        modelId: m.id,
        label: m.name ?? null,
        contextWindow: toInt(m.context_length),
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── OpenAI-compatible ──────────────────────────────────────────────────

async function discoverOpenAICompatible(
  baseUrl: string,
  apiKey: string | null,
): Promise<DiscoveryResult> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers,
    });
    if (!res.ok) return { models: [], discovered: false };

    const body = (await res.json()) as {
      data?: { id: string; context_window?: number }[];
    };
    if (!body.data) return { models: [], discovered: false };

    return {
      // Some OpenAI-compatible endpoints (Groq-style) publish context_window
      // per model; others don't — read it when present.
      models: body.data.map((m) => ({
        modelId: m.id,
        label: null,
        contextWindow: toInt(m.context_window),
      })),
      discovered: true,
    };
  } catch {
    return { models: [], discovered: false };
  }
}

// ── Main entry ─────────────────────────────────────────────────────────

/**
 * Try to discover models from the provider's API.
 *
 * Returns `discovered: true` with the model list on success, or
 * `discovered: false` with an empty list on any failure (network,
 * auth, parsing, etc.).
 */
export async function discoverModels(
  provider: ProviderInfo,
): Promise<DiscoveryResult> {
  switch (provider.kind) {
    case "openai":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverOpenAI(provider.apiKey);

    case "anthropic":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverAnthropic(provider.apiKey);

    case "ollama":
      return discoverOllama(provider.baseUrl);

    case "google":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverGoogle(provider.apiKey);

    case "mistral":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverMistral(provider.apiKey);

    case "groq":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverGroq(provider.apiKey);

    case "openrouter":
      if (!provider.apiKey) return { models: [], discovered: false };
      return discoverOpenRouter(provider.apiKey);

    case "openai-compatible":
      if (!provider.baseUrl) return { models: [], discovered: false };
      return discoverOpenAICompatible(provider.baseUrl, provider.apiKey);

    default:
      return { models: [], discovered: false };
  }
}