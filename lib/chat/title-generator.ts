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
import { getLanguageModel } from "@/lib/providers/factory";

type ProviderRow = typeof providers.$inferSelect;

/** How much of each message we send to the titling model (keeps it cheap). */
const MAX_MESSAGE_CHARS = 1500;

/** Hard cap for titles shown in the sidebar. */
const MAX_TITLE_CHARS = 80;

const TITLE_SYSTEM_PROMPT = `You are a chat-title generator. Read the user's message and the assistant's reply, then produce a short, descriptive title for the conversation.

Rules:
- 2-8 words, plain text — no quotes, no markdown, no labels like "Title:".
- No ending punctuation.
- Title case, unless a technical term is part of it (e.g. "Particle Engine Error Fix").
- Under 60 characters.
- Reply with ONLY the title text — nothing else.`;

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
}): Promise<void> {
  try {
    const userText = opts.userText.slice(0, MAX_MESSAGE_CHARS).trim();
    const assistantText = opts.assistantText.slice(0, MAX_MESSAGE_CHARS).trim();
    if (!userText && !assistantText) return;

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (userText) messages.push({ role: "user", content: userText });
    if (assistantText) messages.push({ role: "assistant", content: assistantText });

    const model = getLanguageModel(opts.provider, opts.modelId);
    const result = await generateText({
      model,
      system: TITLE_SYSTEM_PROMPT,
      messages,
      // A title needs only a handful of tokens, but the budget is generous
      // enough that reasoning models don't burn it all on hidden reasoning.
      maxOutputTokens: 100,
    });

    const title = sanitizeTitle(result.text);
    if (!title) return;

    // Guard: never clobber a title the user set while we were running.
    const current = await db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, opts.conversationId))
      .get();
    if (!current || current.title !== opts.expectedTitle) return;

    await db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, opts.conversationId));
  } catch (err) {
    // Best-effort: a failure here just keeps the fallback title.
    console.error("[auto-title] Failed to generate conversation title:", err);
  }
}
