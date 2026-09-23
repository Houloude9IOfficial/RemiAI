import assert from "node:assert/strict";
import {
  publishGenerationUpdate,
  generationSnapshot,
  subscribeGenerationEvents,
  isGenerationActive,
  type GenerationEvent,
} from "../lib/chat/generation-events";
import { streamRegistry } from "../lib/chat/stream-registry";

function descriptorFor(conversationId: number) {
  return generationSnapshot().find((d) => d.conversationId === conversationId) ?? null;
}

async function main() {
  // 1. A running generation is listed in the authoritative snapshot.
  const first = 900_000_001;
  publishGenerationUpdate({
    conversationId: first,
    status: "running",
    streamId: "stream-1",
    assistantMessageId: "assistant-1",
  });
  assert.deepEqual(descriptorFor(first), {
    conversationId: first,
    streamId: "stream-1",
    assistantMessageId: "assistant-1",
    status: "running",
  });
  assert.equal(isGenerationActive("running"), true);
  assert.equal(isGenerationActive("continuing"), true);
  assert.equal(isGenerationActive("completed"), false);

  // 2. A partial durable transition keeps the data clients need to reconnect.
  publishGenerationUpdate({ conversationId: first, status: "continuing" });
  assert.equal(descriptorFor(first)?.streamId, "stream-1");
  assert.equal(descriptorFor(first)?.assistantMessageId, "assistant-1");
  assert.equal(descriptorFor(first)?.status, "continuing");

  // 3. Subscribers receive changes; unsubscribing stops delivery.
  const received: GenerationEvent[] = [];
  const unsubscribe = subscribeGenerationEvents((event) => received.push(event));
  publishGenerationUpdate({ conversationId: first, status: "running" });
  unsubscribe();
  publishGenerationUpdate({ conversationId: first, status: "running" });
  assert.equal(received.length, 1);
  assert.equal(received[0].type, "generation");

  // 4. A terminal status publishes one inactive descriptor and removes it.
  const terminal: GenerationEvent[] = [];
  subscribeGenerationEvents((event) => terminal.push(event));
  publishGenerationUpdate({ conversationId: first, status: "completed", streamId: "stream-1" });
  assert.equal(descriptorFor(first), null);
  const last = terminal.at(-1);
  assert.ok(last?.type === "generation" && last.generation.status === "completed");

  // 5. A stale terminal event must not clear a newer active stream.
  const second = 900_000_002;
  publishGenerationUpdate({
    conversationId: second,
    status: "running",
    streamId: "new-stream",
    assistantMessageId: "assistant-2",
  });
  publishGenerationUpdate({ conversationId: second, status: "stopped", streamId: "old-stream" });
  assert.equal(descriptorFor(second)?.streamId, "new-stream");
  assert.equal(descriptorFor(second)?.status, "running");

  // 6. The stream registry publishes register/remove lifecycle changes.
  const third = 900_000_003;
  const registryEvents: GenerationEvent[] = [];
  const unsubscribeRegistry = subscribeGenerationEvents((event) => registryEvents.push(event));
  const source = new ReadableStream<string>({ start() { /* opened on demand */ } });
  streamRegistry.register(third, source, "stream-3", "assistant-3");
  assert.deepEqual(descriptorFor(third), {
    conversationId: third,
    streamId: "stream-3",
    assistantMessageId: "assistant-3",
    status: "running",
  });
  streamRegistry.remove(third, "Test stop");
  assert.equal(descriptorFor(third), null);
  const stopEvent = registryEvents.at(-1);
  assert.ok(stopEvent?.type === "generation" && stopEvent.generation.status === "stopped");
  unsubscribeRegistry();

  console.log("✅ Generation lifecycle event bus tests passed.");
}

void main();
