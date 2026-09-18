import { NextResponse } from "next/server";
import { z } from "zod";
import { db, initializeApp } from "@/db";
import { conversations, messages, questionSubmissions } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { acceptQuestionAnswers, listQuestionSubmissions, questionRuns, submissionMessage } from "@/lib/chat/question-delivery";

const inputSchema = z.object({
  submissionId: z.string().uuid(),
  toolCallId: z.string().min(1).max(200),
  answers: z.array(z.object({
    questionId: z.string().min(1).max(50),
    value: z.union([z.string().max(10000), z.array(z.string().max(200)).max(10)]).optional(),
    custom: z.string().max(10000).optional(),
    skipped: z.boolean().optional(),
  })).min(1).max(20),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await initializeApp();
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  const conversation = db.select().from(conversations).where(eq(conversations.id, conversationId)).get();
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (!conversation.providerId || !conversation.modelId) return NextResponse.json({ error: "Pick a model first" }, { status: 400 });
  try {
    const input = inputSchema.parse(await req.json());
    const row = acceptQuestionAnswers(db, conversationId, input);
    // Also covers answers submitted just after the previous stream finished.
    const { continuePendingQuestionAnswers } = await import("@/lib/chat/question-continuation");
    continuePendingQuestionAnswers(db, req.url, req.headers, conversationId);
    return NextResponse.json({ message: submissionMessage(row), toolCallId: row.toolCallId, delivered: row.delivered });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save answers" }, { status: 400 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await initializeApp();
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  const submissions = listQuestionSubmissions(db, conversationId);
  const run = questionRuns.get(conversationId);
  return NextResponse.json({
    mode: submissions.length ? db.select({ mode: conversations.mode }).from(conversations).where(eq(conversations.id, conversationId)).get()?.mode : null,
    resolvedIds: submissions.map((row) => row.toolCallId),
    activeAssistantId: run?.assistantId ?? null,
    initialAssistantMessage: run?.initialAssistantMessage ?? null,
    hasAutomaticPending: submissions.some((row) => !row.delivered && row.autoContinue),
    // Only fetch the full persisted transcript when question submissions exist.
    answerMessages: submissions.map(submissionMessage),
    messages: submissions.length && new URL(req.url).searchParams.get("transcript") === "1" ? db.select().from(messages).where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.orderIndex)).all().map((row) => ({ id: row.uiId, role: row.role, parts: row.parts })) : null,
  });
}

/** Explicit Stop cancels generation and keeps undelivered answers for Continue. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await initializeApp();
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  questionRuns.get(conversationId)?.controller.abort();
  db.update(questionSubmissions).set({ autoContinue: false }).where(and(
    eq(questionSubmissions.conversationId, conversationId), eq(questionSubmissions.delivered, false),
  )).run();
  return NextResponse.json({ ok: true });
}
