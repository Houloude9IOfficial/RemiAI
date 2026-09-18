import assert from "node:assert/strict";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createAutoFailoverLanguageModel } from "@/lib/providers/factory";
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
}

void main();
