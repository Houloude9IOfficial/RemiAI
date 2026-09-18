import assert from "node:assert/strict";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createAutoFailoverLanguageModel } from "@/lib/providers/factory";
import {
  preferProviderCandidates,
  resolveLanguageModel,
  type ModelCandidate,
} from "@/lib/providers/resolve-model";
import { AUTO_MODEL_ID } from "@/lib/chat/auto-model";

let firstCalls = 0;
let secondCalls = 0;

const first = {
  specificationVersion: "v4",
  provider: "first",
  modelId: "first-model",
  supportedUrls: {},
  doGenerate: async () => {
    throw new Error("First provider is unavailable");
  },
  doStream: async () => {
    firstCalls += 1;
    throw new Error("First provider is unavailable");
  },
} as unknown as LanguageModelV4;

const second = {
  specificationVersion: "v4",
  provider: "second",
  modelId: "second-model",
  supportedUrls: {},
  doGenerate: async () => ({}) as never,
  doStream: async () => {
    secondCalls += 1;
    return { stream: new ReadableStream() } as never;
  },
} as unknown as LanguageModelV4;

async function main() {
  const auto = createAutoFailoverLanguageModel([first, second]);
  await auto.doStream({} as never);

  assert.equal(auto.modelId, AUTO_MODEL_ID);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  console.log("✓ Auto model advances to the next enabled model after a startup failure");

  // Concrete model ids must pass straight through to the provider model
  // (no Auto candidate lookup, so no database access).
  // `ollama` needs no API key, so this stays offline.
  const provider = {
    id: 1,
    kind: "ollama",
    apiKey: null,
    baseUrl: null,
  } as unknown as Parameters<typeof resolveLanguageModel>[0];
  const concrete = await resolveLanguageModel(provider, "gpt-4o-mini");
  assert.equal((concrete as { modelId?: string }).modelId, "gpt-4o-mini");
  console.log("✓ resolveLanguageModel passes concrete model ids through unchanged");

  // Auto tries the conversation's own provider first, then the rest in order.
  const candidate = (providerId: number, modelId: string) =>
    ({ provider: { id: providerId } as never, modelId }) as ModelCandidate;
  const ordered = preferProviderCandidates(
    [candidate(1, "a"), candidate(2, "b"), candidate(1, "c")],
    1,
  );
  assert.deepEqual(
    ordered.map((item) => `${item.provider.id}/${item.modelId}`),
    ["1/a", "1/c", "2/b"],
  );
  const unknownProvider = preferProviderCandidates([candidate(1, "a")], 9);
  assert.equal(unknownProvider.length, 1);
  assert.equal(unknownProvider[0].modelId, "a");
  console.log("✓ Auto candidate ordering prefers the conversation's provider");
}

void main();
