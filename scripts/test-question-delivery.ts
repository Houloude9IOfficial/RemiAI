import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, eq } from "drizzle-orm";
import { convertToModelMessages, jsonSchema, stepCountIs, streamText, type UIMessage } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import * as schema from "../db/schema";
import { findActiveQuestions, formatQuestionAnswers, type QuestionsData } from "../lib/chat/questions";
import {
  acceptQuestionAnswers, finishQuestionRun, listQuestionSubmissions, pendingQuestionSubmissions,
  prepareQuestionAnswerStep, questionRuns, startQuestionRun, submissionMessage,
} from "../lib/chat/question-delivery";
import { continuePendingQuestionAnswers } from "../lib/chat/question-continuation";
import { periodicallyPersistMessages } from "../lib/chat/persist-interval";

const data: QuestionsData = {
  type: "questions", title: "Setup", count: 3, instruction: "Answer",
  questions: [
    { id: "single", question: "Choose", options: ["A", "B"], allowCustom: true, type: "single_select" },
    { id: "multi", question: "Features", options: ["one", "two"], allowCustom: true, type: "multi_select" },
    { id: "text", question: "Details", options: [], allowCustom: true, type: "free_text" },
  ],
};
const answers = [
  { questionId: "single", value: "A" },
  { questionId: "multi", value: ["one", "two"] },
  { questionId: "text", custom: "  Live answer  " },
];
const questionMessage = (id: string, callId: string): UIMessage => ({
  id, role: "assistant",
  parts: [{ type: "tool-ask_questions", toolCallId: callId, state: "output-available", input: {}, output: data }],
});
const sqlite = new Database(":memory:");
sqlite.pragma("foreign_keys = ON");
const database = drizzle(sqlite, { schema });
migrate(database, { migrationsFolder: path.resolve("db/migrations") });
// Migrations must remain safe to re-run at subsequent application starts.
migrate(database, { migrationsFolder: path.resolve("db/migrations") });
// Migration 0054 deliberately keeps the historical conversations migration
// immutable and relies on the startup compatibility repair for this additive
// column. This isolated in-memory migration test does not boot that repair.
sqlite.exec("ALTER TABLE conversations ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
function fixture() {
  const conversationId = database.insert(schema.conversations).values({ title: "Questions" }).returning().get().id;
  database.insert(schema.messages).values({ conversationId, uiId: `question-${conversationId}`, role: "assistant", parts: questionMessage(`question-${conversationId}`, `call-${conversationId}`).parts, orderIndex: 0 }).run();
  return { conversationId, toolCallId: `call-${conversationId}` };
}

async function main() {
  assert.match(formatQuestionAnswers(data, answers), /one, two/);
  assert.match(formatQuestionAnswers(data, answers), /\nLive answer\n?/);
  assert.equal((formatQuestionAnswers(data, data.questions.map((q) => ({ questionId: q.id, skipped: true }))).match(/Skipped/g) ?? []).length, 3);
  assert.throws(() => formatQuestionAnswers(data, answers.slice(1)), /every question/);
  assert.throws(() => formatQuestionAnswers(data, [{ ...answers[0], value: "invalid" }, ...answers.slice(1)]), /Invalid/);
  assert.throws(() => formatQuestionAnswers(data, [answers[0], answers[0], answers[2]]), /every question/);
  console.log("✓ validates and formats single, multiple, custom, free-text and skipped answers");

  const first = fixture();
  const input = { submissionId: crypto.randomUUID(), toolCallId: first.toolCallId, answers };
  const accepted = acceptQuestionAnswers(database, first.conversationId, input);
  assert.equal(acceptQuestionAnswers(database, first.conversationId, input).id, accepted.id);
  assert.equal(acceptQuestionAnswers(database, first.conversationId, { ...input, submissionId: crypto.randomUUID() }).id, accepted.id);
  assert.equal(listQuestionSubmissions(database, first.conversationId).length, 1);
  const later = questionMessage("later", "later-call");
  const combined = { ...questionMessage("first", first.toolCallId), parts: [...questionMessage("first", first.toolCallId).parts, ...later.parts] };
  assert.equal(findActiveQuestions([combined, submissionMessage(accepted)])?.id, "later-call");
  assert.equal(findActiveQuestions([questionMessage("first", first.toolCallId), submissionMessage(accepted)]), null);
  assert.equal(findActiveQuestions([questionMessage("legacy", "legacy-call"), { id: "user", role: "user", parts: [{ type: "text", text: "answer" }] }]), null);
  console.log("✓ retries are idempotent and answering an older set preserves newer questions");

  const duringTool = fixture();
  const run = startQuestionRun(duringTool.conversationId)!;
  run.questions.set("live-not-persisted", data);
  assert.equal(startQuestionRun(duringTool.conversationId), null);
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
  const toolStep = (id: string): LanguageModelV4StreamPart[] => [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: id, toolName: "work", input: "{}" },
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
  ];
  const model = new MockLanguageModelV4({ doStream: [
    { stream: convertArrayToReadableStream(toolStep("work-1")) },
    { stream: convertArrayToReadableStream(toolStep("work-2")) },
    { stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: "stream-start", warnings: [] }, { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: "Done" }, { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
    ]) },
  ] });
  let executions = 0;
  const result = streamText({
    model, messages: [{ role: "user", content: "Work while I answer" }], stopWhen: stepCountIs(4),
    tools: { work: {
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        if (++executions === 1) acceptQuestionAnswers(database, duringTool.conversationId, { submissionId: crypto.randomUUID(), toolCallId: "live-not-persisted", answers });
        return "tool result survives";
      },
    } },
    prepareStep: async ({ messages }) => ({ messages: (await prepareQuestionAnswerStep(database, duringTool.conversationId, messages, new Set())).messages }),
  });
  await result.consumeStream();
  assert.equal(model.doStreamCalls.length, 3);
  assert.doesNotMatch(JSON.stringify(model.doStreamCalls[0].prompt), /Live answer/);
  for (const call of model.doStreamCalls.slice(1)) {
    const prompt = JSON.stringify(call.prompt);
    assert.equal((prompt.match(/Live answer/g) ?? []).length, 1);
    assert.match(prompt, /tool result survives/);
  }
  assert.equal(pendingQuestionSubmissions(database, duringTool.conversationId).length, 0);
  finishQuestionRun(database, duringTool.conversationId, run, true);
  console.log("✓ answers arriving during execution enter the next model call once and persist in later calls");

  const initial = fixture();
  const initialAnswer = acceptQuestionAnswers(database, initial.conversationId, { submissionId: crypto.randomUUID(), toolCallId: initial.toolCallId, answers });
  const initialMessages = await convertToModelMessages([submissionMessage(initialAnswer)]);
  const prepared = await prepareQuestionAnswerStep(database, initial.conversationId, initialMessages, new Set([initialAnswer.messageId]));
  assert.equal(prepared.messages, initialMessages);
  assert.equal(prepared.deliveredCount, 1);
  console.log("✓ a follow-up request acknowledges answers already reconstructed in history without duplicating them");

  const late = fixture();
  const lateRun = startQuestionRun(late.conversationId)!;
  const lateRow = acceptQuestionAnswers(database, late.conversationId, { submissionId: crypto.randomUUID(), toolCallId: late.toolCallId, answers });
  let continuations = 0;
  const start = async (request: Request) => {
    ++continuations;
    const body = await request.json();
    assert.equal(body.questionContinuation, true);
    assert.equal(body.messages[0].id, lateRow.messageId);
    return new Response(null, { status: 204 });
  };
  assert.equal(continuePendingQuestionAnswers(database, "http://localhost/api/chat", new Headers(), late.conversationId, start), undefined);
  finishQuestionRun(database, late.conversationId, lateRun, true);
  const dispatched = continuePendingQuestionAnswers(database, "http://localhost/api/chat", new Headers(), late.conversationId, start);
  assert.ok(dispatched);
  assert.equal(continuePendingQuestionAnswers(database, "http://localhost/api/chat", new Headers(), late.conversationId, start), undefined);
  await dispatched;
  assert.equal(continuations, 1);
  assert.equal(pendingQuestionSubmissions(database, late.conversationId).length, 1);
  console.log("✓ late answers are durable and schedule exactly one follow-up after normal completion");

  for (const aborted of [false, true]) {
    const stopped = fixture();
    const stoppedRun = startQuestionRun(stopped.conversationId)!;
    acceptQuestionAnswers(database, stopped.conversationId, { submissionId: crypto.randomUUID(), toolCallId: stopped.toolCallId, answers });
    if (aborted) stoppedRun.controller.abort();
    finishQuestionRun(database, stopped.conversationId, stoppedRun, false);
    assert.equal(pendingQuestionSubmissions(database, stopped.conversationId).length, 1);
    assert.equal(pendingQuestionSubmissions(database, stopped.conversationId, true).length, 0);
    assert.equal(continuePendingQuestionAnswers(database, "http://localhost/api/chat", new Headers(), stopped.conversationId, start), undefined);
  }
  console.log("✓ Stop and errors retain answers for Continue without automatic restart");

  // Snapshot upserts must preserve the reserved assistant position despite live answers.
  const ordered = fixture();
  const orderedRun = startQuestionRun(ordered.conversationId)!;
  database.insert(schema.messages).values({ conversationId: ordered.conversationId, uiId: orderedRun.assistantId, role: "assistant", parts: [], orderIndex: 1 }).run();
  acceptQuestionAnswers(database, ordered.conversationId, { submissionId: crypto.randomUUID(), toolCallId: ordered.toolCallId, answers });
  const chunks = convertArrayToReadableStream([
    { type: "start", messageId: orderedRun.assistantId }, { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: "Still responding" }, { type: "text-end", id: "t" }, { type: "finish" },
  ]);
  await periodicallyPersistMessages(ordered.conversationId, [], chunks as Parameters<typeof periodicallyPersistMessages>[2], undefined, undefined, database);
  const rows = database.select().from(schema.messages).where(eq(schema.messages.conversationId, ordered.conversationId)).orderBy(asc(schema.messages.orderIndex)).all();
  assert.deepEqual(rows.map((row) => row.orderIndex), [0, 1, 2]);
  assert.equal(rows[1].uiId, orderedRun.assistantId);
  assert.equal(rows[2].role, "user");
  const prior: UIMessage = { id: orderedRun.assistantId, role: "assistant", parts: [{ type: "text", text: "Before Continue" }] };
  await periodicallyPersistMessages(ordered.conversationId, [prior], convertArrayToReadableStream([
    { type: "start", messageId: orderedRun.assistantId }, { type: "text-start", id: "next" },
    { type: "text-delta", id: "next", delta: "After Continue" }, { type: "text-end", id: "next" }, { type: "finish" },
  ]) as Parameters<typeof periodicallyPersistMessages>[2], undefined, undefined, database);
  const continued = database.select().from(schema.messages).where(eq(schema.messages.uiId, orderedRun.assistantId)).get()!;
  assert.deepEqual((continued.parts as Array<{ text: string }>).map((part) => part.text), ["Before Continue", "After Continue"]);
  database.delete(schema.messages).where(eq(schema.messages.conversationId, ordered.conversationId)).run();
  assert.equal(listQuestionSubmissions(database, ordered.conversationId).length, 0);
  finishQuestionRun(database, ordered.conversationId, orderedRun, false);
  console.log("✓ streamed snapshots preserve assistant reservation and answer transcript ordering");
  console.log("✅ Question delivery tests passed.");
}
main().finally(() => { questionRuns.clear(); sqlite.close(); }).catch((error) => { console.error(error); process.exitCode = 1; });
