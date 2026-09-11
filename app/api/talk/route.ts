// ── Talk Mode API Route ────────────────────────────────────────────
// A lightweight streaming endpoint for the talk mode page.
// Uses the same provider infrastructure but with a talk-specific
// system prompt that tells the AI to speak conversationally.
// ────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { streamText } from "ai";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getLanguageModel } from "@/lib/providers/factory";
import { normalizeStreamError, encodeStreamError } from "@/lib/chat/error-payload";
import { buildContextTools } from "@/lib/tools/context";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildWebSearchTool } from "@/lib/tools/web-search";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { estimateTokenCount } from "@/lib/utils";

// ── Talk Mode System Prompt ─────────────────────────────────────────
// The AI is told to speak naturally, concisely, without markdown/emojis.

const TALK_SYSTEM_PROMPT = `You are in Talk Mode — a natural voice conversation with the user.

## Core rules

- Speak like a real person having a face-to-face conversation.
- Be concise and natural. Keep responses brief — 2-4 sentences is usually enough unless the user asks for more detail.
- NEVER use markdown formatting, bullet points, numbered lists, or any text formatting.
- NEVER use emojis or emoticons.
- NEVER use asterisks for emphasis or action descriptions like "*nods*" or "*laughs*".
- Write in plain, natural language that sounds good when read aloud.
- Use contractions (don't, can't, I'll, you're) for a natural conversational tone.
- Pause naturally between ideas. Vary sentence length.
- Be warm, attentive, and direct. Match the user's energy and tone.
- If you don't know something, say so simply — don't over-explain.
- If the user asks a complex question, give a clear, simple answer first, then offer to go deeper.

## Context and tools

You have access to all the same tools as the main chat — filesystem, web search, memory, etc. Feel free to use them when needed, but keep your responses conversational. When you use a tool, you don't need to announce it — just share what you found naturally.

## Output format — important

Your reply is read aloud by a speech synthesiser and shown as voice captions.

- Return ONLY what you want spoken to the user. Your answer is the message.
- Never include your reasoning, planning, working, or self-checks in the reply — no "let me think", no step-by-step derivation, no notes to yourself, no thinking tags of any kind.
- Think it through silently, then say the answer.

## Memory

Save important facts about the user using the remember tool, just like in chat mode.`;

// ── History Management ─────────────────────────────────────────────

interface TalkMessage {
  role: "user" | "assistant";
  content: string;
}

// ── POST Handler ───────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { messages, providerId, modelId } = (await req.json()) as {
      messages: TalkMessage[];
      providerId?: number;
      modelId?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    // If no provider/model specified, try to use the last selected model
    let resolvedProviderId = providerId;
    let resolvedModelId = modelId;

    if (!resolvedProviderId || !resolvedModelId) {
      // Fallback: get the first enabled provider with a default model
      const provider = await db
        .select()
        .from(providers)
        .where(eq(providers.enabled, true))
        .get();

      if (provider) {
        resolvedProviderId = provider.id;
        // Try to find a default model or use the first model
        const model = await db
          .select()
          .from(providerModels)
          .where(
            and(
              eq(providerModels.providerId, provider.id),
              eq(providerModels.enabled, true),
            ),
          )
          .get();

        if (model) {
          resolvedModelId = model.modelId;
        }
      }
    }

    if (!resolvedProviderId || !resolvedModelId) {
      return NextResponse.json(
        {
          error:
            "No model configured. Please select a model in the chat first.",
        },
        { status: 400 },
      );
    }

    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.id, resolvedProviderId))
      .get();

    if (!provider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }

    const model = getLanguageModel(provider, resolvedModelId);

    // Convert messages to core format
    const coreMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const timezone = req.headers.get("x-user-timezone") ?? undefined;
    const locale = req.headers.get("x-user-locale") ?? undefined;
    // Talk deliberately has a smaller, voice-friendly tool belt than full chat.
    // These tools are enough to answer current questions, inspect the local
    // environment, and remember useful context without sending 40 definitions
    // on every short spoken turn.
    const tools = {
      ...buildContextTools(req.headers.get("user-agent") ?? undefined, timezone, locale),
      ...buildMemoryTools(),
      web_search: buildWebSearchTool({ userContext: { timezone, language: locale } }),
      web_fetch: webFetchTool,
    };

    // Stream the response. Tool calls are allowed to run for several steps so
    // "look up X and tell me the answer" works in one spoken turn.
    const result = streamText({
      model,
      system: TALK_SYSTEM_PROMPT,
      messages: coreMessages,
      tools,
      stopWhen: ({ steps }) => steps.length >= 5,
      // Retry retryable provider failures up to 3 times before erroring out.
      maxRetries: 3,
    });

    // Stream only what the assistant is actually saying to the user.
    //
    // `fullStream` (rather than `textStream`) lets us drop every non-answer
    // part explicitly. Talk mode is read aloud, so reasoning/thinking deltas,
    // step markers and tool plumbing must never reach it.
    const stream = result.fullStream;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let streamedOutput = "";
          for await (const part of stream) {
            if (part.type === "text-delta") {
              streamedOutput += part.text;
              const data = JSON.stringify({ type: "text-delta", delta: part.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              continue;
            }

            if (part.type === "tool-call") {
              // Text produced before a tool call is working narration
              // ("let me look that up"), not the answer. Tell the client to
              // drop it from the captions and stop reading it out.
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "clear-text" })}\n\n`),
              );
              continue;
            }

            // reasoning-*, start/finish-step, tool-result, sources, … —
            // deliberately not spoken.
          }
          const usage = await result.usage;
          const inputTokens = usage?.inputTokens ?? estimateTokenCount(TALK_SYSTEM_PROMPT + JSON.stringify(coreMessages));
          const outputTokens = usage?.outputTokens ?? estimateTokenCount(streamedOutput);
          // Talk is metered at a deliberately transparent, provider-neutral
          // reference rate. This is a usage indicator, not a second provider
          // charge; users still pay their configured provider directly.
          const costUsd = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "usage", inputTokens, outputTokens, costUsd })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[Talk] Stream error:", err);
          const payload = normalizeStreamError(err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", errorText: encodeStreamError(payload) })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Talk] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
