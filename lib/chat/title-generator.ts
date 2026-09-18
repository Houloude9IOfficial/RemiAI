/**
 * Background conversation-title generation.
 *
 * After the AI produces its FIRST response in a brand-new chat, we fire a
 * tiny, low-cost completion that reads the first user message and the first
 * assistant reply and condenses them into a short descriptive title
 * (e.g. "Particle Engine Error Fix"). It runs entirely server-side and is
 * intentionally fire-and-forget — it never blocks the SSE response, so the
 * user can navigate away or close the app while it finishes.
 */
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, providers } from "@/db/schema";
import { resolveLanguageModel } from "@/lib/providers/resolve-model";
import { createRunTrace } from "@/lib/observability/run-trace";
import { emitConversationTitleUpdated } from "@/lib/chat/title-events";

type ProviderRow = typeof providers.$inferSelect;

/** How much of each message we send to the titling model (keeps it cheap). */
const MAX_MESSAGE_CHARS = 600;

/** Hard cap for titles shown in the sidebar. */
const MAX_TITLE_CHARS = 80;

/**
 * The titling model is NOT a chat participant. Sending the exchange as real
 * user/assistant chat messages made models answer it instead of labelling it
 * ("hi" + "Hey! How can I help?" produced the title "Hello! How can I help you
 * today"). The transcript therefore arrives as ONE user message and the system
 * prompt forbids replying, greeting or continuing the conversation.
 */
const TITLE_SYSTEM_PROMPT = `You label chat conversations for a sidebar. You are NOT a participant in the conversation: never reply to it, never greet anyone, never continue it, never explain your choice.

Rules:
- 2-8 words, plain text — no quotes, no markdown, no label like "Title:".
- Describe the TOPIC of the exchange, never the assistant's reply.
- If the exchange is only a greeting, small talk, or thanks, use a generic label (e.g. "Casual Greeting", "Quick Check-in").
- Title case, unless a technical term is part of it (e.g. "Particle Engine Error Fix").
- No ending punctuation. Under 60 characters.
- Reply with ONLY the title text.

Example titles:
- A user greeting the assistant with "hi" → Casual Greeting
- "fix the EADDRINUSE crash on start" → EADDRINUSE Startup Crash
- Asking for the weather in Lisbon → Lisbon Weather Check`;

/**
 * Second-attempt prompt. Models that answered the first attempt with a
 * preamble, a restatement of the conversation, a reply, or a long explanation
 * get a blunter instruction and more room to finish after any hidden reasoning.
 */
const TITLE_RETRY_SYSTEM_PROMPT = `You name chat conversations. Do not answer the conversation. Reply with ONLY a 2-6 word topic title for the transcript below. Plain text, no quotes, no "Title:" label, no punctuation, no explanation, no preamble.`;

/**
 * Output-token budgets for the titling call, tried in order until a usable
 * title comes back. A title needs only a handful of tokens, but a cap that is
 * too small makes the whole job fail silently: reasoning models spend the
 * budget on HIDDEN reasoning (stripped from `text` by the provider middleware)
 * before emitting a single word, so `result.text` arrives empty and the chat
 * keeps its fallback title (e.g. "hi").
 *
 * The FIRST budget is deliberately large enough that a reasoning model usually
 * finishes in ONE call — the second attempt costs another full round-trip
 * (seconds on free/served models) and is only worth it when the first came
 * back with nothing usable. NOTE: do not shrink these again — a 48-token cap
 * was tried and reliably broke titling on every reasoning backend.
 */
const TITLE_TOKEN_BUDGETS = [600, 1_800];

/**
 * Hard per-attempt ceiling. Titling is a background nicety: one pathological
 * model (traces show 40-65s attempts on Nemotron Ultra / Gemma) must not hold
 * a request open. A TIMEOUT is retried with more room, because multi-model
 * gateways serve slow reasoning models unpredictably; a real provider error is
 * not, since another round-trip would just fail the same way.
 */
const TITLE_ATTEMPT_TIMEOUT_MS = [7_000, 13_000];

/**
 * Picks the text to sanitize out of a model reply.
 *
 * Free / multi-model gateways routinely serve models that think in the CONTENT
 * stream (verified live: `dots-studio/dots-3-note-preview:free` and
 * `google/gemma-4-31b-it` narrate their reasoning before answering). Two rules
 * follow from observing those replies:
 *
 * 1. A TRUNCATED reply is never salvaged — its tail is mid-sentence reasoning,
 *    and "salvaging" it produced titles like "- No ending punctuation. Under
 *    60 characters" (real output). A length-capped reply means "ask again with
 *    more room", not "pick a line".
 * 2. Such models put the reasoning first and the title LAST, so the last
 *    non-empty line is the reliable candidate once the reply actually finished.
 */
export function titleCandidate(
  raw: string,
  finishReason: string | undefined,
): string | null {
  if (finishReason === "length") return null;
  const lines = (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

/**
 * Cleans up whatever the model returned into a usable title, or null when
 * the output can't be salvaged (empty, code, absurd length, etc.).
 */
export function sanitizeTitle(raw: string): string | null {
  let t = (raw ?? "").trim();
  if (!t) return null;

  // Strip code fences if the model wrapped the answer
  if (t.startsWith("```")) {
    t = t.replace(/^```[^\n]*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }

  // Drop a leading label the model may have added
  t = t.replace(/^title\s*[:：]\s*/i, "");

  // Remove surrounding quotes
  t = t.replace(
    /^["'\u201C\u201D\u2018\u2019\u00AB\u00BB]+|["'\u201C\u201D\u2018\u2019\u00AB\u00BB]+$/g,
    "",
  );

  // Collapse internal whitespace/newlines
  t = t.replace(/\s+/g, " ").trim();

  // Drop trailing sentence punctuation
  t = t.replace(/[.!?:;]+$/, "").trim();

  if (!t || t.length > 120) return null;

  if (t.length > MAX_TITLE_CHARS) {
    t = `${t.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
  }
  return t;
}

/** Never replace a title the user changed while the background call ran. */
export function canApplyAutoTitle(currentTitle: string | undefined, expectedTitle: string): boolean {
  return currentTitle === expectedTitle;
}

/**
 * A fallback title is derived directly from the first user message. Treat it
 * like an untitled chat so a later successful turn can still generate a real
 * descriptive title. Any other title is considered user-managed/generated.
 */
export function needsGeneratedTitle(
  currentTitle: string | undefined,
  fallbackTitle: string | undefined,
): boolean {
  const title = currentTitle?.trim() ?? "";
  return !title || title === "New chat" || (fallbackTitle !== undefined && title === fallbackTitle);
}

/**
 * Generates a title for the conversation and writes it to the database.
 *
 * - Runs the SAME provider/model as the conversation (no extra config needed).
 * - Only overwrites `expectedTitle` — i.e. the auto-generated fallback the
 *   chat route set from the first user message. If the user manually renamed
 *   the conversation while this background call was in flight, it backs off.
 * - Swallows every error: this is best-effort background work and must never
 *   surface to the user or break the main request.
 */
export async function autoTitleConversation(opts: {
  conversationId: number;
  provider: ProviderRow;
  modelId: string;
  userText: string;
  assistantText: string;
  expectedTitle: string;
  parentTraceId?: string;
}): Promise<void> {
  const trace = createRunTrace({
    kind: "background-title",
    conversationId: opts.conversationId,
    parentTraceId: opts.parentTraceId,
  });
  trace.event("background.started");
  try {
    const userText = opts.userText.slice(0, MAX_MESSAGE_CHARS).trim();
    const assistantText = opts.assistantText.slice(0, MAX_MESSAGE_CHARS).trim();
    if (!userText && !assistantText) {
      trace.finish("cancelled", { phase: "empty_input" });
      return;
    }

    // One user message holding a LABELLED transcript — never a real chat turn
    // (see TITLE_SYSTEM_PROMPT for why).
    const transcript = [
      userText ? `USER: ${userText}` : null,
      assistantText ? `ASSISTANT: ${assistantText}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n\n");
    const messages = [
      {
        role: "user" as const,
        content: `Conversation transcript:\n\n${transcript}\n\nWrite the title for this conversation now.`,
      },
    ];

    // Auto-aware: the conversation may be pinned to the virtual Auto model.
    const model = await resolveLanguageModel(opts.provider, opts.modelId, "minimal");

    // Cheapest budget first; only escalate when the model produced nothing
    // usable (truncated mid-reasoning, empty text, or an unusable preamble).
    let title: string | null = null;
    let lastFinishReason: string | undefined;
    let lastOutputChars = 0;
    let requestFailed = false;
    for (let attempt = 0; attempt < TITLE_TOKEN_BUDGETS.length && !title; attempt += 1) {
      const maxOutputTokens = TITLE_TOKEN_BUDGETS[attempt];
      let result: Awaited<ReturnType<typeof generateText>>;
      try {
        result = await generateText({
          model,
          system: attempt === 0 ? TITLE_SYSTEM_PROMPT : TITLE_RETRY_SYSTEM_PROMPT,
          messages,
          maxOutputTokens,
          // Background nicety: never burn the SDK's retry budget (or extra
          // seconds) here — a failed turn keeps the fallback title and the
          // next user turn tries again.
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(TITLE_ATTEMPT_TIMEOUT_MS[attempt] ?? TITLE_ATTEMPT_TIMEOUT_MS[0]),
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
      } catch (error) {
        const name = error instanceof Error ? error.name : "unknown";
        const timedOut = name === "TimeoutError" || name === "AbortError";
        requestFailed = true;
        trace.event("title.attempt_failed", {
          attempt: attempt + 1,
          maxOutputTokens,
          name,
        });
        // A timeout means "this model was too slow", not "this request is
        // broken" — the next attempt gets a longer ceiling and more room.
        if (!timedOut) break;
        continue;
      }

      const candidate = titleCandidate(result.text, result.finishReason);
      title = candidate ? sanitizeTitle(candidate) : null;
      lastFinishReason = result.finishReason;
      lastOutputChars = result.text.length;
      if (!title && attempt + 1 < TITLE_TOKEN_BUDGETS.length) {
        trace.event("title.retry", {
          attempt: attempt + 1,
          maxOutputTokens,
          finishReason: result.finishReason,
          outputChars: result.text.length,
        });
      }
    }

    if (!title) {
      trace.finish("partially_completed", {
        phase: requestFailed ? "title_request_failed" : "title_sanitization",
        finishReason: lastFinishReason,
        outputChars: lastOutputChars,
      });
      return;
    }

    // Guard: never clobber a title the user set while we were running.
    const current = await db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, opts.conversationId))
      .get();
    if (!current || !canApplyAutoTitle(current.title, opts.expectedTitle)) {
      trace.finish("cancelled", { phase: "title_changed" });
      return;
    }

    const updatedAt = new Date().toISOString();
    await db
      .update(conversations)
      .set({ title, updatedAt })
      .where(eq(conversations.id, opts.conversationId));
    emitConversationTitleUpdated(opts.conversationId, title, updatedAt);
    trace.finish("completed", { outputChars: lastOutputChars });
  } catch (err) {
    trace.providerError(err);
    trace.finish("failed", { phase: "background_title" });
    // Best-effort: a failure here just keeps the fallback title.
    console.error("[auto-title] Failed to generate conversation title:", err);
  }
}
