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

/**
 * Returns structured time/date details (same as the get_time_details tool).
 */
function getTimeDetails(): Record<string, unknown> {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetStr = `UTC${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;

  const days = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return {
    iso: now.toISOString(),
    date: `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
    time: now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
    time24h: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
    timezone: tz,
    utcOffset: offsetStr,
    weekday: days[now.getDay()],
    dayOfMonth: now.getDate(),
    month: months[now.getMonth()],
    year: now.getFullYear(),
  };
}

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

  // 1. Time details
  const timeDetails = getTimeDetails();
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
${timeContext}${userPrefsContext}${memoryContext}${fileChangeContext}

### What to do:

1. **Greet them warmly** — say hello, be friendly. Use their name if you know it.
2. **Weave in context naturally** — reference something from above:
   - The time of day (e.g. "Good evening" if it's evening)
   - A recent file change
   - Something you remember about them
3. **Ask a natural question** — open-ended, like "What are you working on?" or "What's on your mind?"
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

  const result = streamText({
    model,
    system: SYSTEM_PROMPT + startPrompt,
    messages: [{ role: "user", content: "Go ahead and start the conversation." }],
    tools,
    stopWhen: stepCountIs(100),
    onFinish: async ({ usage }) => {
      if (usage) {
        await db
          .update(conversations)
          .set({
            totalInputTokens:
              sql`total_input_tokens + ${usage.inputTokens ?? 0}`,
            totalOutputTokens:
              sql`total_output_tokens + ${usage.outputTokens ?? 0}`,
          })
          .where(eq(conversations.id, conversationId));
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
      await db
        .update(conversations)
        .set({
          updatedAt: new Date().toISOString(),
          title: sql`CASE WHEN title = 'New chat' THEN 'Conversation started by Remi' ELSE title END`,
        })
        .where(eq(conversations.id, conversationId));
    },
  );

  return createUIMessageStreamResponse({
    stream: responseBranch,
    consumeSseStream: ({ stream }) => {
      streamRegistry.register(conversationId, stream);
    },
  });
}
