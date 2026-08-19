import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRunEvents,
  automationRuns,
  conversations,
} from "@/db/schema";
import { publishAutomationNotification } from "./notifications";

export const AUTOMATION_ACTIVE_STATUSES = [
  "queued",
  "planning",
  "executing",
  "verifying",
  "repairing",
  "waiting",
] as const;

export type AutomationRunKind = "routine" | "scheduled_task" | "webhook" | "agent";
export type AutomationRunStatus =
  | (typeof AUTOMATION_ACTIVE_STATUSES)[number]
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";
export type AutomationRunControl = "none" | "stop" | "retry" | "steer";

type RunRow = typeof automationRuns.$inferSelect;

export function isAutomationRunActive(status: string): boolean {
  return (AUTOMATION_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export async function getAutomationRun(runId: number): Promise<RunRow | undefined> {
  return db.select().from(automationRuns).where(eq(automationRuns.id, runId)).get();
}

export async function createAutomationRun(input: {
  conversationId: number;
  kind: AutomationRunKind;
  sourceId?: number | null;
  parentRunId?: number | null;
  name: string;
  task: string;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
}): Promise<RunRow> {
  const now = new Date().toISOString();
  const row = await db
    .insert(automationRuns)
    .values({
      conversationId: input.conversationId,
      kind: input.kind,
      sourceId: input.sourceId ?? null,
      parentRunId: input.parentRunId ?? null,
      name: input.name.slice(0, 160),
      task: input.task.slice(0, 10_000),
      status: "queued",
      maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 2, 5)),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  await appendAutomationRunEvent(row.id, "queued", `Queued ${input.kind} run.`);
  return row;
}

export async function appendAutomationRunEvent(
  runId: number,
  eventType: string,
  message = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(automationRunEvents).values({
    runId,
    eventType: eventType.slice(0, 100),
    message: message.slice(0, 2_000),
    metadata,
    createdAt: new Date().toISOString(),
  }).run();
}

export async function startAutomationRun(
  runId: number,
  phase: Extract<AutomationRunStatus, "planning" | "executing" | "verifying" | "repairing"> = "executing",
): Promise<RunRow | undefined> {
  const now = new Date().toISOString();
  const row = await db
    .update(automationRuns)
    .set({
      status: phase,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      nextRetryAt: null,
      error: null,
      control: "none",
    })
    .where(eq(automationRuns.id, runId))
    .returning()
    .get();
  if (row) await appendAutomationRunEvent(runId, phase, `Run entered ${phase}.`);
  return row;
}

export async function updateAutomationRunCheckpoint(
  runId: number,
  checkpoint: Record<string, unknown>,
  phase?: AutomationRunStatus,
): Promise<void> {
  await db.update(automationRuns).set({
    ...(phase ? { status: phase } : {}),
    checkpoint,
    updatedAt: new Date().toISOString(),
  }).where(eq(automationRuns.id, runId)).run();
  await appendAutomationRunEvent(runId, "checkpoint", "Checkpoint saved.", checkpoint);
}

export async function finishAutomationRun(
  runId: number,
  input: {
    status: Extract<AutomationRunStatus, "completed" | "partially_completed" | "failed" | "cancelled">;
    result?: string | null;
    error?: string | null;
    checkpoint?: Record<string, unknown>;
  },
): Promise<RunRow | undefined> {
  const current = await getAutomationRun(runId);
  if (!current) return undefined;
  const stopped = current.control === "stop";
  const status = stopped ? "cancelled" : input.status;
  const now = new Date().toISOString();
  const row = await db.update(automationRuns).set({
    status,
    result: input.result ?? null,
    error: stopped
      ? current.controlMessage ?? "Stopped by user"
      : input.error ?? null,
    ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
    updatedAt: now,
    completedAt: now,
    nextRetryAt: null,
  }).where(eq(automationRuns.id, runId)).returning().get();
  if (row) {
    await appendAutomationRunEvent(
      runId,
      status,
      stopped ? "Run stopped by user." : `Run ${status}.`,
    );
    publishAutomationNotification(row);
  }
  return row;
}

export async function scheduleAutomationRetry(
  runId: number,
  error: string,
): Promise<boolean> {
  const current = await getAutomationRun(runId);
  if (!current || current.control === "stop" || current.attempt + 1 >= current.maxAttempts) {
    return false;
  }
  const attempt = current.attempt + 1;
  const nextRetryAt = new Date(Date.now() + Math.min(60_000, 2_000 * 2 ** current.attempt)).toISOString();
  await db.update(automationRuns).set({
    status: "waiting",
    attempt,
    error: error.slice(0, 2_000),
    nextRetryAt,
    updatedAt: new Date().toISOString(),
  }).where(eq(automationRuns.id, runId)).run();
  await appendAutomationRunEvent(runId, "retry_scheduled", `Retry ${attempt}/${current.maxAttempts} scheduled.`, {
    attempt,
    nextRetryAt,
  });
  return true;
}

export async function requestAutomationRunControl(input: {
  runId: number;
  control: AutomationRunControl;
  message?: string;
}): Promise<RunRow | undefined> {
  const current = await getAutomationRun(input.runId);
  if (!current) return undefined;
  const now = new Date().toISOString();
  const message = input.message?.trim().slice(0, 2_000) || null;
  const nextStatus = input.control === "stop"
    ? "cancelled"
    : input.control === "retry"
      ? "queued"
      : current.status;
  const row = await db.update(automationRuns).set({
    control: input.control,
    controlMessage: message,
    status: nextStatus,
    ...(input.control === "retry" ? {
      error: null,
      completedAt: null,
      nextRetryAt: null,
      attempt: Math.min(current.attempt + 1, current.maxAttempts),
    } : {}),
    updatedAt: now,
  }).where(eq(automationRuns.id, input.runId)).returning().get();
  if (row) {
    await appendAutomationRunEvent(input.runId, input.control, message ?? `Control requested: ${input.control}.`);
    if (input.control === "stop") publishAutomationNotification(row);
  }
  return row;
}

export async function stopAllAutomationRuns(conversationId?: number): Promise<number> {
  const active = await db.select({ id: automationRuns.id })
    .from(automationRuns)
    .where(and(
      inArray(automationRuns.status, [...AUTOMATION_ACTIVE_STATUSES]),
      conversationId === undefined ? undefined : eq(automationRuns.conversationId, conversationId),
    ))
    .all();
  for (const row of active) {
    await requestAutomationRunControl({ runId: row.id, control: "stop", message: "Stopped by emergency stop-all control." });
  }
  return active.length;
}

export async function listAutomationRuns(input: {
  conversationId?: number;
  limit?: number;
} = {}): Promise<Array<RunRow & { conversationTitle?: string }>> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const rows = await db.select({
    run: automationRuns,
    conversationTitle: conversations.title,
  }).from(automationRuns)
    .leftJoin(conversations, eq(automationRuns.conversationId, conversations.id))
    .where(input.conversationId === undefined ? undefined : eq(automationRuns.conversationId, input.conversationId))
    .orderBy(desc(automationRuns.createdAt), desc(automationRuns.id))
    .limit(limit)
    .all();
  return rows.map(({ run, conversationTitle }) => ({ ...run, conversationTitle: conversationTitle ?? undefined }));
}

export async function getAutomationRunEvents(runId: number) {
  return db.select().from(automationRunEvents)
    .where(eq(automationRunEvents.runId, runId))
    .orderBy(desc(automationRunEvents.createdAt), desc(automationRunEvents.id))
    .limit(100)
    .all();
}

export async function recoverStaleAutomationRuns(): Promise<number> {
  const stale = await db.select({ id: automationRuns.id })
    .from(automationRuns)
    .where(inArray(automationRuns.status, [...AUTOMATION_ACTIVE_STATUSES]))
    .all();
  for (const row of stale) {
    await finishAutomationRun(row.id, {
      status: "partially_completed",
      error: "Server restarted before this run completed.",
    });
  }
  return stale.length;
}

export type AutomationRunRow = RunRow;
