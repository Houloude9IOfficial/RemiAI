export const PROVIDER_MODEL_CATALOG: Record<string, { modelId: string; label: string }[]> = {
  anthropic: [
    { modelId: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { modelId: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { modelId: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { modelId: "gpt-4.1", label: "GPT-4.1" },
    { modelId: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  ],
  ollama: [
    { modelId: "llama3.1", label: "Llama 3.1" },
    { modelId: "qwen2.5", label: "Qwen 2.5" },
  ],
  "openai-compatible": [],
};

export const PROVIDER_PRESET_DEFAULTS: Record<
  string,
  { label: string; baseUrl: string | null; requiresApiKey: boolean }
> = {
  anthropic: { label: "Anthropic", baseUrl: null, requiresApiKey: true },
  openai: { label: "OpenAI", baseUrl: null, requiresApiKey: true },
  ollama: { label: "Ollama", baseUrl: "http://localhost:11434/v1", requiresApiKey: false },
  "openai-compatible": { label: "Custom (OpenAI-compatible)", baseUrl: "", requiresApiKey: false },
};

/**
 * Approximate context-window sizes (tokens) for known model families, used
 * to render the per-chat usage meter in the header (`used / context`). These
 * are the models' PUBLIC context limits; unknown/custom models fall back to
 * {@link DEFAULT_CONTEXT_WINDOW}. Treat every value as approximate — the
 * denominator is a UI reference, the numerator is the real tracked usage.
 */
export const MODEL_CONTEXT_WINDOWS: { prefix: string; tokens: number }[] = [
  // Anthropic Claude (200K standard context)
  { prefix: "claude", tokens: 200_000 },
  // OpenAI GPT-4.1 family (1M context)
  { prefix: "gpt-4.1", tokens: 1_047_576 },
  { prefix: "gpt-4o", tokens: 128_000 },
  { prefix: "gpt-4", tokens: 128_000 },
  { prefix: "gpt-3.5", tokens: 16_385 },
  { prefix: "o1", tokens: 200_000 },
  { prefix: "o3", tokens: 200_000 },
  { prefix: "o4", tokens: 200_000 },
  // Ollama / open-weight families
  { prefix: "llama3.1", tokens: 128_000 },
  { prefix: "llama3", tokens: 8_192 },
  { prefix: "llama", tokens: 128_000 },
  { prefix: "qwen2.5", tokens: 32_768 },
  { prefix: "qwen2", tokens: 32_768 },
  { prefix: "qwen", tokens: 32_768 },
  { prefix: "mistral", tokens: 32_768 },
  { prefix: "mixtral", tokens: 32_768 },
  { prefix: "gemma", tokens: 8_192 },
  { prefix: "phi", tokens: 128_000 },
  { prefix: "deepseek", tokens: 128_000 },
  { prefix: "command-r", tokens: 128_000 },
  { prefix: "grok", tokens: 131_072 },
];

/** Fallback context window for unknown/custom models (a common modern default). */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Resolve the approximate context-window size for a model id.
 * Matches the longest known prefix, falling back to the default.
 */
export function contextWindowFor(modelId: string): number {
  const id = (modelId ?? "").toLowerCase();
  let best: { prefix: string; tokens: number } | null = null;
  for (const entry of MODEL_CONTEXT_WINDOWS) {
    if (id.startsWith(entry.prefix) && (!best || entry.prefix.length > best.prefix.length)) {
      best = entry;
    }
  }
  return best?.tokens ?? DEFAULT_CONTEXT_WINDOW;
}
