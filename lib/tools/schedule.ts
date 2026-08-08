import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { db } from "@/db";
import { scheduledTasks, toolConfigs } from "@/db/schema";
import { truncateToolResult } from "@/lib/utils";
import { computeNextCronTime, describeCron } from "@/lib/scheduler/cron";

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Normalize a timezone offset string to ISO 8601 format (+HH:MM or -HH:MM).
 * Handles various formats:
 *   "UTC+03:00" -> "+03:00"
 *   "UTC-04:00" -> "-04:00"
 *   "+03:00"    -> "+03:00" (already valid)
 *   "-04:00"    -> "-04:00" (already valid)
 */
function normalizeTimezone(tz?: string): string | undefined {
  if (!tz) return undefined;
  // Strip "UTC" prefix if present (e.g. "UTC+03:00" -> "+03:00")
  const stripped = tz.replace(/^UTC/i, "");
  return stripped || undefined;
}

/**
 * Apply a timezone offset to a date string so JavaScript's Date parser
 * correctly interprets it in that timezone.
 *
 * Accepts timezone in these formats:
 *   "+03:00"    — standard ISO 8601 offset
 *   "UTC+03:00" — with UTC prefix (as returned by get_time_details)
 *   "-04:00"    — negative offset
 *   "UTC-04:00" — negative offset with UTC prefix
 *
 * If triggerAt already includes timezone info (ends with Z, +HH:MM, -HH:MM),
 * returns it as-is. If no timezone is provided, assumes UTC and appends "Z".
 */
function applyTimezone(triggerAt: string, timezone?: string): string {
  // If already has timezone info (ends with Z, +HH:MM, -HH:MM), use as-is
  if (/[Z+-]/.test(triggerAt.trim().slice(-6))) {
    return triggerAt;
  }

  const normalized = normalizeTimezone(timezone);
  if (normalized) {
    return `${triggerAt}${normalized}`;
  }

  // Default to UTC
  return `${triggerAt}Z`;
}

/**
 * Get a human-readable string describing time remaining until a date.
 */
function getTimeRemaining(target: Date): string {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "now";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (parts.length === 0 && seconds > 0) parts.push(`${seconds}s`);

  return parts.join(" ");
}

/**
 * Validate a cron expression.
 */
function validateCron(schedule: string): string | null {
  try {
    const testDate = new Date();
    testDate.setFullYear(testDate.getFullYear() - 1);
    computeNextCronTime(schedule, testDate);
    return null; // Valid
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid cron expression";
  }
}

// ─── schedule_task tool ──────────────────────────────────────────────────

/**
 * Build the schedule_task tool with a specific conversation ID.
 */
export function buildScheduleTaskTool(conversationId: number) {
  return {
    description: `Schedule a task to run at a future time. When the trigger arrives, the AI executes the task in this conversation (with full history and tools) and sends a desktop notification with results.

Use for reminders, time-sensitive lookups ("check tomorrow at 9am if the package shipped"), or recurring tasks (add a cron schedule).

IMPORTANT: Call get_time_details() first, then pass triggerAt in the USER'S local time plus the timezone parameter — the system converts to UTC.`,

    parameters: z.object({
      triggerAt: z
        .string()
        .describe(
          "ISO 8601 date/time in the USER'S local timezone (e.g. '2026-07-20T23:59'). Do NOT convert to UTC. Use get_time_details() first for the timezone offset.",
        ),
      task: z
        .string()
        .min(1)
        .max(2000)
        .describe("What the AI should do at the scheduled time — be specific about what to check and report."),
      timezone: z
        .string()
        .optional()
        .describe("User's timezone offset from get_time_details().utcOffset, e.g. 'UTC+03:00' (entire value). If omitted, UTC assumed."),
      schedule: z
        .string()
        .optional()
        .describe("Optional cron expression for recurring execution (5-field: minute hour day-of-month month day-of-week). Examples: '0 * * * *' hourly, '0 9 * * *' daily 9am, '0 9 * * 1-5' weekdays 9am. Re-schedules itself after each run."),
    }),

    execute: async ({
      triggerAt,
      task,
      timezone,
      schedule,
    }: {
      triggerAt: string;
      task: string;
      timezone?: string;
      schedule?: string;
    }) => {
      // Apply timezone offset so the Date is interpreted in the user's timezone
      const fullDateStr = applyTimezone(triggerAt, timezone);
      const triggerDate = new Date(fullDateStr);

      if (isNaN(triggerDate.getTime())) {
        return truncateToolResult({
          type: "schedule_error",
          error: `Invalid date/time: "${triggerAt}"${timezone ? ` with timezone "${timezone}"` : ""}. Use ISO 8601 format (e.g. "2026-07-20T23:59") and pass the timezone from get_time_details().`,
        });
      }

      const now = new Date();
      if (triggerDate <= now) {
        return truncateToolResult({
          type: "schedule_error",
          error: `The trigger time "${triggerAt}"${timezone ? ` (${timezone})` : ""} (UTC: ${triggerDate.toISOString()}) is in the past. Current UTC time is ${now.toISOString()}. Please provide a future date and time.`,
        });
      }

      // Validate cron expression if provided
      if (schedule) {
        const cronError = validateCron(schedule);
        if (cronError) {
          return truncateToolResult({
            type: "schedule_error",
            error: `Invalid cron expression: "${schedule}". ${cronError}`,
          });
        }
      }

      // Store the task in the database (always in UTC)
      const record = await db
        .insert(scheduledTasks)
        .values({
          conversationId,
          triggerAt: triggerDate.toISOString(),
          task,
          status: "pending",
          schedule: schedule ?? null,
        })
        .returning()
        .get();

      const timeUntil = getTimeRemaining(triggerDate);
      const scheduleInfo = schedule
        ? ` Recurring schedule: ${describeCron(schedule)}.`
        : "";

      return truncateToolResult({
        type: "task_scheduled",
        task: {
          id: record.id,
          triggerAt: record.triggerAt,
          task: record.task,
          status: record.status,
          schedule: record.schedule ?? null,
        },
        timeUntil,
        message: `${schedule ? "Recurring task" : "Task"} scheduled! I'll execute it${timeUntil ? ` in ${timeUntil}` : ""} and notify you with the results.${scheduleInfo}`,
      });
    },
  };
}

// ─── list_scheduled_tasks tool ──────────────────────────────────────────

/**
 * List scheduled tasks in the current conversation.
 */
function buildListScheduledTasksTool(conversationId: number) {
  return {
    description: `List scheduled tasks in this conversation and their status. Get IDs for update_scheduled_task / cancel_scheduled_task.`,

    parameters: z.object({
      includeCompleted: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include completed/failed/cancelled tasks. Default: false (pending only)"),
      limit: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .default(20)
        .describe("Max tasks to return (max 50, default 20)"),
    }),

    execute: async ({
      includeCompleted,
      limit,
    }: {
      includeCompleted?: boolean;
      limit?: number;
    }) => {
      // Build where conditions
      const conditions: any[] = [
        eq(scheduledTasks.conversationId, conversationId),
      ];

      if (!includeCompleted) {
        conditions.push(eq(scheduledTasks.status, "pending"));
      }

      const rows = await db
        .select()
        .from(scheduledTasks)
        .where(and(...conditions))
        .orderBy(desc(scheduledTasks.triggerAt))
        .limit(Math.min(limit ?? 20, 50))
        .all() as any[];

      const tasks = rows.map((r: any) => ({
        id: r.id,
        triggerAt: r.triggerAt,
        task: r.task,
        status: r.status,
        schedule: r.schedule ?? null,
        createdAt: r.createdAt,
      }));

      return truncateToolResult({
        type: "scheduled_tasks_list",
        count: tasks.length,
        tasks,
        message: tasks.length === 0
          ? "No scheduled tasks in this conversation."
          : `Found ${tasks.length} scheduled task${tasks.length === 1 ? "" : "s"} in this conversation.`,
      });
    },
  };
}

// ─── update_scheduled_task tool ─────────────────────────────────────────

function buildUpdateScheduledTaskTool(conversationId: number) {
  return {
    description: `Update a pending scheduled task's trigger time, description, or cron schedule. Use list_scheduled_tasks first to find the task ID.`,

    parameters: z.object({
      taskId: z
        .number()
        .int()
        .positive()
        .describe("ID of the task to update (from list_scheduled_tasks)"),
      triggerAt: z
        .string()
        .optional()
        .describe("New ISO 8601 date/time in the USER'S local timezone (e.g. '2026-07-20T23:59'). Do NOT convert to UTC."),
      task: z
        .string()
        .min(1)
        .max(2000)
        .optional()
        .describe("New description of what the AI should do"),
      timezone: z
        .string()
        .optional()
        .describe("User's timezone offset from get_time_details().utcOffset. Required when updating triggerAt."),
      schedule: z
        .string()
        .optional()
        .nullable()
        .describe("New cron expression, or null to remove the schedule (one-off)"),
    }),

    execute: async ({
      taskId,
      triggerAt,
      task,
      timezone,
      schedule,
    }: {
      taskId: number;
      triggerAt?: string;
      task?: string;
      timezone?: string;
      schedule?: string | null;
    }) => {
      // Find the task
      const existing = await db
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.id, taskId),
            eq(scheduledTasks.conversationId, conversationId),
          ),
        )
        .get();

      if (!existing) {
        return truncateToolResult({
          type: "update_error",
          error: `No scheduled task found with ID ${taskId} in this conversation.`,
        });
      }

      if (existing.status !== "pending") {
        return truncateToolResult({
          type: "update_error",
          error: `Cannot update a task with status "${existing.status}". Only pending tasks can be modified.`,
        });
      }

      // Build updates
      const updates: Record<string, any> = {};

      if (triggerAt !== undefined) {
        const fullDateStr = applyTimezone(triggerAt, timezone);
        const triggerDate = new Date(fullDateStr);

        if (isNaN(triggerDate.getTime())) {
          return truncateToolResult({
            type: "update_error",
            error: `Invalid date/time: "${triggerAt}". Use ISO 8601 format and pass the timezone from get_time_details().`,
          });
        }

        if (triggerDate <= new Date()) {
          return truncateToolResult({
            type: "update_error",
            error: `The trigger time "${triggerAt}" is in the past. Provide a future date and time.`,
          });
        }

        updates.triggerAt = triggerDate.toISOString();
      }

      if (task !== undefined) {
        updates.task = task;
      }

      if (schedule !== undefined) {
        // null means remove schedule, string means set/update it
        if (schedule !== null) {
          const cronError = validateCron(schedule);
          if (cronError) {
            return truncateToolResult({
              type: "update_error",
              error: `Invalid cron expression: "${schedule}". ${cronError}`,
            });
          }
        }
        updates.schedule = schedule;
      }

      if (Object.keys(updates).length === 0) {
        return truncateToolResult({
          type: "update_error",
          error: "No fields to update. Provide at least one of: triggerAt, task, schedule.",
        });
      }

      await db
        .update(scheduledTasks)
        .set(updates)
        .where(eq(scheduledTasks.id, taskId));

      const updated = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, taskId))
        .get();

      const changedFields = Object.keys(updates).map((k) => {
        if (k === "triggerAt") return "trigger time";
        return k;
      });

      return truncateToolResult({
        type: "task_updated",
        task: {
          id: updated?.id,
          triggerAt: updated?.triggerAt,
          task: updated?.task,
          status: updated?.status,
          schedule: updated?.schedule ?? null,
        },
        message: `Task #${taskId} updated successfully. Changed: ${changedFields.join(", ")}.${updated?.triggerAt ? ` New trigger: ${new Date(updated.triggerAt).toLocaleString()}.` : ""}`,
      });
    },
  };
}

// ─── cancel_scheduled_task tool ─────────────────────────────────────────

function buildCancelScheduledTaskTool(conversationId: number) {
  return {
    description: `Cancel a pending scheduled task so it won't execute. Use list_scheduled_tasks first to find the task ID.`,

    parameters: z.object({
      taskId: z
        .number()
        .int()
        .positive()
        .describe("ID of the task to cancel (from list_scheduled_tasks)"),
    }),

    execute: async ({ taskId }: { taskId: number }) => {
      const existing = await db
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.id, taskId),
            eq(scheduledTasks.conversationId, conversationId),
          ),
        )
        .get();

      if (!existing) {
        return truncateToolResult({
          type: "cancel_error",
          error: `No scheduled task found with ID ${taskId} in this conversation.`,
        });
      }

      if (existing.status !== "pending") {
        return truncateToolResult({
          type: "cancel_error",
          error: `Cannot cancel a task with status "${existing.status}". Only pending tasks can be cancelled.`,
        });
      }

      await db
        .update(scheduledTasks)
        .set({
          status: "cancelled",
          completedAt: new Date().toISOString(),
        })
        .where(eq(scheduledTasks.id, taskId));

      return truncateToolResult({
        type: "task_cancelled",
        taskId,
        message: `Task #${taskId} ("${existing.task.slice(0, 60)}...") has been cancelled.`,
      });
    },
  };
}

// ─── Builder ────────────────────────────────────────────────────────────

/**
 * Build all scheduling tools. Only includes them if the feature is enabled.
 * Enabled by default.
 */
export async function buildScheduleTool(conversationId: number): Promise<Record<string, any>> {
  const config = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "scheduling"))
    .get();

  const enabled = config === undefined ? true : config?.enabled;

  if (!enabled) {
    return {};
  }

  return {
    schedule_task: buildScheduleTaskTool(conversationId),
    list_scheduled_tasks: buildListScheduledTasksTool(conversationId),
    update_scheduled_task: buildUpdateScheduledTaskTool(conversationId),
    cancel_scheduled_task: buildCancelScheduledTaskTool(conversationId),
  };
}
