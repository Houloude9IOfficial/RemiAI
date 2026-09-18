// Exercises the actual chat handlers against a local OpenAI-compatible mock.
// All storage is isolated; startup services stay off in this test process.
// Run: node scripts/test-live-question-route.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (!process.argv.includes("--isolated-child")) {
  const directory = await mkdtemp(path.join(tmpdir(), "remi-live-questions-"));
  try {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--isolated-child"], {
      stdio: "inherit", env: { ...process.env, REMI_DATA_DIR: directory, NEXT_PHASE: "phase-production-build" },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally { await rm(directory, { recursive: true, force: true }); }
} else {
  const { db, initializeApp } = await import("../db/index.ts");
  const schema = await import("../db/schema.ts");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  migrate(db, { migrationsFolder: path.resolve("db/migrations") });
  await initializeApp();
  const chat = await import("../app/api/chat/route.ts");
  const answersApi = await import("../app/api/chat/[id]/question-answers/route.ts");
  const delivery = await import("../lib/chat/question-delivery.ts");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitUntil(predicate) {
    const until = Date.now() + 12000;
    while (!predicate()) { if (Date.now() > until) throw new Error("Integration timed out"); await sleep(10); }
  }
  let phase = "live";
  let call = 0;
  let finalGate;
  const requests = [];
  const mock = createServer(async (req, res) => {
    let text = ""; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text); requests.push(body); const number = ++call;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (delta, reason = null) => res.write(`data: ${JSON.stringify({ id: `completion-${number}`, object: "chat.completion.chunk", created: 1, model: "mock", choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`);
    if (number === 1) {
      const question = { title: "Live setup", questions: [{ id: "answer", question: "What should I use?", type: "free_text", options: [], allowCustom: true }] };
      const tools = [{ index: 0, id: `${phase}-questions`, type: "function", function: { name: "ask_questions", arguments: JSON.stringify(question) } }];
      if (phase !== "late") tools.push({ index: 1, id: `${phase}-delay`, type: "function", function: { name: "delay", arguments: JSON.stringify({ ms: 800 }) } });
      emit({ role: "assistant", tool_calls: tools }); emit({}, "tool_calls");
    } else {
      emit({ role: "assistant", content: number === 2 ? "Current response." : "Answers received." });
      if (phase === "late" && number === 2) await new Promise((resolve) => { finalGate = resolve; });
      emit({}, "stop");
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const provider = db.insert(schema.providers).values({ kind: "openai-compatible", isPreset: false, label: "Test mock", baseUrl: `http://127.0.0.1:${mock.address().port}/v1`, apiKey: "test" }).returning().get();
  function conversation() { return db.insert(schema.conversations).values({ title: "Live integration", providerId: provider.id, modelId: "mock", memoryEnabled: false, mode: "plan" }).returning().get(); }
  function request(id) { return new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: id, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Ask a setup question, then delay while I answer." }] }] }) }); }
  async function submit(id) {
    const response = await answersApi.POST(new Request(`http://localhost/api/chat/${id}/question-answers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submissionId: crypto.randomUUID(), toolCallId: `${phase}-questions`, answers: [{ questionId: "answer", custom: "Immediate answer" }] }) }), { params: Promise.resolve({ id: String(id) }) });
    assert.equal(response.status, 200, await response.clone().text());
  }
  async function consume(response, onQuestion) {
    assert.equal(response.status, 200, response.status === 200 ? "" : await response.text());
    let buffer = "";
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      const parts = buffer.split("\n\n"); buffer = parts.pop();
      for (const part of parts) {
        if (!part.startsWith("data: ") || part === "data: [DONE]") continue;
        const event = JSON.parse(part.slice(6));
        if (event.type === "tool-output-available" && event.toolCallId === `${phase}-questions`) await onQuestion();
        if (event.type === "error") throw new Error(event.errorText);
      }
    }
  }
  try {
    const live = conversation();
    const liveResponse = await chat.POST(request(live.id));
    await consume(liveResponse, () => submit(live.id));
    await waitUntil(() => !delivery.questionRuns.has(live.id));
    assert.equal(call, 2);
    assert.equal((JSON.stringify(requests[1].messages).match(/Immediate answer/g) || []).length, 1);
    assert.equal(delivery.pendingQuestionSubmissions(db, live.id).length, 0);
    console.log("✓ actual chat route receives answers during a tool execution without interruption");

    phase = "late"; call = 0; requests.length = 0;
    const late = conversation();
    const lateResponse = await chat.POST(request(late.id));
    const consumed = consume(lateResponse, async () => {});
    await waitUntil(() => typeof finalGate === "function");
    await submit(late.id); finalGate(); await consumed;
    await waitUntil(() => call === 3 && !delivery.questionRuns.has(late.id));
    assert.match(JSON.stringify(requests[2].messages), /Immediate answer/);
    assert.equal(delivery.pendingQuestionSubmissions(db, late.id).length, 0);
    console.log("✓ actual late-answer submission starts and persists one automatic follow-up");

    phase = "stop"; call = 0; requests.length = 0;
    const stopped = conversation();
    const stoppedResponse = await chat.POST(request(stopped.id));
    try {
      await consume(stoppedResponse, async () => {
        await submit(stopped.id);
        await answersApi.DELETE(new Request(`http://localhost/api/chat/${stopped.id}/question-answers`, { method: "DELETE" }), { params: Promise.resolve({ id: String(stopped.id) }) });
      });
    } catch (error) { assert.match(String(error), /abort|cancel|interrupt/i); }
    await waitUntil(() => !delivery.questionRuns.has(stopped.id));
    assert.equal(call, 1);
    assert.equal(delivery.pendingQuestionSubmissions(db, stopped.id).length, 1);
    assert.equal(delivery.pendingQuestionSubmissions(db, stopped.id, true).length, 0);
    console.log("✓ actual Stop aborts generation and retains undelivered answers without restarting");
    console.log("✅ Live question route integration passed.");
  } finally { mock.closeAllConnections(); await new Promise((resolve) => mock.close(resolve)); }
  process.exit(0);
}
