import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agentTasks,
  scheduledTasks,
  webhookEvents,
  webhooks,
} from "@/db/schema";
import {
  getAutomationRun,
  requestAutomationRunControl,
} from "@/lib/runs/automation";
import { executeRoutine } from "@/lib/routines/runner";
import { executeTask, type ScheduledTaskRow } from "@/lib/scheduler";
import { processWebhookEvent } from "@/lib/webhooks/runner";
import { retryAgentTask } from "@/lib/tools/agent-spawner";

const controlSchema = z.object({
  action: z.enum(["stop", "retry", "steer"]),
  instruction: z.string().max(2_000).optional(),
});

async function stopSource(run: Awaited<ReturnType<typeof getAutomationRun>>) {
  if (!run?.sourceId) return;
  if (run.kind === "scheduled_task") {
    await db.update(scheduledTasks)
      .set({ status: "cancelled", completedAt: new Date().toISOString() })
      .where(eq(scheduledTasks.id, run.sourceId)).run();
  } else if (run.kind === "agent") {
    await db.update(agentTasks)
      .set({ status: "failed", error: "Cancelled by user", completedAt: new Date().toISOString() })
      .where(eq(agentTasks.id, run.sourceId)).run();
  } else if (run.kind === "webhook") {
    await db.update(webhookEvents)
      .set({ status: "failed", error: "Cancelled by user", completedAt: new Date().toISOString() })
      .where(eq(webhookEvents.id, run.sourceId)).run();
  }
}

async function dispatchRetry(run: NonNullable<Awaited<ReturnType<typeof getAutomationRun>>>) {
  if (!run.sourceId) throw new Error("This run has no retryable source record.");
  if (run.kind === "routine") {
    void executeRoutine(run.sourceId, 30_000, {
      conversationId: run.conversationId,
      automationRunId: run.id,
    });
    return;
  }
  if (run.kind === "scheduled_task") {
    const task = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, run.sourceId)).get();
    if (!task) throw new Error("Scheduled task no longer exists.");
    await db.update(scheduledTasks).set({ status: "pending", triggerAt: new Date().toISOString() })
      .where(eq(scheduledTasks.id, task.id)).run();
    void executeTask({ ...task, status: "pending" } as ScheduledTaskRow);
    return;
  }
  if (run.kind === "agent") {
    await retryAgentTask(run.sourceId, run.id);
    return;
  }
  if (run.kind === "webhook") {
    const event = await db.select().from(webhookEvents).where(eq(webhookEvents.id, run.sourceId)).get();
    if (!event) throw new Error("Webhook event no longer exists.");
    const webhook = await db.select().from(webhooks).where(eq(webhooks.id, event.webhookId)).get();
    if (!webhook) throw new Error("Webhook no longer exists.");
    void processWebhookEvent({
      webhook,
      eventId: event.id,
      payload: event.payload,
      headers: {},
      query: {},
      automationRunId: run.id,
    });
    return;
  }
  throw new Error(`Unsupported run kind: ${run.kind}`);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  }
  let body: z.infer<typeof controlSchema>;
  try {
    body = controlSchema.parse(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid control" }, { status: 400 });
  }

  const run = await getAutomationRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (body.action === "stop") {
    const updated = await requestAutomationRunControl({ runId, control: "stop", message: body.instruction ?? "Stopped by user" });
    await stopSource(run);
    return NextResponse.json({ ok: true, run: updated });
  }

  if (body.action === "steer") {
    if (!body.instruction?.trim()) {
      return NextResponse.json({ error: "A steering instruction is required" }, { status: 400 });
    }
    const updated = await requestAutomationRunControl({ runId, control: "steer", message: body.instruction });
    return NextResponse.json({ ok: true, run: updated });
  }

  if (!["failed", "partially_completed", "cancelled"].includes(run.status)) {
    return NextResponse.json({ error: `Cannot retry a run with status "${run.status}"` }, { status: 409 });
  }
  const updated = await requestAutomationRunControl({ runId, control: "retry", message: body.instruction ?? "Retry requested by user" });
  try {
    await dispatchRetry(updated ?? run);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Retry could not be started" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, run: updated, message: "Retry queued" });
}
