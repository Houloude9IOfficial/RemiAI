import { NextResponse } from "next/server";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, providers, mcpServers } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { persistUIMessage } from "@/lib/chat/persist";
import { getMcpTools } from "@/lib/mcp/tools";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildContextTools } from "@/lib/tools/context";

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

  // Gather MCP tools from enabled servers
  const enabledMcpServers = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.enabled, true))
    .all();

  const mcpToolSet = enabledMcpServers.length > 0
    ? await getMcpTools(enabledMcpServers)
    : undefined;

  // Gather filesystem tools from configured directories
  const fsToolSet = await buildFilesystemTools();

  // Gather context tools (time, device info)
  const contextToolSet = buildContextTools(
    req.headers.get("user-agent") ?? undefined,
  );

  // Merge all tool sets (filesystem tools take precedence on name collision)
  const tools = { ...mcpToolSet, ...fsToolSet, ...contextToolSet };

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(uiMessages),
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    // Allow up to 100 steps so the model can make multiple tool calls
    // in sequence (e.g. list directory → read file → respond)
    stopWhen: stepCountIs(100),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ messages: finalMessages }) => {
      // Persist all new messages (multi-step tool calls may produce
      // multiple intermediate messages — tool-call, tool-result, final text)
      const existingIds = new Set(uiMessages.map((m) => m.id));
      for (const msg of finalMessages) {
        if (!existingIds.has(msg.id)) {
          await persistUIMessage(conversationId, msg);
        }
      }
      await db
        .update(conversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
    },
  });
}
