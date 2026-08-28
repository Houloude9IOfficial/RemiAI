import { NextResponse } from "next/server";
import {
  streamText,
  stepCountIs,
  createUIMessageStreamResponse,
} from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, providers, userPreferences } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT, SYSTEM_PROMPT_NO_MEMORY } from "@/lib/chat/system-prompt";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { periodicallyPersistMessages } from "@/lib/chat/persist-interval";
import { streamRegistry } from "@/lib/chat/stream-registry";
import { estimateTokenCount } from "@/lib/utils";
import { retrieveRelevantMemories } from "@/lib/chat/memories";
import { getTimeDetails } from "@/lib/time";
import { createRunTrace } from "@/lib/observability/run-trace";

export async function POST(req: Request) {
  const trace = createRunTrace({ kind: "chat-start" });
  trace.metric("retryBudget", 3);
  trace.event("request.received", { method: "POST" });
  const { conversationId } = (await req.json()) as {
    conversationId: number;
  };

  trace.metric("conversationId", conversationId);
  const conversationLookupStartedAt = performance.now();
  const conversation = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  trace.dbQuery("conversation_lookup", conversationLookupStartedAt);

  if (!conversation) {
    trace.finish("failed", { phase: "conversation_lookup" });
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (!conversation.providerId || !conversation.modelId) {
    trace.finish("failed", { phase: "provider_selection" });
    return NextResponse.json(
      { error: "Pick a model for this conversation first" },
      { status: 400 },
    );
  }

  const providerLookupStartedAt = performance.now();
  const provider = await db
    .select()
    .from(providers)
    .where(eq(providers.id, conversation.providerId))
    .get();
  trace.dbQuery("provider_lookup", providerLookupStartedAt, {
    providerKind: provider?.kind,
  });
  if (!provider) {
    trace.finish("failed", { phase: "provider_lookup" });
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

  // 3. Saved memories — budget-capped (most recent, since there's no query
  // yet). Skipped for memory-disabled chats (e.g. temporary chats): the AI
  // must greet without any saved context, and the no-memory prompt variant
  // below removes the memory guidance too.
  const memoryEnabled = conversation.memoryEnabled !== false;
  const relevantMemories = memoryEnabled ? await retrieveRelevantMemories("") : [];
  const memoryContext = relevantMemories.length > 0
    ? `\n\n## Saved memories about the user\n${relevantMemories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  // 4. Recent file changes
  const recentChanges = memoryEnabled ? await queryRecentChanges(10) : [];
  const fileChangeContext = recentChanges.length > 0
    ? `\n\n## Recent file changes (${recentChanges.length} most recent)\n${recentChanges.map((c) => `- [${c.changeType}] ${c.directoryLabel}/${c.relativePath} (${c.changedAt})`).join("\n")}`
    : "";

  // ── Conversation starter prompt ─────────────────────────────────
  // This is ALL the instruction the AI needs — no need to call tools.
  // Fully isolated (memory-disabled) chats get a variant that greets a
  // STRANGER: no name, no personal context, no "something you remember".

  const startPrompt = memoryEnabled
    ? `\n\n## 🎯 You are starting the conversation — the user just opened a new chat

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
- **Go straight into the greeting** — no preamble, no searching, no checking. Just talk.`
    : `\n\n## 🎯 You are starting the conversation — the user just opened a new chat

This chat is fully isolated: you do NOT know the user — no name, profile, preferences, memories, or files. Do NOT call any tools.

### Your context (already provided):
${timeContext}

### What to do:

1. **Greet them warmly, as a stranger** — a friendly, generic hello. Do NOT use a name.
2. **Reference only the time of day** (e.g. "Good evening" if it's evening) — nothing else about them.
3. **Ask a natural question** — open-ended, like "What are you working on?", "What's on your mind?", etc..
4. **Keep it brief** — 2-3 sentences: greeting, small touch, question.

### ⚠️ CRITICAL RULES:

- **Do NOT call ANY tools** — everything you need is already in this prompt.
- **Never assume, guess, or reference anything about the user** — you know nothing about them.
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
  let providerFailed = false;
  let aborted = false;
  let finalFinishReason: string | undefined;

  const fullSystemPrompt =
    (memoryEnabled ? SYSTEM_PROMPT : SYSTEM_PROMPT_NO_MEMORY) + startPrompt;
  trace.metric("promptChars", fullSystemPrompt.length);
  trace.metric("activeToolCount", Object.keys(tools).length);
  trace.metric("activeToolNames", Object.keys(tools));

  const result = streamText({
    model,
    system: fullSystemPrompt,
    messages: [{ role: "user", content: "Go ahead and start the conversation." }],
    tools,
    stopWhen: stepCountIs(100),
    // Retry retryable provider failures up to 3 times before erroring out.
    maxRetries: 3,
    onStart: ({ callId, provider: modelProvider, modelId: modelName }) => {
      trace.recordState("executing", { callId });
      trace.event("generation.start", {
        callId,
        provider: modelProvider,
        modelId: modelName,
      });
    },
    onLanguageModelCallStart: ({ callId, provider: modelProvider, modelId: modelName }) => {
      trace.modelCallStart({ callId, provider: modelProvider, modelId: modelName });
    },
    onLanguageModelCallEnd: ({
      callId,
      provider: modelProvider,
      modelId: modelName,
      usage,
      finishReason,
      performance: callPerformance,
    }) => {
      trace.modelCallEnd({
        callId,
        provider: modelProvider,
        modelId: modelName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        responseTimeMs: callPerformance.responseTimeMs,
        timeToFirstOutputMs: callPerformance.timeToFirstOutputMs,
        finishReason,
      });
    },
    onToolExecutionStart: ({ callId, toolCall }) => {
      trace.toolStart(toolCall.toolName, callId);
    },
    onToolExecutionEnd: ({ callId, toolCall, toolExecutionMs, toolOutput }) => {
      trace.toolEnd(
        toolCall.toolName,
        toolExecutionMs,
        toolOutput.type === "tool-result",
        callId,
      );
    },
    onStepEnd: ({ stepNumber, usage, toolCalls, toolResults, finishReason }) => {
      trace.step(stepNumber, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        toolCallCount: toolCalls.length,
        toolResultCount: toolResults.length,
        finishReason,
      });
    },
    onError: (error) => {
      providerFailed = true;
      trace.providerError(error);
    },
    onAbort: () => {
      aborted = true;
      trace.recordState("cancelled");
    },
    onFinish: async ({ text: outputText, usage, finishReason }) => {
      finalFinishReason = finishReason;
      trace.metric("finishReason", finishReason);
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

        const tokenUpdateStartedAt = performance.now();
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
        trace.dbQuery("token_usage_update", tokenUpdateStartedAt, {
          inputTokens: estimatedInput,
          outputTokens: estimatedOutput,
        });
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
        const updatedAtStartedAt = performance.now();
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
        trace.dbQuery("conversation_updated_at", updatedAtStartedAt);
        const state = aborted ? "cancelled" : providerFailed ? "failed" : "completed";
        trace.recordState(state, { finishReason: finalFinishReason });
        trace.finish(state, { finishReason: finalFinishReason });
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
        trace.event("persistence.error", {
          category: err instanceof Error ? err.name : "UnknownError",
        });
        console.error("Failed to update token usage in start cleanup:", err);
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
      }
      const state = aborted ? "cancelled" : providerFailed ? "failed" : "completed";
      trace.recordState(state, { finishReason: finalFinishReason });
      trace.finish(state, { finishReason: finalFinishReason });
    },
    trace,
  );

  return createUIMessageStreamResponse({
    stream: responseBranch,
    consumeSseStream: ({ stream }) => {
      streamRegistry.register(conversationId, stream);
    },
  });
}
