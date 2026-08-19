import assert from "node:assert/strict";
import { createRunTrace } from "../lib/observability/run-trace";

const trace = createRunTrace({
  kind: "test",
  conversationId: 7,
  parentTraceId: "parent-trace",
});

trace.event("request.received", {
  method: "POST",
  prompt: "must not be stored",
  messageText: "must not be stored",
  path: "/Users/example/private.txt",
  url: "https://example.com/private",
});
trace.metric("activeToolCount", 3);
trace.metric("inputTokens", 42);
trace.modelCallStart({ callId: "call-1", provider: "test", modelId: "mock" });
trace.modelCallEnd({
  callId: "call-1",
  provider: "test",
  modelId: "mock",
  inputTokens: 42,
  outputTokens: 12,
  responseTimeMs: 25,
  timeToFirstOutputMs: 9,
  finishReason: "stop",
});
trace.toolStart("read_file", "tool-1");
trace.toolEnd("read_file", 5, true, "tool-1");
trace.step(0, { inputTokens: 42, outputTokens: 12, toolCallCount: 1 });

const record = trace.toRecord("completed", { finishReason: "stop" });
const serialized = JSON.stringify(record);

assert.equal(record.version, 1);
assert.equal(record.traceId.length, 36);
assert.equal(record.parentTraceId, "parent-trace");
assert.equal(record.conversationId, 7);
assert.equal(record.state, "completed");
assert.equal(record.metrics.activeToolCount, 3);
assert.equal(record.metrics.inputTokens, 84);
assert.equal(record.metrics.outputTokens, 12);
assert.equal(record.metrics.providerCallCount, 1);
assert.equal(record.metrics.toolExecutionCount, 1);
assert.equal(record.metrics.modelStepCount, 1);
assert.equal(record.metrics.timeToFirstOutputMs, 9);
assert.equal(serialized.includes("must not be stored"), false);
assert.equal(serialized.includes("private.txt"), false);
assert.equal(serialized.includes("example.com/private"), false);

console.log("\n✅ All observability tests passed.");
