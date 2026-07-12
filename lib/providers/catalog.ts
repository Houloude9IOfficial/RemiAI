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
  ollama: { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", requiresApiKey: false },
  "openai-compatible": { label: "Custom (OpenAI-compatible)", baseUrl: "", requiresApiKey: false },
};
