/**
 * Background scheduler for executing scheduled tasks.
 *
 * Runs a setInterval on the server that checks for pending tasks whose
 * trigger time has passed. When found, it executes them by generating an
 * AI response in the associated conversation, persisting the result, and
 * notifying the client via SSE.
 */
import { eq, and, lt, sql } from "drizzle-orm";
import { generateText, stepCountIs } from "ai";
import { db } from "@/db";
import {
  scheduledTasks,
  conversations,
  providers,
  mcpServers,
  memories,
  userPreferences,
} from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { persistUIMessage } from "@/lib/chat/persist";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildContextTools } from "@/lib/tools/context";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildExecutionTools } from "@/lib/tools/exec";
import { buildDocumentReaderTools } from "@/lib/tools/document-reader";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { askQuestionsTool } from "@/lib/tools/ask-questions";
import { buildTodoTools } from "@/lib/tools/todo";
import { buildFileIndexTools } from "@/lib/tools/file-index";
import { buildProfileTools } from "@/lib/tools/profile";
import { buildRoutinesTools } from "@/lib/tools/routines";
import { buildScheduleTool } from "@/lib/tools/schedule";
import { createMcpToolsManager } from "@/lib/mcp/tools";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { estimateTokenCount } from "@/lib/utils";
import { computeNextCronTime } from "./cron";

// ─── Types ──────────────────────────────────────────────────────────────

export type ScheduledTaskRow = {
  id: number;
  conversationId: number;
  triggerAt: string;
  task: string;
  status: string;
  schedule: string | null;
  lastRunAt: string | null;
  result: string | null;
  error: string | null;
  notificationSent: boolean;
  createdAt: string;
  completedAt: string | null;
};

// ─── SSE Notification Bus ──────────────────────────────────────────────

type NotifyCallback = (task: ScheduledTaskRow) => void;

/**
 * Simple pub/sub for sending real-time notifications to connected clients.
 * When a scheduled task completes, the scheduler publishes an event and
 * all subscribed SSE connections receive it.
 */
class NotificationBus {
  private subscribers = new Set<NotifyCallback>();

  subscribe(cb: NotifyCallback): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  publish(task: ScheduledTaskRow) {
    for (const cb of this.subscribers) {
      try {
        cb(task);
      } catch {
        // Subscriber disconnected
        this.subscribers.delete(cb);
      }
    }
  }
}

export const notificationBus = new NotificationBus();

// ─── Scheduler ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000; // Check every 15 seconds

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background scheduler. Called once at app startup.
 */
export function startScheduler() {
  if (intervalHandle) {
    return; // Already started
  }

  console.log("[scheduler] Starting background task scheduler (poll every 15s)");

  // Clean up any tasks stuck in 'processing' from a previous server session
  cleanupStaleTasks();

  intervalHandle = setInterval(pollDueTasks, POLL_INTERVAL_MS);

  // Also run an immediate check on startup
  pollDueTasks().catch((err) =>
    console.error("[scheduler] Initial poll failed:", err),
  );
}

/**
 * Reset any tasks stuck in 'processing' back to 'pending' so they
 * get picked up by the next poll. This handles server restarts.
 */
async function cleanupStaleTasks() {
  try {
    const result = await db
      .update(scheduledTasks)
      .set({ status: "pending" })
      .where(eq(scheduledTasks.status, "processing"))
      .run();
    if (result.changes > 0) {
      console.log(`[scheduler] Reset ${result.changes} stale 'processing' task(s) to 'pending'`);
    }
  } catch (err) {
    console.error("[scheduler] Failed to clean up stale tasks:", err);
  }
}

/**
 * Stop the background scheduler. Called on shutdown.
 */
export function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[scheduler] Stopped");
  }
}

// ─── Poll for due tasks ─────────────────────────────────────────────────

async function pollDueTasks() {
  try {
    const now = new Date().toISOString();

    // Find all pending tasks whose trigger time has passed
    const dueTasks = await db
      .select()
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.status, "pending"),
          lt(scheduledTasks.triggerAt, now),
        ),
      )
      .all() as ScheduledTaskRow[];

    if (dueTasks.length === 0) return;

    console.log(`[scheduler] Found ${dueTasks.length} due task(s)`);

    // Execute each task in parallel (they're independent)
    await Promise.all(
      dueTasks.map((task) => executeTask(task)),
    );
  } catch (err) {
    console.error("[scheduler] Poll error:", err);
  }
}

// ─── Execute a task ─────────────────────────────────────────────────────

export async function executeTask(task: ScheduledTaskRow) {
  console.log(`[scheduler] Executing task #${task.id}: "${task.task.slice(0, 60)}..."`);

  // Mark as processing
  await db
    .update(scheduledTasks)
    .set({ status: "processing" })
    .where(eq(scheduledTasks.id, task.id));

  try {
    // Load conversation
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, task.conversationId))
      .get();

    if (!conversation) {
      throw new Error(`Conversation #${task.conversationId} not found`);
    }

    if (!conversation.providerId || !conversation.modelId) {
      throw new Error(
        `Conversation #${task.conversationId} has no model configured`,
      );
    }

    // Load provider
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, conversation.providerId))
      .get();

    if (!provider) {
      throw new Error(`Provider #${conversation.providerId} not found`);
    }

    const model = getLanguageModel(provider, conversation.modelId);

    // ── Build tools (same set as the chat route) ──
    const enabledMcpServers = provider.id
      ? await db.select().from(mcpServers).where(eq(mcpServers.enabled, true)).all()
      : [];
    let closeMcpClients: (() => Promise<void>) | undefined;
    let mcpToolSet: Record<string, unknown> | undefined;

    if (enabledMcpServers.length > 0) {
      const manager = await createMcpToolsManager(enabledMcpServers);
      mcpToolSet = manager.tools;
      closeMcpClients = manager.close;
    } else {
      mcpToolSet = undefined;
    }

    const [fsToolSet, contextToolSet, memoryToolSet, integrationToolSet, executionToolSet, docToolSet, fileIndexToolSet, todoToolSet, profileToolSet, routineToolSet, scheduleToolSet] =
      await Promise.all([
        buildFilesystemTools(),
        Promise.resolve(buildContextTools()),
        buildMemoryTools(),
        buildIntegrationTools(),
        buildExecutionTools(),
        buildDocumentReaderTools(),
        Promise.resolve(buildFileIndexTools()),
        Promise.resolve(buildTodoTools(task.conversationId)),
        buildProfileTools(),
        buildRoutinesTools(),
        buildScheduleTool(task.conversationId),
      ]);

    const tools = {
      ...mcpToolSet,
      ...fsToolSet,
      ...contextToolSet,
      ...memoryToolSet,
      ...integrationToolSet,
      ...executionToolSet,
      ...docToolSet,
      ...fileIndexToolSet,
      ...todoToolSet,
      ...profileToolSet,
      ...routineToolSet,
      ...scheduleToolSet,
      delay: delayTool,
      web_fetch: webFetchTool,
      ask_questions: askQuestionsTool,
    };

    const toolNames = Object.keys(tools);
    console.log(`[scheduler] Task #${task.id} has ${toolNames.length} tool(s): ${toolNames.join(", ")}`);

    // ── Build system prompt with context ──
    const prefs = await db.select().from(userPreferences).get();
    const prefParts: string[] = [];
    if (prefs?.preferredName) {
      prefParts.push(`The user's preferred name is "${prefs.preferredName}".`);
    }
    if (prefs?.preferences) {
      prefParts.push(`The user's preferences: ${prefs.preferences}`);
    }
    if (prefs?.personality) {
      prefParts.push(`Tone: ${prefs.personality}`);
    }

    const profileParts: string[] = [];
    if (prefs?.bio) profileParts.push(`Bio: ${prefs.bio}`);
    if (prefs?.location) profileParts.push(`Location: ${prefs.location}`);
    if (prefs?.occupation) profileParts.push(`Occupation: ${prefs.occupation}`);
    if (prefs?.interests) profileParts.push(`Interests: ${prefs.interests}`);
    if (prefs?.skills) profileParts.push(`Skills: ${prefs.skills}`);

    const memoryRows = await db
      .select()
      .from(memories)
      .orderBy(memories.createdAt)
      .all();
    const memoryTip = memoryRows.length > 0
      ? `\n\nSaved memories:\n${memoryRows.map((m) => `- ${m.content}`).join("\n")}`
      : "";

    const recentChanges = await queryRecentChanges(10);
    const fileChangeTip = recentChanges.length > 0
      ? `\n\nRecent file changes:\n${recentChanges.map((c) => `- [${c.changeType}] ${c.relativePath}`).join("\n")}`
      : "";

    // Scheduled task execution prefix — explicitly list all tools
    const scheduledTaskPrefix = `\n\n## ⏰ Scheduled Task Execution

You are being triggered by a scheduled task that the user asked you to do earlier.

**Task:** ${task.task}

**Scheduled at:** ${task.triggerAt}
**Current time:** ${new Date().toISOString()}

### Complete this task using your available tools

You have FULL access to all the same tools as a normal conversation. Use them to gather information:

- **Web search**: Use fc_search (Firecrawl), news_search/top_headlines (NewsAPI), or brave_web_search (Brave) to find information on the web.
- **Web scraping**: Use fc_scrape or web_fetch to read specific web pages.
- **Code execution**: Use python_exec or js_exec to run code if needed.
- **Filesystem**: Use read_file, search_files, etc. to read files.

**CRITICAL: You MUST use the appropriate tools to fulfill the task. Do NOT just generate text from your training data — actively search, fetch, and verify information.**

After completing the task, the user will receive a desktop notification with your response. Make sure your answer is complete, well-formatted, and includes all relevant information.`;

    const fullSystemPrompt =
      SYSTEM_PROMPT +
      (prefParts.length > 0 ? `\n\n## User preferences\n${prefParts.join("\n")}` : "") +
      (profileParts.length > 0 ? `\n\n## User profile\n${profileParts.map((p) => `- ${p}`).join("\n")}` : "") +
      memoryTip +
      fileChangeTip +
      scheduledTaskPrefix;

    // ── Generate AI response ──
    const result = await generateText({
      model,
      system: fullSystemPrompt,
      messages: [
        {
          role: "user",
          content: `⏰ Scheduled task due: ${task.task}`,
        },
      ],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(50), // Allow multi-step tool-calling chains
    });

    const fullText = result.text;
    const usage = result.usage;

    // Log which tools were actually called during execution
    const calledTools = result.toolCalls;
    if (calledTools && calledTools.length > 0) {
      const toolSummary = calledTools
        .map((tc) => `${tc.toolName}`)
        .join(", ");
      console.log(
        `[scheduler] Task #${task.id} called ${calledTools.length} tool(s): ${toolSummary}`,
      );
    } else {
      console.log(`[scheduler] Task #${task.id} did NOT call any tools`);
    }

    // Estimate tokens if provider didn't return usage
    const inputTokens = usage?.inputTokens ?? estimateTokenCount(fullSystemPrompt);
    const outputTokens = usage?.outputTokens ?? estimateTokenCount(fullText);

    // ── Persist the trigger message and AI response ──
    const triggerMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      parts: [{ type: "text" as const, text: `⏰ Scheduled task: ${task.task}` }],
    };

    const assistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: fullText }],
    };

    await persistUIMessage(task.conversationId, triggerMsg);
    await persistUIMessage(task.conversationId, assistantMsg);

    // Update conversation timestamp and token usage
    await db
      .update(conversations)
      .set({
        totalInputTokens: sql`total_input_tokens + ${inputTokens}`,
        totalOutputTokens: sql`total_output_tokens + ${outputTokens}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, task.conversationId));

    // Mark task as completed (or re-schedule for recurring tasks)
    const now = new Date().toISOString();

    if (task.schedule) {
      // ── Recurring task: compute next trigger and re-schedule ──
      try {
        // Use current time as base so we don't re-schedule to an already-past time
        // (which would cause the task to fire again immediately on the next poll)
        const nextTrigger = computeNextCronTime(
          task.schedule,
          new Date(),
        );
        const nextTriggerStr = nextTrigger.toISOString();

        await db
          .update(scheduledTasks)
          .set({
            triggerAt: nextTriggerStr,
            lastRunAt: now,
            status: "pending",
            result: fullText,
            notificationSent: false,
          })
          .where(eq(scheduledTasks.id, task.id));

        // Notify about this execution
        const updatedTask = {
          ...task,
          status: "completed", // Notify as completed
          result: fullText,
          completedAt: now,
          lastRunAt: now,
          triggerAt: nextTriggerStr,
        } as ScheduledTaskRow;
        notificationBus.publish(updatedTask);

        console.log(
          `[scheduler] Recurring task #${task.id} completed. Next run: ${nextTriggerStr}`,
        );
      } catch (err) {
        // If computing next trigger fails, mark as failed
        console.error(
          `[scheduler] Failed to compute next trigger for recurring task #${task.id}:`,
          err,
        );
        await db
          .update(scheduledTasks)
          .set({
            status: "failed",
            error: `Recurring schedule computation failed: ${err instanceof Error ? err.message : String(err)}`,
            result: fullText,
            completedAt: now,
          })
          .where(eq(scheduledTasks.id, task.id));

        const failedTask = {
          ...task,
          status: "failed",
          result: fullText,
          error: `Schedule computation failed: ${err instanceof Error ? err.message : String(err)}`,
          completedAt: now,
        } as ScheduledTaskRow;
        notificationBus.publish(failedTask);
      }
    } else {
      // ── One-off task: mark as completed ──
      await db
        .update(scheduledTasks)
        .set({
          status: "completed",
          result: fullText,
          completedAt: now,
          notificationSent: false,
        })
        .where(eq(scheduledTasks.id, task.id));

      const updatedTask = {
        ...task,
        status: "completed",
        result: fullText,
        completedAt: now,
      } as ScheduledTaskRow;
      notificationBus.publish(updatedTask);
    }

    console.log(`[scheduler] Task #${task.id} completed successfully`);

    // Clean up MCP clients
    if (closeMcpClients) {
      await closeMcpClients();
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] Task #${task.id} failed:`, errorMsg);

    const now = new Date().toISOString();
    await db
      .update(scheduledTasks)
      .set({
        status: "failed",
        error: errorMsg,
        completedAt: now,
      })
      .where(eq(scheduledTasks.id, task.id));

    // Notify about failure too
    const failedTask = {
      ...task,
      status: "failed",
      error: errorMsg,
      completedAt: now,
    } as ScheduledTaskRow;
    notificationBus.publish(failedTask);
  }
}
