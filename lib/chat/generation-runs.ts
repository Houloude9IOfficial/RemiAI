import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chatGenerationRuns } from "@/db/schema";
import { continueInterruptedGeneration, MAX_SERVER_CONTINUATIONS } from "./server-continuation";
import { publishGenerationUpdate, type GenerationStatus } from "./generation-events";

export type ChatGenerationRunStatus =
  | "running"
  | "continuing"
  | "completed"
  | "failed"
  | "stopped"
  | "needs_attention";

export async function beginDurableGeneration(input: {
  id: string;
  conversationId: number;
  assistantMessageId: string;
  continuationCount: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(chatGenerationRuns).values({
    id: input.id,
    conversationId: input.conversationId,
    assistantMessageId: input.assistantMessageId,
    status: "running",
    continuationCount: input.continuationCount,
    maxContinuations: MAX_SERVER_CONTINUATIONS,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: chatGenerationRuns.id,
    set: {
      assistantMessageId: input.assistantMessageId,
      status: "running",
      continuationCount: input.continuationCount,
      error: null,
      completedAt: null,
      updatedAt: now,
    },
  }).run();
  publishGenerationUpdate({
    conversationId: input.conversationId,
    assistantMessageId: input.assistantMessageId,
    status: "running",
    // The run is starting fresh; the registry publishes its own stream id
    // when the stream is actually registered.
    streamId: null,
  });
}

export async function finishDurableGeneration(input: {
  id: string;
  status: ChatGenerationRunStatus;
  error?: string | null;
}): Promise<void> {
  const terminal = ["completed", "failed", "stopped", "needs_attention"].includes(input.status);
  await db.update(chatGenerationRuns).set({
    status: input.status,
    error: input.error ?? null,
    updatedAt: new Date().toISOString(),
    completedAt: terminal ? new Date().toISOString() : null,
  }).where(eq(chatGenerationRuns.id, input.id)).run();

  // Publish the row's authoritative status so clients reconcile without
  // polling. Reading it back also avoids emitting a stale transition when a
  // newer run already took over the same id (server continuations reuse it).
  // Lifecycle publishing must never break the generation's completion path.
  try {
    const row = await db.select().from(chatGenerationRuns)
      .where(eq(chatGenerationRuns.id, input.id))
      .get();
    if (row) {
      publishGenerationUpdate({
        conversationId: row.conversationId,
        assistantMessageId: row.assistantMessageId,
        status: row.status as GenerationStatus,
        // A continuation ends the current stream; the follow-up run registers
        // its own id, so clients must not keep pointing at the finished one.
        streamId: row.status === "continuing" ? null : undefined,
      });
    }
  } catch {
    // A failed read-back leaves the descriptor to be reconciled by the next
    // snapshot/reconnect.
  }
}

export async function activeDurableRun(conversationId: number) {
  return db.select().from(chatGenerationRuns).where(and(
    eq(chatGenerationRuns.conversationId, conversationId),
    inArray(chatGenerationRuns.status, ["running", "continuing"]),
  )).get();
}

/** Every durable run that is still running or recovering, with full details. */
export async function activeDurableRuns() {
  return db.select().from(chatGenerationRuns).where(
    inArray(chatGenerationRuns.status, ["running", "continuing"]),
  ).all();
}

export async function activeDurableConversationIds(): Promise<number[]> {
  const rows = await activeDurableRuns();
  return [...new Set(rows.map((row) => row.conversationId))];
}

/** Reclaim incomplete interactive generations after a server restart. */
export async function recoverChatGenerationRuns(): Promise<number> {
  const stale = await db.select().from(chatGenerationRuns).where(
    inArray(chatGenerationRuns.status, ["running", "continuing"]),
  ).all();

  for (const run of stale) {
    if (run.continuationCount >= run.maxContinuations) {
      await finishDurableGeneration({
        id: run.id,
        status: "needs_attention",
        error: "The server restarted after the continuation budget was exhausted.",
      });
      continue;
    }
    await finishDurableGeneration({ id: run.id, status: "continuing" });
    continueInterruptedGeneration({
      conversationId: run.conversationId,
      assistantId: run.assistantMessageId,
      generationRunId: run.id,
      continuationCount: run.continuationCount,
      requestUrl: "http://localhost/api/chat",
      requestHeaders: new Headers(),
    });
  }
  return stale.length;
}
