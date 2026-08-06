import { NextResponse } from "next/server";
import {
  streamText,
  stepCountIs,
  createUIMessageStreamResponse,
} from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, providers, userPreferences, memories } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { periodicallyPersistMessages } from "@/lib/chat/persist-interval";
import { streamRegistry } from "@/lib/chat/stream-registry";
import { estimateTokenCount } from "@/lib/utils";
import { getTimeDetails } from "@/lib/time";

export async function POST(req: Request) {
  const { conversationId } = (await req.json()) as {
    conversationId: number;
  };

  const conversation = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!conversation.providerId || !conversation.modelId) {
    return NextResponse.json(
      { error: "Pick a model for this conversation first" },
      { status: 400 },
    );
  }

  const provider = await db
    .select()
    .from(providers)
    .where(eq(providers.id, conversation.providerId))
    .get();
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const model = getLanguageModel(provider, conversation.modelId);

  // ── No tools at all — all context is pre-gathered and injected ──
  // The AI should only write a greeting. No tool calls, no lookups.
  const tools = {
    delay: delayTool,
    web_fetch: webFetchTool,
  };

  // ── Pre-gather ALL context server-side ──────────────────────────

  // 1. Time details — computed in the USER'S timezone (sent by the browser)
  // so the greeting (e.g. "Good evening") reflects the user's local time.
  const timeDetails = getTimeDetails(
    req.headers.get("x-user-timezone") ?? undefined,
  );
  const timeContext =
    `## Current date & time\n` +
    `Date: ${timeDetails.date}\n` +
    `Time: ${timeDetails.time} (${timeDetails.time24h})\n` +
    `Timezone: ${timeDetails.timezone} (${timeDetails.utcOffset})\n` +
    `Weekday: ${timeDetails.weekday}`;

  // 2. User preferences
  const prefs = await db.select().from(userPreferences).get();
  const prefParts: string[] = [];
  if (prefs?.preferredName) {
    prefParts.push(
      `The user's preferred name is "${prefs.preferredName}". Address them by this name.`,
    );
  }
  if (prefs?.preferences) {
    prefParts.push(`The user's preferences and context: ${prefs.preferences}`);
  }
  if (prefs?.personality) {
    prefParts.push(
      `Your personality and tone should follow this guidance: ${prefs.personality}`,
    );
  }
  const userPrefsContext = prefParts.length > 0
    ? `\n\n## User preferences\n${prefParts.join("\n")}`
    : "";

  // 2b. Profile details
  const profileParts: string[] = [];
  if (prefs?.bio) {
    profileParts.push(`Bio: ${prefs.bio}`);
  }
  if (prefs?.location) {
    profileParts.push(`Location: ${prefs.location}`);
  }
  if (prefs?.occupation) {
    profileParts.push(`Occupation: ${prefs.occupation}`);
  }
  if (prefs?.interests) {
    profileParts.push(`Interests: ${prefs.interests}`);
  }
  if (prefs?.skills) {
    profileParts.push(`Skills: ${prefs.skills}`);
  }
  if (prefs?.pronouns) {
    profileParts.push(`Pronouns: ${prefs.pronouns}`);
  }
  const userProfileContext = profileParts.length > 0
    ? `\n\n## User profile\nThe following is what you know about the user from their profile:\n${profileParts.map((p) => `- ${p}`).join("\n")}`
    : "";

  // 3. Saved memories
  const memoryRows = await db
    .select()
    .from(memories)
    .orderBy(memories.createdAt)
    .all();
  const memoryContext = memoryRows.length > 0
    ? `\n\n## Saved memories about the user\n${memoryRows.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  // 4. Recent file changes
  const recentChanges = await queryRecentChanges(10);
  const fileChangeContext = recentChanges.length > 0
    ? `\n\n## Recent file changes (${recentChanges.length} most recent)\n${recentChanges.map((c) => `- [${c.changeType}] ${c.directoryLabel}/${c.relativePath} (${c.changedAt})`).join("\n")}`
    : "";

  // ── Conversation starter prompt ─────────────────────────────────
  // This is ALL the instruction the AI needs — no need to call tools.

  const startPrompt = `\n\n## 🎯 You are starting the conversation — the user just opened a new chat

All the context you need has ALREADY been gathered below. Do NOT call any tools to get context — it's all right here.

### Your context (already provided):
${timeContext}${userPrefsContext}${userProfileContext}${memoryContext}${fileChangeContext}

### What to do:

1. **Greet them warmly** — say hello, be friendly. Use their name if you know it.
2. **Weave in context naturally** — reference something from above:
   - The time of day (e.g. "Good evening" if it's evening)
   - A recent file change
   - Something you remember about them
3. **Ask a natural question** — open-ended, like "What are you working on?", "What's on your mind?", etc..
4. **Keep it brief** — 3-4 sentences: greeting, personal touch, question.

### ⚠️ CRITICAL RULES:

- **Do NOT call ANY tools** — everything you need is already in this prompt.
- **Do NOT say "Let me check..." or "Let me grab..."** — just start talking naturally.
- **Do NOT use the ask_questions tool** — ask casually in text.
- **Do NOT use markdown** — plain text feels more natural.
- **Go straight into the greeting** — no preamble, no searching, no checking. Just talk.`;

  // ── StreamText ──────────────────────────────────────────────────
  // The AI SDK requires at least one message, so we pass a synthetic
  // trigger. It won't be persisted (originalMessages is empty).

  // Track whether onFinish successfully applied tokens, so the cleanup
  // doesn't double-count by applying the same usage again.
  let tokensApplied = false;

  const fullSystemPrompt = SYSTEM_PROMPT + startPrompt;

  const result = streamText({
    model,
    system: fullSystemPrompt,
    messages: [{ role: "user", content: "Go ahead and start the conversation." }],
    tools,
    stopWhen: stepCountIs(100),
    // Retry retryable provider failures up to 3 times before erroring out.
    maxRetries: 3,
    onFinish: async ({ text: outputText, usage }) => {
      // Derive a meaningful title from the AI's greeting
      const title = outputText
        ? outputText.length > 60
          ? `${outputText.slice(0, 60)}…`
          : outputText
        : 'Conversation started by Remi';

      try {
        // Use provider's usage if available, otherwise estimate
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;

        const estimatedInput =
          inputTokens > 0
            ? inputTokens
            : estimateTokenCount(fullSystemPrompt) +
              estimateTokenCount("Go ahead and start the conversation.");
        const estimatedOutput =
          outputTokens > 0 ? outputTokens : estimateTokenCount(outputText ?? "");

        await db
          .update(conversations)
          .set({
            title: sql`CASE WHEN title = 'New chat' THEN ${title} ELSE title END`,
            totalInputTokens:
              sql`total_input_tokens + ${estimatedInput}`,
            totalOutputTokens:
              sql`total_output_tokens + ${estimatedOutput}`,
          })
          .where(eq(conversations.id, conversationId));
        tokensApplied = true;
      } catch (err) {
        console.error("Failed to update token usage in start route onFinish:", err);
      }
    },
  });

  const uiMessageStream = result.toUIMessageStream({
    originalMessages: [],
    generateMessageId: () => crypto.randomUUID(),
  });

  const [persistBranch, responseBranch] = uiMessageStream.tee();

  periodicallyPersistMessages(
    conversationId,
    [],
    persistBranch,
    async () => {
      if (tokensApplied) {
        // Tokens already applied by onFinish — just update updatedAt
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
        return;
      }
      // onFinish wasn't able to apply tokens — try as a fallback
      try {
        const streamUsage = await result.usage;
        const inputTokens = streamUsage?.inputTokens ?? 0;
        const outputTokens = streamUsage?.outputTokens ?? 0;

        const estimatedInput =
          inputTokens > 0
            ? inputTokens
            : estimateTokenCount(fullSystemPrompt) +
              estimateTokenCount("Go ahead and start the conversation.");

        const estimatedOutput =
          outputTokens > 0
            ? outputTokens
            : estimateTokenCount(await result.text);

        await db
          .update(conversations)
          .set({
            totalInputTokens:
              sql`total_input_tokens + ${estimatedInput}`,
            totalOutputTokens:
              sql`total_output_tokens + ${estimatedOutput}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(conversations.id, conversationId));
      } catch (err) {
        console.error("Failed to update token usage in start cleanup:", err);
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
      }
    },
  );

  return createUIMessageStreamResponse({
    stream: responseBranch,
    consumeSseStream: ({ stream }) => {
      streamRegistry.register(conversationId, stream);
    },
  });
}
