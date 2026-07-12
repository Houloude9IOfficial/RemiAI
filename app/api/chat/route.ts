import { NextResponse } from "next/server";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, providers } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { persistUIMessage } from "@/lib/chat/persist";

function titleFromMessage(message: UIMessage): string {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
  if (!text) return "New chat";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export async function POST(req: Request) {
  const { conversationId, messages: uiMessages } = (await req.json()) as {
    conversationId: number;
    messages: UIMessage[];
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

  const lastMessage = uiMessages[uiMessages.length - 1];
  if (lastMessage?.role === "user") {
    await persistUIMessage(conversationId, lastMessage);
    if (conversation.title === "New chat") {
      await db
        .update(conversations)
        .set({ title: titleFromMessage(lastMessage) })
        .where(eq(conversations.id, conversationId));
    }
  }

  const model = getLanguageModel(provider, conversation.modelId);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(uiMessages),
    stopWhen: stepCountIs(1),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ messages: finalMessages }) => {
      const assistantMessage = finalMessages[finalMessages.length - 1];
      if (assistantMessage?.role === "assistant") {
        await persistUIMessage(conversationId, assistantMessage);
      }
      await db
        .update(conversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
    },
  });
}
