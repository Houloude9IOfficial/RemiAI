import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { providers } from "@/db/schema";
import { createCompatFetch } from "./compat";

type ProviderRow = typeof providers.$inferSelect;

export function getLanguageModel(provider: ProviderRow, modelId: string): LanguageModel {
  switch (provider.kind) {
    case "anthropic":
      return createAnthropic({ apiKey: provider.apiKey ?? undefined })(modelId);
    case "openai":
      // .chat() targets the Chat Completions API, which every OpenAI-compatible
      // provider (incl. real OpenAI) implements — the default call signature
      // targets the Responses API, which is OpenAI-only.
      return createOpenAI({ apiKey: provider.apiKey ?? undefined }).chat(modelId);
    case "ollama":
      return createOpenAI({
        baseURL: provider.baseUrl ?? "http://localhost:11434/v1",
        apiKey: provider.apiKey ?? "ollama",
        fetch: createCompatFetch(),
      }).chat(modelId);
    case "openai-compatible":
      return createOpenAI({
        baseURL: provider.baseUrl!,
        apiKey: provider.apiKey ?? undefined,
        fetch: createCompatFetch(),
      }).chat(modelId);
  }
}
