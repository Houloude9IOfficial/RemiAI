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

    // Stream the response
    const result = streamText({
      model,
      system: TALK_SYSTEM_PROMPT,
      messages: coreMessages,
      // No tools in talk mode — keep it pure conversation
    });

    // Convert to text stream for SSE
    const textStream = result.textStream;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const delta of textStream) {
            const data = JSON.stringify({ type: "text-delta", delta });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
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
