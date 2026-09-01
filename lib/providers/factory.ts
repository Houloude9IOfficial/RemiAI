import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogle } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";
import type { providers } from "@/db/schema";
import { createCompatFetch } from "./compat";
import { nemotronChatTemplateKwargs } from "./reasoning";
import type { QualityPolicy } from "@/lib/chat/quality-policy";

type ProviderRow = typeof providers.$inferSelect;

export function getLanguageModel(
  provider: ProviderRow,
  modelId: string,
  // Per-request reasoning-effort policy; consumed where the provider needs a
  // request-body knob rather than provider options. NVIDIA Nemotron via the
  // OpenAI-compatible API uses `chat_template_kwargs`; Ollama and plain
  // OpenAI routing use providerOptions (see lib/providers/reasoning.ts).
  effort: QualityPolicy = "medium",
): LanguageModel {
  // NVIDIA reasoning models (Nemotron 3) served through a direct OpenAI-
  // compatible NIM endpoint control reasoning depth via chat_template_kwargs
  // in the request body, keyed on the effort policy. Undefined for every other
  // model, so the request body stays untouched.
  const templateKwargs = nemotronChatTemplateKwargs(modelId, effort);
  switch (provider.kind) {
    case "anthropic":
      return createAnthropic({ apiKey: provider.apiKey ?? undefined })(modelId);
    case "openai":
      // .chat() targets the Chat Completions API, which every OpenAI-compatible
      // provider (incl. real OpenAI) implements — the default call signature
      // targets the Responses API, which is OpenAI-only.
      return createOpenAI({ apiKey: provider.apiKey ?? undefined }).chat(modelId);
    case "google":
      // Native Google Generative Language API (Gemini). Reasoning/thinking
      // streams natively as reasoning parts for models that support it.
      return createGoogle({ apiKey: provider.apiKey ?? undefined }).chat(modelId);
    case "mistral":
      return createMistral({ apiKey: provider.apiKey ?? undefined }).chat(modelId);
    case "groq":
      // The Groq provider exposes `languageModel` (no `chat` alias).
      return createGroq({ apiKey: provider.apiKey ?? undefined }).languageModel(modelId);
    case "openrouter":
      // Native OpenRouter provider — handles `reasoning_details` deltas for
      // reasoning models (DeepSeek, Qwen, etc.) and passes through provider
      // metadata (model routing info) via providerOptions.
      return createOpenRouter({ apiKey: provider.apiKey ?? undefined }).chat(modelId);
    case "ollama": {
      const model = createOpenAI({
        baseURL: provider.baseUrl ?? "http://localhost:11434/v1",
        apiKey: provider.apiKey ?? "ollama",
        // convertReasoningToThink folds Ollama's `delta.reasoning` stream field
        // into `<think>`-wrapped content (the @ai-sdk/openai provider drops the
        // field otherwise, so no SDK middleware could ever see it). Reasoning
        // effort itself rides providerOptions.openai.reasoningEffort, which the
        // OpenAI-compatible endpoint maps to its internal think knob ("none"
        // disables thinking for capable models).
        fetch: createCompatFetch(undefined, { convertReasoningToThink: true }),
      }).chat(modelId);

      // Ollama reasoning models stream thinking either as a `reasoning` delta
      // field (converted to  thinking content above) or as ordinary text already
      // wrapped in `<think>...</think>` response (older servers / models). extractReasoning-
      // Middleware turns both into AI SDK reasoning parts. Models that emit
      // neither pass through unchanged.
      return wrapLanguageModel({
        model,
        middleware: [
          extractReasoningMiddleware({
            tagName: "think",
            separator: "\n",
          }),
        ],
      });
    }
    case "openai-compatible": {
      const model = createOpenAI({
        baseURL: provider.baseUrl!,
        apiKey: provider.apiKey ?? undefined,
        // Reasoning models (OpenRouter, DeepSeek, etc.) stream thinking in a
        // `reasoning` / `reasoning_content` delta field that @ai-sdk/openai
        // drops. convertReasoningToThink folds it into `<think>` content so
        // extractReasoningMiddleware below surfaces it in the UI. NVIDIA NIM
        // endpoints additionally receive chat_template_kwargs (injected into
        // the request body) to honor the effort policy.
        fetch: createCompatFetch(undefined, {
          convertReasoningToThink: true,
          ...(templateKwargs ? { injectBody: templateKwargs } : {}),
        }),
      }).chat(modelId);

      return wrapLanguageModel({
        model,
        middleware: [
          extractReasoningMiddleware({
            tagName: "think",
            separator: "\n",
          }),
        ],
      });
    }
  }
}