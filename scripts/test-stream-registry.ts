import assert from "node:assert/strict";
import { streamRegistry } from "../lib/chat/stream-registry";

async function main() {
  const conversationId = 987_654_321;
  let source!: ReadableStreamDefaultController<string>;
  const input = new ReadableStream<string>({
    start(controller) { source = controller; },
  });

  const streamId = streamRegistry.register(conversationId, input, "test-stream");
  assert.equal(streamId, "test-stream");
  assert.equal(streamRegistry.has(conversationId), true);
  assert.equal(streamRegistry.id(conversationId), "test-stream");

  source.enqueue("data: first\n\n");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const first = streamRegistry.get(conversationId)!.getReader();
  const second = streamRegistry.get(conversationId)!.getReader();
  assert.equal((await first.read()).value, "data: first\n\n");
  assert.equal((await second.read()).value, "data: first\n\n");

  source.enqueue("data: second\n\n");
  assert.equal((await first.read()).value, "data: second\n\n");
  assert.equal((await second.read()).value, "data: second\n\n");

  await first.cancel();
  source.close();
  assert.equal((await second.read()).done, true);
  assert.equal(streamRegistry.has(conversationId), false);

  const replay = streamRegistry.get(conversationId)!.getReader();
  assert.equal((await replay.read()).value, "data: first\n\n");
  assert.equal((await replay.read()).value, "data: second\n\n");
  assert.equal((await replay.read()).done, true);

  streamRegistry.remove(conversationId);
  assert.equal(streamRegistry.get(conversationId), null);
  console.log("✅ Replayable multi-subscriber chat stream tests passed.");
}

void main();
