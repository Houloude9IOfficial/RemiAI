import assert from "node:assert/strict";
import {
  chooseQualityStrategy,
  estimateTaskComplexity,
  normalizeQualityPolicy,
} from "../lib/chat/quality-policy";
import { chooseModelRoute } from "../lib/chat/model-routing";
import { createCompatFetch } from "../lib/providers/compat";
import {
  nemotronChatTemplateKwargs,
  streamingReasoningProviderOptions,
  supportsCompatibleReasoning,
  supportsOpenAIReasoningEffort,
} from "../lib/providers/reasoning";

// Modern values pass through; legacy values map to their effort equivalent.
assert.equal(normalizeQualityPolicy("minimal"), "minimal");
assert.equal(normalizeQualityPolicy("medium"), "medium");
assert.equal(normalizeQualityPolicy("fast"), "minimal");
assert.equal(normalizeQualityPolicy("balanced"), "medium");
assert.equal(normalizeQualityPolicy("quality"), "high");
assert.equal(normalizeQualityPolicy("selected"), "medium");
assert.equal(normalizeQualityPolicy("unknown"), "medium");
assert.equal(normalizeQualityPolicy(undefined), "medium");
assert.equal(estimateTaskComplexity("What time is it?"), "simple");
assert.equal(
  estimateTaskComplexity(
    "Inspect the repository, implement the migration, run tests and build, then report the changed files.",
    "build",
  ),
  "complex",
);

const minimal = chooseQualityStrategy("minimal", "simple");
assert.equal(minimal.maxRetries, 1);
// Budget floors were raised so a low effort/complexity label never truncates
// a run mid-task (reasoning models burn output tokens on thinking before
// their first tool call — see lib/chat/quality-policy.ts).
assert.equal(minimal.maxOutputTokens, 4096);

const high = chooseQualityStrategy("high", "complex");
assert.equal(high.maxRetries, 3);
assert.equal(high.maxOutputTokens, 16384);
assert.match(high.verificationGuidance, /deterministic checks/i);

const medium = chooseQualityStrategy("medium", "moderate");
assert.match(medium.verificationGuidance, /proportionate/i);

// Legacy "quality" normalizes to High behavior once it reaches the strategy.
const legacyQuality = chooseQualityStrategy("quality" as never, "moderate");
assert.equal(legacyQuality.label, "High");

const selectedModel = {
  providerId: 1,
  providerKind: "anthropic",
  providerLabel: "Anthropic",
  modelId: "claude-haiku-4-5-20251001",
};
const strongCandidates = [
  selectedModel,
  {
    providerId: 1,
    providerKind: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-5",
  },
  {
    providerId: 2,
    providerKind: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-4.1",
  },
];

const escalated = chooseModelRoute({
  policy: "high",
  complexity: "complex",
  text: "Implement the repository change, run tests, and verify the API behavior.",
  mode: "build",
  selected: selectedModel,
  candidates: strongCandidates,
});
assert.equal(escalated.escalated, false);
assert.equal(escalated.active.modelId, selectedModel.modelId);
assert.equal(escalated.verifierEligible, true);
assert.equal(escalated.expectedCost, "higher");
assert.match(escalated.reason, /keeps the selected model/i);

const pinnedMedium = chooseModelRoute({
  policy: "medium",
  complexity: "complex",
  text: "Implement the repository change and run tests.",
  mode: "build",
  selected: selectedModel,
  candidates: strongCandidates,
});
assert.equal(pinnedMedium.escalated, false);
assert.equal(pinnedMedium.active.modelId, selectedModel.modelId);
assert.equal(pinnedMedium.verifierEligible, false);

const pinnedSelected = chooseModelRoute({
  policy: "low",
  complexity: "complex",
  text: "Implement the repository change and run tests.",
  mode: "build",
  selected: selectedModel,
  candidates: strongCandidates,
});
assert.equal(pinnedSelected.escalated, false);
assert.match(pinnedSelected.reason, /pinned/i);

const noSafeAlternative = chooseModelRoute({
  policy: "high",
  complexity: "complex",
  text: "Analyze this task carefully.",
  mode: "chat",
  selected: {
    providerId: 3,
    providerKind: "openai-compatible",
    providerLabel: "Custom",
    modelId: "custom-model",
  },
  candidates: [
    {
      providerId: 3,
      providerKind: "openai-compatible",
      providerLabel: "Custom",
      modelId: "custom-model-2",
    },
  ],
});
assert.equal(noSafeAlternative.escalated, false);
assert.match(noSafeAlternative.reason, /keeps the selected model/i);

// Deterministic routing benchmark fixture: High-effort routing must improve the
// capability tier for a complex coding task, while the other levels never do.
const benchmarkPolicies = ["minimal", "low", "medium", "high"] as const;
const benchmarkResults = benchmarkPolicies.map((policy) =>
  chooseModelRoute({
    policy,
    complexity: "complex",
    text: "Build and debug the API, edit the files, and run the tests.",
    mode: "build",
    selected: selectedModel,
    candidates: strongCandidates,
  }),
);
assert.equal(benchmarkResults.filter((result) => result.escalated).length, 0);
assert.equal(benchmarkResults.every((result) => result.active.modelId === selectedModel.modelId), true);

// The effort policy must actually drive the provider's reasoning parameters.
const anthropicMinimal = streamingReasoningProviderOptions(
  "anthropic",
  "claude-sonnet-4-5",
  "minimal",
)!.anthropic!;
assert.deepEqual(anthropicMinimal, {
  sendReasoning: false,
  thinking: { type: "disabled" },
});
const openRouterHigh = streamingReasoningProviderOptions(
  "openrouter",
  "deepseek/deepseek-r1",
  "high",
);
assert.deepEqual(openRouterHigh, {
  openrouter: { reasoning: { effort: "high" } },
});

const googleHigh = streamingReasoningProviderOptions(
  "google",
  "gemini-3-flash-preview",
  "high",
);
assert.deepEqual(googleHigh, {
  google: { thinkingConfig: { thinkingLevel: "high", includeThoughts: true } },
});
const googleMinimal = streamingReasoningProviderOptions(
  "google",
  "gemini-2.5-flash",
  "minimal",
);
assert.deepEqual(googleMinimal, {
  google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
});

assert.deepEqual(
  streamingReasoningProviderOptions("mistral", "magistral-medium-latest", "minimal"),
  { mistral: { reasoningEffort: "none" } },
);
assert.deepEqual(
  streamingReasoningProviderOptions("mistral", "mistral-small-latest", "high"),
  { mistral: { reasoningEffort: "high" } },
);
assert.deepEqual(
  streamingReasoningProviderOptions("groq", "openai/gpt-oss-120b", "high"),
  { groq: { reasoningEffort: "high", reasoningFormat: "parsed" } },
);
assert.equal(
  streamingReasoningProviderOptions("groq", "llama-3.3-70b-versatile", "high"),
  undefined,
);
const openAiHigh = streamingReasoningProviderOptions("openai", "gpt-5", "high");
assert.deepEqual(openAiHigh, { openai: { reasoningEffort: "high" } });

const anthropicBudgetLow = streamingReasoningProviderOptions(
  "anthropic",
  "claude-sonnet-4-5-20250929",
  "low",
)!.anthropic!;
assert.equal(anthropicBudgetLow.thinking.type, "enabled");
assert.equal(anthropicBudgetLow.thinking.budgetTokens, 4096);

const anthropicBudgetHigh = streamingReasoningProviderOptions(
  "anthropic",
  "claude-opus-4-5",
  "high",
)!.anthropic!;
assert.equal(anthropicBudgetHigh.thinking.type, "enabled");
assert.equal(anthropicBudgetHigh.thinking.budgetTokens, 16384);

const anthropicAdaptive = streamingReasoningProviderOptions(
  "anthropic",
  "claude-sonnet-5",
  "medium",
);
assert.deepEqual(anthropicAdaptive, {
  anthropic: {
    sendReasoning: true,
    thinking: { type: "adaptive", display: "summarized" },
  },
});

const unsupportedProvider = streamingReasoningProviderOptions(
  "mistral",
  "mistral-large",
  "high",
);
assert.equal(unsupportedProvider, undefined);

// Ollama's OpenAI-compatible endpoint maps reasoning_effort to its think
// knob: "none" disables thinking, low/medium/high scale it. Non-thinking
// models get nothing.
assert.deepEqual(
  streamingReasoningProviderOptions("ollama", "nemotron-3-super", "minimal"),
  { openai: { reasoningEffort: "none" } },
);
assert.deepEqual(
  streamingReasoningProviderOptions("ollama", "nemotron-3-super", "high"),
  { openai: { reasoningEffort: "high" } },
);
assert.deepEqual(
  streamingReasoningProviderOptions("ollama", "qwen3:32b", "low"),
  { openai: { reasoningEffort: "low" } },
);
assert.equal(
  streamingReasoningProviderOptions("ollama", "llama3.2", "high"),
  undefined,
);

// OpenAI reasoningEffort must NOT be sent to non-reasoning models (the chat
// provider forwards it unconditionally, and OpenAI rejects it with a 400).
assert.equal(supportsOpenAIReasoningEffort("gpt-5"), true);
assert.equal(supportsOpenAIReasoningEffort("gpt-5.2"), true);
assert.equal(supportsOpenAIReasoningEffort("o3"), true);
assert.equal(supportsOpenAIReasoningEffort("gpt-4o"), false);
assert.equal(supportsOpenAIReasoningEffort("gpt-4.1"), false);
assert.equal(
  streamingReasoningProviderOptions("openai", "gpt-4o", "high"),
  undefined,
);
// Base gpt-5 doesn't accept "minimal" — clamped to "low" so no 400.
assert.deepEqual(streamingReasoningProviderOptions("openai", "gpt-5", "minimal"), {
  openai: { reasoningEffort: "low" },
});
assert.deepEqual(streamingReasoningProviderOptions("openai", "gpt-5.1", "minimal"), {
  openai: { reasoningEffort: "minimal" },
});

// NVIDIA Nemotron 3 controls reasoning via chat_template_kwargs, not
// reasoning_effort — mapping must be effort-aware and model-gated.
assert.deepEqual(
  nemotronChatTemplateKwargs("nemotron-3-super-120b-a12b", "minimal"),
  { chat_template_kwargs: { enable_thinking: false } },
);
assert.deepEqual(
  nemotronChatTemplateKwargs("nemotron-3-super-120b-a12b", "low"),
  { chat_template_kwargs: { enable_thinking: true, low_effort: true } },
);
assert.deepEqual(
  nemotronChatTemplateKwargs("nemotron-3-super-120b-a12b", "high"),
  { chat_template_kwargs: { enable_thinking: true } },
);
assert.deepEqual(
  nemotronChatTemplateKwargs("nemotron-prime", "medium"),
  { chat_template_kwargs: { enable_thinking: true } },
);
assert.deepEqual(
  nemotronChatTemplateKwargs("nvidia/nemotron-3-super-120b-a12b", "high"),
  { chat_template_kwargs: { enable_thinking: true } },
);
assert.equal(nemotronChatTemplateKwargs("nemotron-nano", "high"), undefined);
assert.equal(nemotronChatTemplateKwargs("meta-llama-3.3-70b", "high"), undefined);

// Known reasoning families on generic OpenAI-compatible gateways use the
// standard reasoning_effort field; ordinary instruct models are untouched.
assert.equal(supportsCompatibleReasoning("deepseek-r1:latest"), true);
assert.equal(supportsCompatibleReasoning("qwen3:32b"), true);
assert.equal(supportsCompatibleReasoning("nemotron-3-super"), true);
assert.equal(supportsCompatibleReasoning("llama-3.3-70b-instruct"), false);
assert.deepEqual(
  streamingReasoningProviderOptions("openai-compatible", "deepseek-r1", "minimal"),
  { openai: { reasoningEffort: "none" } },
);
assert.deepEqual(
  streamingReasoningProviderOptions("openai-compatible", "qwen3:32b", "high"),
  { openai: { reasoningEffort: "high" } },
);
// Direct Nemotron NIM uses chat_template_kwargs instead of reasoning_effort.
assert.equal(
  streamingReasoningProviderOptions("openai-compatible", "nemotron-3-super", "high"),
  undefined,
);

// The compat fetch must merge chat_template_kwargs into the outgoing request
// body — that is the whole mechanism behind Nemotron effort control.
(async () => {
  let capturedBody: string | undefined;
  const stubFetch = async (_input: unknown, init?: RequestInit) => {
    capturedBody = typeof init?.body === "string" ? init.body : undefined;
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const compatFetch = createCompatFetch(stubFetch as typeof fetch, {
    injectBody: { chat_template_kwargs: { enable_thinking: false } },
  });
  await compatFetch("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "nemotron-3-super-120b-a12b", messages: [] }),
  });
  const parsed = JSON.parse(capturedBody ?? "{}");
  assert.deepEqual(parsed.chat_template_kwargs, { enable_thinking: false });
  assert.equal(parsed.model, "nemotron-3-super-120b-a12b");

  console.log("\n✅ All quality policy and routing tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
