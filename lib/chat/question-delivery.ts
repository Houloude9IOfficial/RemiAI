import { and, asc, desc, eq } from "drizzle-orm";
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { findQuestionsById, formatQuestionAnswers, type QuestionAnswerSubmission, type QuestionsData } from "./questions";

export type QuestionDatabase = BetterSQLite3Database<typeof schema>;
type Database = QuestionDatabase;
export interface QuestionRun {
  id: string;
  generationRunId: string;
  assistantId: string;
  controller: AbortController;
  /** Number of server-owned follow-up turns already used for this user run. */
  continuationCount: number;
  initialAssistantMessage?: UIMessage;
  questions: Map<string, QuestionsData>;
}
// Route bundles and Fast Refresh must share the same running-request guards.
const globalRuns = globalThis as typeof globalThis & { remiQuestionRuns?: Map<number, QuestionRun> };
export const questionRuns = globalRuns.remiQuestionRuns ??= new Map<number, QuestionRun>();

export function startQuestionRun(
  conversationId: number,
  continuationCount = 0,
  generationRunId?: string,
): QuestionRun | null {
  if (questionRuns.has(conversationId)) return null;
  const run: QuestionRun = {
    id: crypto.randomUUID(),
    generationRunId: generationRunId ?? crypto.randomUUID(),
    assistantId: crypto.randomUUID(),
    controller: new AbortController(),
    continuationCount,
    questions: new Map(),
  };
  questionRuns.set(conversationId, run);
  return run;
}

export function submissionMessage(row: typeof schema.questionSubmissions.$inferSelect): UIMessage {
  return {
    id: row.messageId,
    role: "user",
    parts: [
      { type: "text", text: row.text },
      { type: "data-question-answer", data: { toolCallId: row.toolCallId, submissionId: row.id } },
    ],
  };
}

export function listQuestionSubmissions(database: Database, conversationId: number) {
  return database.select().from(schema.questionSubmissions)
    .where(eq(schema.questionSubmissions.conversationId, conversationId)).all();
}

export function pendingQuestionSubmissions(database: Database, conversationId: number, automaticOnly = false) {
  return listQuestionSubmissions(database, conversationId).filter((row) => !row.delivered && (!automaticOnly || row.autoContinue));
}

/** Synchronous transaction keeps idempotency, message ordering and acceptance atomic. */
export function acceptQuestionAnswers(database: Database, conversationId: number, input: QuestionAnswerSubmission) {
  return database.transaction((tx) => {
    const existing = tx.select().from(schema.questionSubmissions)
      .where(and(eq(schema.questionSubmissions.conversationId, conversationId), eq(schema.questionSubmissions.toolCallId, input.toolCallId))).get();
    if (existing) return existing;
    if (tx.select().from(schema.questionSubmissions).where(eq(schema.questionSubmissions.id, input.submissionId)).get()) {
      throw new Error("Submission ID already used.");
    }
    const history = tx.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId))
      .orderBy(asc(schema.messages.orderIndex)).all().map((row) => ({ id: row.uiId, role: row.role, parts: row.parts } as UIMessage));
    const data = questionRuns.get(conversationId)?.questions.get(input.toolCallId) ?? findQuestionsById(history, input.toolCallId);
    if (!data) throw new Error("Question set not found.");
    const text = formatQuestionAnswers(data, input.answers);
    const row = {
      id: input.submissionId, conversationId, toolCallId: input.toolCallId,
      messageId: `question-answer-${input.submissionId}`, text,
      delivered: false,
      autoContinue: !questionRuns.get(conversationId)?.controller.signal.aborted,
    };
    const message = submissionMessage(row);
    const last = tx.select({ orderIndex: schema.messages.orderIndex }).from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId)).orderBy(desc(schema.messages.orderIndex)).get();
    tx.insert(schema.messages).values({
      uiId: message.id, conversationId, role: "user", parts: message.parts, orderIndex: (last?.orderIndex ?? -1) + 1,
    }).run();
    return tx.insert(schema.questionSubmissions).values(row).returning().get();
  });
}

export function markQuestionAnswersDelivered(database: Database, ids: string[]) {
  database.transaction((tx) => {
    for (const id of ids) tx.update(schema.questionSubmissions).set({ delivered: true }).where(eq(schema.questionSubmissions.id, id)).run();
  });
}

export async function prepareQuestionAnswerStep(database: Database, conversationId: number, messages: ModelMessage[], initialMessageIds: Set<string>) {
  const pending = pendingQuestionSubmissions(database, conversationId);
  const additions = pending.filter((row) => !initialMessageIds.has(row.messageId));
  const converted = additions.length ? await convertToModelMessages(additions.map(submissionMessage)) : [];
  markQuestionAnswersDelivered(database, pending.map((row) => row.id));
  return { messages: converted.length ? [...messages, ...converted] : messages, deliveredCount: pending.length };
}

export function finishQuestionRun(database: Database, conversationId: number, run: QuestionRun, successful: boolean) {
  if (questionRuns.get(conversationId) !== run) return;
  if (!successful) database.update(schema.questionSubmissions).set({ autoContinue: false })
    .where(and(eq(schema.questionSubmissions.conversationId, conversationId), eq(schema.questionSubmissions.delivered, false))).run();
  questionRuns.delete(conversationId);
}
