import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages as messagesTable, providers } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { createRunTrace } from "@/lib/observability/run-trace";

/**
 * Rolling conversation summarizer.
 *
 * Long conversations grow unboundedly because every request re-sends the
 * entire message history. This module solves that with a rolling summary:
 *
 * - After a conversation passes `SUMMARIZE_EVERY_MESSAGES` new messages past
 *   the last summary, a BACKGROUND job compresses the earliest portion of the
 *   conversation (everything before the recent verbatim window) into a
 *   compact prose recap and stores it on the `conversations` row.
 * - Every subsequent request injects the summary into the system prompt and
 *   drops the summarized messages from the model payload — the model keeps
 *   the important facts without re-paying for the raw bytes.
 *
 * The job is intentionally fire-and-forget (mirrors the title generator):
 * it never blocks the SSE response, swallows all errors, and can safely run
 * after the user has navigated away.
 */

type ProviderRow = typeof providers.$inferSelect;

/** New messages (past the summary) before we regenerate it. */
export const SUMMARIZE_EVERY_MESSAGES = 25;

/** Messages at the end of the conversation always kept verbatim. */
export const SUMMARIZE_RECENT_KEEP = 12;

/** Minimum conversation length before summarizing kicks in. */
export const SUMMARIZE_MIN_MESSAGES = 30;

/** Upper bound on the summarized segment handed to the model (keeps it cheap). */
const MAX_INPUT_CHARS = 40_000;

/** Output budget for the summary itself (targets ~150–400 tokens). */
const MAX_OUTPUT_TOKENS = 600;

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. You will receive the transcript of the EARLIER part of a chat between a user and an AI assistant that has file, memory, and tool capabilities.

Produce a compact summary in plain text (no markdown headers, no bullets if avoidable, ~150-300 words) that preserves ONLY what the assistant would still need to answer follow-ups:

- The user's goals, decisions, and preferences stated so far.
- Facts about the user (name, job, tech stack, constraints).
- Files created/modified and where they live (paths matter).
- Tools used and notable results (e.g. "read package.json: Next.js 15 app").
- Open questions, pending tasks, or unfinished work.
- Any commitments made ("I'll check X later").

Rules:
- Do NOT quote long excerpts or dump file contents — reference them.
- Do NOT include UI noise, tool IDs, or error codes.
- Keep dates/times only when they matter.
- Write in the same language the conversation is mostly in.`;

/** Serialize a persisted UIMessage row into a compact, model-readable line. */
function messageToText(row: { role: string; parts: unknown[] }): string {
  const parts = (row.parts ?? []) as Array<Record<string, unknown>>;
  const chunks: string[] = [];

  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      chunks.push(part.text.trim());
    } else if (part.type === "tool-invocation") {
      const inv = (part.toolInvocation ?? {}) as Record<string, unknown>;
      const toolName = typeof inv.toolName === "string" ? inv.toolName : "?";
      chunks.push(`[tool:${toolName}(${safeSnippet(inv.args)})]`);
    } else if (
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      part.type !== "tool-invocation" &&
      part.toolCallId !== undefined
    ) {
      chunks.push(`[tool:${part.type.slice(5)}(${safeSnippet(part.input)})]`);
    }
  }

  const text = chunks.join(" ");
  return `${row.role === "user" ? "User" : "Assistant"}: ${text}`;
}

/** Recursively drop file-content/code payloads so they never reach the model. */
function stripPayloadKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPayloadKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === "content" || key === "code") continue;
      out[key] = stripPayloadKeys(val);
    }
    return out;
  }
  return value;
}

function safeSnippet(value: unknown, max = 180): string {
  if (value === undefined || value === null) return "";
  let json: string;
  try {
    json = JSON.stringify(stripPayloadKeys(value));
  } catch {
    return "";
  }
  json = json.replace(/\\(?:n|t|")/g, " ");
  return json.length > max ? `${json.slice(0, max)}…` : json;
}

/**
 * Generate (and persist) a rolling summary of the conversation's earliest
 * messages. Best-effort: any failure leaves the existing summary untouched.
 *
 * @param untilCount number of leading messages (by orderIndex) to summarize.
 */
export async function summarizeConversationBackground(opts: {
  conversationId: number;
  provider: ProviderRow;
  modelId: string;
  untilCount: number;
  parentTraceId?: string;
}): Promise<void> {
  const trace = createRunTrace({
    kind: "background-summary",
    conversationId: opts.conversationId,
    parentTraceId: opts.parentTraceId,
  });
  trace.event("background.started");
  try {
    const { conversationId, provider, modelId, untilCount } = opts;
    if (untilCount <= 0) {
      trace.finish("cancelled", { phase: "no_messages" });
      return;
    }

    const rows = (await db
      .select({ role: messagesTable.role, parts: messagesTable.parts })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.orderIndex))
      .limit(untilCount)
      .all()) as Array<{ role: string; parts: unknown[] }>;

    if (rows.length === 0) {
      trace.finish("cancelled", { phase: "no_messages" });
      return;
    }

    // Flatten into a compact transcript, capped so the summarizer call stays
    // cheap no matter how huge the earlier segment was.
    let transcript = "";
    for (const row of rows) {
      const line = messageToText(row);
      if (transcript.length + line.length > MAX_INPUT_CHARS) break;
      transcript += `${line}\n`;
    }
    if (!transcript.trim()) {
      trace.finish("cancelled", { phase: "empty_transcript" });
      return;
    }

    const model = getLanguageModel(provider, modelId);
    const result = await generateText({
      model,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      onLanguageModelCallStart: ({ callId, provider: modelProvider, modelId }) => {
        trace.modelCallStart({ callId, provider: modelProvider, modelId });
      },
      onLanguageModelCallEnd: ({ callId, provider: modelProvider, modelId, usage, finishReason, performance }) => {
        trace.modelCallEnd({
          callId,
          provider: modelProvider,
          modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          responseTimeMs: performance.responseTimeMs,
          timeToFirstOutputMs: performance.timeToFirstOutputMs,
          finishReason,
        });
      },
    });

    const summary = result.text.trim();
    if (!summary) {
      trace.finish("partially_completed", { phase: "empty_summary" });
      return;
    }

    // Only claim coverage for the rows we ACTUALLY summarized. `untilCount` is
    // derived from the client's message count, which can briefly exceed the
    // persisted rows (the persist stream may not have flushed the tail yet);
    // claiming more than we loaded would drop messages the summary never saw.
    const covered = Math.min(untilCount, rows.length);
    if (covered <= 0) {
      trace.finish("partially_completed", { phase: "no_covered_messages" });
      return;
    }

    // Don't clobber a fresher summary if a previous background job won the race.
    const current = await db
      .select({ summaryMessageCount: conversations.summaryMessageCount })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();
    if (current && current.summaryMessageCount >= covered) {
      trace.finish("cancelled", { phase: "summary_already_fresh" });
      return;
    }

    await db
      .update(conversations)
      .set({
        summary,
        summaryMessageCount: covered,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conversationId));
    trace.finish("completed", { coveredMessages: covered, outputChars: summary.length });
  } catch (err) {
    trace.providerError(err);
    trace.finish("failed", { phase: "background_summary" });
    // Best-effort: a failed summary just means the history stays unsummarized.
    console.error("[summarizer] Failed to summarize conversation:", err);
  }
}

/**
 * True when the conversation should (re)generate its rolling summary based on
 * how many messages it now has vs. how many the last summary covered.
 */
export function shouldSummarize(opts: {
  totalMessages: number;
  coveredMessages: number;
}): boolean {
  const { totalMessages, coveredMessages } = opts;
  return (
    totalMessages >= SUMMARIZE_MIN_MESSAGES &&
    totalMessages - coveredMessages >= SUMMARIZE_EVERY_MESSAGES
  );
}
