import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scheduledTasks, toolConfigs } from "@/db/schema";
import { truncateToolResult } from "@/lib/utils";
import { computeNextCronTime, describeCron } from "@/lib/scheduler/cron";

/**
 * Build the schedule_task tool with a specific conversation ID.
 * The conversation ID is needed when saving the task to the database.
 */
export function buildScheduleTaskTool(conversationId: number) {
  return {
    description: `Schedule a task for future execution. When the trigger time arrives, the AI will automatically execute the task in this same conversation — with full conversation history and all available tools — and report the results. A native desktop notification will be sent when the result is ready.

Use this for:
- "Check tomorrow at 9am if the package has shipped" — one-off task
- "Remind me at midnight to check the FIFA World Cup results" — one-off task
- "At 3pm, fetch the latest stock prices and summarize them" — one-off task
- "Every hour, check if the CI build passed" — recurring task (add a schedule/cron)
- "Check weather daily at 7am" — recurring task

The task will be executed in this conversation using the same model and tools that are available now. A native notification will appear on your desktop when the result is ready.

IMPORTANT: The trigger time must be in the future. Use get_time_details first to check the current time and timezone.`,

    parameters: z.object({
      triggerAt: z
        .string()
        .describe(
          "ISO 8601 timestamp for when to execute the task (e.g. '2026-07-20T00:00:00'). For one-off tasks, this is the exact execution time. For recurring tasks (when schedule is provided), this is the first execution time. Must be in the future. Use get_time_details() to check the current time and timezone first.",
        ),
      task: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "Clear description of what the AI should do at the scheduled time. Be specific about what to check, what tools to use, and what to report.",
        ),
      schedule: z
        .string()
        .optional()
        .describe(
          "Optional cron expression for recurring execution. Leave empty for one-off tasks. Standard 5-field cron format: minute hour day-of-month month day-of-week.\n\nExamples:\n- \"0 * * * *\" — every hour at minute 0\n- \"*/5 * * * *\" — every 5 minutes\n- \"0 9 * * *\" — daily at 9:00 AM\n- \"0 9 * * 1-5\" — weekdays at 9:00 AM\n- \"0 0 * * 1\" — every Monday at midnight\n- \"0 0 1 * *\" — monthly on the 1st at midnight\n\nWhen a schedule is provided, the task will re-schedule itself after each execution using the cron expression. The triggerAt will be used as the first execution time.",
        ),
    }),

    execute: async ({
      triggerAt,
      task,
      schedule,
    }: {
      triggerAt: string;
      task: string;
      schedule?: string;
    }) => {
      // Parse and validate the trigger time
      const triggerDate = new Date(triggerAt);
      if (isNaN(triggerDate.getTime())) {
        return truncateToolResult({
          type: "schedule_error",
          error: `Invalid date/time: "${triggerAt}". Use ISO 8601 format (e.g. "2026-07-20T00:00:00").`,
        });
      }

      const now = new Date();
      if (triggerDate <= now) {
        return truncateToolResult({
          type: "schedule_error",
          error: `The trigger time "${triggerAt}" is in the past. Please provide a future date and time. Use get_time_details() to check the current time.`,
        });
      }

      // Validate cron expression if provided
      if (schedule) {
        try {
          const testDate = new Date();
          testDate.setFullYear(testDate.getFullYear() - 1); // past date to avoid issues
          computeNextCronTime(schedule, testDate);
        } catch (err) {
          return truncateToolResult({
            type: "schedule_error",
            error: `Invalid cron expression: "${schedule}". ${err instanceof Error ? err.message : "Use 5-field format (minute hour dom month dow)."}`,
          });
        }
      }

      // Store the task in the database with the conversation ID
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
 * Build the schedule tool if the feature is enabled in tool configs.
 * Requires a conversationId so the task can be linked to the conversation.
 */
export async function buildScheduleTool(conversationId: number): Promise<Record<string, any>> {
  const config = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "scheduling"))
    .get();

  // Enabled by default if no config exists
  const enabled = config === undefined ? true : config?.enabled;

  if (!enabled) {
    return {};
  }

  return {
    schedule_task: buildScheduleTaskTool(conversationId),
  };
}
