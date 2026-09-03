/**
 * Webhook event runner.
 *
 * Mirrors the scheduled-task runner (lib/scheduler/index.ts): when a webhook
 * delivery is accepted, this builds the FULL tool set (enabled MCP servers,
 * filesystem, context, memory, integrations, code execution, document
 * reader, file index, todos, profile, routines, scheduling, builtins) and
 * runs a multi-step agentic generateText call with:
 *
 *   - the webhook's custom trigger system prompt ({{variable}} substitution
 *     against the payload/headers/query),
 *   - the raw payload,
 *   - the user's saved preferences/profile and relevant memories,
 *
 * then persists the trigger + assistant messages into the webhook's
 * conversation and records the outcome on the webhook_events row.
 *
 * Never throws: every failure path is recorded on the event row and the
 * webhook's lastStatus so the settings UI can surface it.
 */
import { eq, sql } from "drizzle-orm";
import { generateText, stepCountIs } from "ai";
import { db } from "@/db";
import {
  webhooks,
  webhookEvents,
  conversations,
  providers,
  mcpServers,
  userPreferences,
} from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import {
  buildCachedInstructions,
  markLastToolForCache,
} from "@/lib/chat/prompt-cache";
import { retrieveRelevantMemories } from "@/lib/chat/memories";
import { persistUIMessage } from "@/lib/chat/persist";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildContextTools } from "@/lib/tools/context";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildExecutionTools } from "@/lib/tools/exec";
import { buildDocumentReaderTools } from "@/lib/tools/document-reader";
import { buildMediaTools } from "@/lib/media/tools";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { askQuestionsTool } from "@/lib/tools/ask-questions";
import { buildTodoTools } from "@/lib/tools/todo";
import { buildFileIndexTools } from "@/lib/tools/file-index";
import { buildProfileTools } from "@/lib/tools/profile";
import { buildRoutinesTools } from "@/lib/tools/routines";
import { buildScheduleTool } from "@/lib/tools/schedule";
import { buildToolHelpTool, buildListAvailableToolsTool } from "@/lib/tools/tool-help";
import { createMcpToolsManager } from "@/lib/mcp/tools";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { estimateTokenCount, normaliseTool } from "@/lib/utils";
import { substituteTemplate } from "./template";
import {
  createAutomationRun,
  finishAutomationRun,
  getAutomationRun,
  scheduleAutomationRetry,
  startAutomationRun,
} from "@/lib/runs/automation";

export type WebhookRow = typeof webhooks.$inferSelect;

const DEFAULT_TRIGGER_INSTRUCTIONS =
  "Process this webhook event. Analyze the payload and respond appropriately using your tools — read files, search the web, query external systems, or use MCP tools if they help. If the payload looks like a message from a person, reply helpfully. Summarize what happened and what you did.";

const PAYLOAD_PROMPT_LIMIT = 4_000;
const HEADERS_PROMPT_LIMIT = 1_000;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n… [truncated]` : text;
}

/** Render the payload for the model: JSON pretty-printed, truncated. */
function formatPayload(payload: unknown): string {
  try {
    return truncate(JSON.stringify(payload, null, 2), PAYLOAD_PROMPT_LIMIT);
  } catch {
    return String(payload);
  }
}

/** Keep only a sane subset of request headers for the model. */
function formatHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "x-webhook-secret") continue; // never show the secret
    if (lower.startsWith("x-") || lower === "content-type" || lower === "user-agent") {
      out[key] = value;
    }
  }
  return out;
}

function markEventFailed(eventId: number, error: string): void {
  try {
    db.update(webhookEvents)
      .set({ status: "failed", error, completedAt: new Date().toISOString() })
      .where(eq(webhookEvents.id, eventId))
      .run();
  } catch {
    // Event row may already be gone (webhook deleted mid-run) — ignore.
  }
}

export async function processWebhookEvent(opts: {
  webhook: WebhookRow;
  eventId: number;
  payload: unknown;
  automationRunId?: number;
  headers: Record<string, string>;
  query: Record<string, string>;
}): Promise<{ result?: string; error?: string }> {
  const { webhook, eventId, payload, headers, query } = opts;
  let closeMcpClients: (() => Promise<void>) | undefined;
  let automationRunId = opts.automationRunId;
  let steeringInstruction = "";

  try {
    await db
      .update(webhookEvents)
      .set({ status: "processing" })
      .where(eq(webhookEvents.id, eventId))
      .run();

    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, webhook.conversationId ?? -1))
      .get();

    if (!conversation) {
      const error = `Conversation #${webhook.conversationId} not found — pick a conversation for this webhook in Settings → Webhooks.`;
      markEventFailed(eventId, error);
      await db
        .update(webhooks)
        .set({ lastStatus: "error", lastReceivedAt: new Date().toISOString(), lastEventId: eventId })
        .where(eq(webhooks.id, webhook.id))
        .run();
      return { error };
    }
    if (!conversation.providerId || !conversation.modelId) {
      const error = `Conversation #${conversation.id} has no model configured — pick a model (Settings → Models & Providers) or choose another conversation for this webhook.`;
      markEventFailed(eventId, error);
      await db
        .update(webhooks)
        .set({ lastStatus: "error", lastReceivedAt: new Date().toISOString(), lastEventId: eventId })
        .where(eq(webhooks.id, webhook.id))
        .run();
      return { error };
    }

    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, conversation.providerId))
      .get();
    if (!provider) {
      const error = `Provider #${conversation.providerId} not found.`;
      markEventFailed(eventId, error);
      await db
        .update(webhooks)
        .set({ lastStatus: "error", lastReceivedAt: new Date().toISOString(), lastEventId: eventId })
        .where(eq(webhooks.id, webhook.id))
        .run();
      return { error };
    }

    if (!automationRunId) {
      const run = await createAutomationRun({
        conversationId: conversation.id,
        kind: "webhook",
        sourceId: eventId,
        name: `Webhook: ${webhook.name}`,
        task: webhook.systemPrompt || `Process webhook event #${eventId}`,
      });
      automationRunId = run.id;
    }
    const existingRun = await getAutomationRun(automationRunId);
    if (existingRun?.control === "stop" || existingRun?.status === "cancelled") {
      markEventFailed(eventId, "Cancelled by user");
      return { error: "Cancelled by user" };
    }
    if (existingRun?.control === "steer" && existingRun.controlMessage) {
      steeringInstruction = existingRun.controlMessage;
    }
    await startAutomationRun(automationRunId);
    await db.update(webhookEvents)
      .set({ automationRunId, status: "processing" })
      .where(eq(webhookEvents.id, eventId)).run();

    // ── Build the FULL tool set (MCP + everything else) ──────────────
    const enabledMcpServers = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.enabled, true))
      .all();

    let mcpToolSet: Record<string, unknown> | undefined;
    if (enabledMcpServers.length > 0) {
      const manager = await createMcpToolsManager(enabledMcpServers);
      mcpToolSet = manager.tools;
      closeMcpClients = manager.close;
    }

    const [fsToolSet, contextToolSet, memoryToolSet, integrationToolSet, executionToolSet, docToolSet, mediaToolSet, fileIndexToolSet, todoToolSet, profileToolSet, routineToolSet, scheduleToolSet] =
      await Promise.all([
        buildFilesystemTools(conversation.id),
        Promise.resolve(buildContextTools()),
        buildMemoryTools(),
        buildIntegrationTools(),
        buildExecutionTools(),
        buildDocumentReaderTools(conversation.id),
        Promise.resolve(buildMediaTools(conversation.id)),
        Promise.resolve(buildFileIndexTools()),
        Promise.resolve(buildTodoTools(conversation.id)),
        buildProfileTools(),
        buildRoutinesTools(conversation.id),
        buildScheduleTool(conversation.id),
      ]);

    const rawTools = {
      ...mcpToolSet,
      ...fsToolSet,
      ...contextToolSet,
      ...memoryToolSet,
      ...integrationToolSet,
      ...executionToolSet,
      ...docToolSet,
      ...mediaToolSet,
      ...fileIndexToolSet,
      ...todoToolSet,
      ...profileToolSet,
      ...routineToolSet,
      ...scheduleToolSet,
      delay: delayTool,
      web_fetch: webFetchTool,
      ask_questions: askQuestionsTool,
      ...buildToolHelpTool(),
      ...buildListAvailableToolsTool(),
    };
    const tools = Object.fromEntries(
      Object.entries(rawTools).map(([name, tool]) => [name, normaliseTool(tool)]),
    );

    // ── Build the system prompt ─────────────────────────────────────
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

    const relevantMemories = await retrieveRelevantMemories(webhook.systemPrompt);
    const memoryTip = relevantMemories.length > 0
      ? `\n\nSaved memories:\n${relevantMemories.map((m) => `- ${m.content}`).join("\n")}`
      : "";

    const recentChanges = await queryRecentChanges(5);
    const fileChangeTip = recentChanges.length > 0
      ? `\n\nRecent file changes:\n${recentChanges.map((c) => `- [${c.changeType}] ${c.relativePath}`).join("\n")}`
      : "";

    // Substituted trigger instructions + raw context for the model.
    const context = {
      payload,
      headers: formatHeaders(headers),
      query,
      eventId,
      webhookName: webhook.name,
    };
    const triggerInstructions = `${substituteTemplate(
      webhook.systemPrompt.trim() || DEFAULT_TRIGGER_INSTRUCTIONS,
      context,
    )}${steeringInstruction ? `\n\nAdditional user steering instruction:\n${steeringInstruction}` : ""}`;
    const payloadText = formatPayload(payload);
    const headersText = truncate(JSON.stringify(context.headers, null, 2), HEADERS_PROMPT_LIMIT);
    const queryText = Object.keys(query).length > 0
      ? JSON.stringify(query, null, 2)
      : "(none)";

    const syncInstruction = webhook.respondSync
      ? `\n\n### Sync reply mode\nYour final text response will be returned VERBATIM to the webhook caller as the reply (e.g. sent back to a messaging platform's API). Keep it concise and directly usable: plain text, no markdown headings, no code fences, no preamble like "Here is..." — just the content to send back.`
      : "";

    const webhookSection = `\n\n## 📡 Webhook trigger — "${webhook.name}" (event #${eventId})\n\nYou are responding to an incoming webhook event. A conversation was already started for this webhook — behave as if the user asked you to handle this event.\n\n**Trigger instructions:**\n${triggerInstructions}\n\n**Payload:**\n\`\`\`json\n${payloadText}\n\`\`\`\n\n**Request headers:**\n\`\`\`json\n${headersText}\n\`\`\`\n\n**Query params:**\n\`\`\`json\n${queryText}\n\`\`\`\n\nUse your tools (files, web, MCP servers, code execution, memory…) to handle the event properly — do not just reply from training data. When you finish, summarize what happened.${syncInstruction}`;

    const staticSystemPrompt = SYSTEM_PROMPT;
    const dynamicSystemPrompt =
      (prefParts.length > 0 ? `\n\n## User preferences\n${prefParts.join("\n")}` : "") +
      (profileParts.length > 0 ? `\n\n## User profile\n${profileParts.map((p) => `- ${p}`).join("\n")}` : "") +
      memoryTip +
      fileChangeTip +
      webhookSection;

    // ── Run the AI ──────────────────────────────────────────────────
    const result = await generateText({
      model: getLanguageModel(provider, conversation.modelId),
      instructions: buildCachedInstructions(provider, staticSystemPrompt, dynamicSystemPrompt),
      messages: [
        {
          role: "user",
          content: `A webhook event for "${webhook.name}" was just received. Follow the trigger instructions above and handle it.`,
        },
      ],
      tools:
        Object.keys(tools).length > 0
          ? markLastToolForCache(provider, tools)
          : undefined,
      stopWhen: stepCountIs(50), // Allow multi-step tool-calling chains
      maxRetries: 3,
    });

    const fullText = result.text;
    const usage = result.usage;

    // ── Persist trigger + assistant messages into the conversation ──
    const payloadSnippet = truncate(payloadText, 1_000);
    const triggerMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: `📡 Webhook "${webhook.name}" received (event #${eventId}):\n\n\`\`\`json\n${payloadSnippet}\n\`\`\``,
        },
      ],
    };
    const assistantMsg = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: fullText }],
    };
    await persistUIMessage(conversation.id, triggerMsg);
    await persistUIMessage(conversation.id, assistantMsg);

    // Update conversation timestamp + token usage
    const inputTokens = usage?.inputTokens ?? estimateTokenCount(staticSystemPrompt + dynamicSystemPrompt);
    const outputTokens = usage?.outputTokens ?? estimateTokenCount(fullText);
    await db
      .update(conversations)
      .set({
        totalInputTokens: sql`total_input_tokens + ${inputTokens}`,
        totalOutputTokens: sql`total_output_tokens + ${outputTokens}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conversation.id));

    // ── Record outcome ──────────────────────────────────────────────
    const now = new Date().toISOString();
    await db
      .update(webhookEvents)
      .set({ status: "completed", result: fullText, completedAt: now })
      .where(eq(webhookEvents.id, eventId))
      .run();
    await db
      .update(webhooks)
      .set({
        lastReceivedAt: now,
        lastStatus: "ok",
        lastEventId: eventId,
      })
      .where(eq(webhooks.id, webhook.id))
      .run();
    if (automationRunId) {
      await finishAutomationRun(automationRunId, {
        status: "completed",
        result: fullText,
        checkpoint: { phase: "completed", eventId },
      });
    }

    return { result: fullText };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[webhooks] Event #${eventId} ("${webhook.name}") failed:`, errorMsg);
    markEventFailed(eventId, errorMsg);
    const canRetry = automationRunId
      ? await scheduleAutomationRetry(automationRunId, errorMsg)
      : false;
    if (canRetry && automationRunId) {
      const retryRun = await getAutomationRun(automationRunId);
      const delayMs = retryRun?.nextRetryAt
        ? Math.max(0, new Date(retryRun.nextRetryAt).getTime() - Date.now())
        : 2_000;
      setTimeout(() => {
        void processWebhookEvent({ ...opts, automationRunId });
      }, delayMs);
      return { error: `Webhook run failed; retry ${retryRun?.attempt ?? 1} scheduled.` };
    }
    if (automationRunId) {
      await finishAutomationRun(automationRunId, {
        status: "failed",
        error: errorMsg,
        checkpoint: { phase: "failed", eventId },
      }).catch(() => {});
    }
    try {
      await db
        .update(webhooks)
        .set({
          lastStatus: "error",
          lastReceivedAt: new Date().toISOString(),
          lastEventId: eventId,
        })
        .where(eq(webhooks.id, webhook.id))
        .run();
    } catch {
      // ignore secondary failures
    }
    return { error: errorMsg };
  } finally {
    if (closeMcpClients) {
      try {
        await closeMcpClients();
      } catch {
        // Ignore MCP cleanup failures — the run already completed.
      }
    }
  }
}
