import { NextResponse } from "next/server";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  providers,
  mcpServers,
  userPreferences,
  memories,
} from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";
import { persistUIMessage } from "@/lib/chat/persist";
import { getMcpTools } from "@/lib/mcp/tools";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildContextTools } from "@/lib/tools/context";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildExecutionTools } from "@/lib/tools/exec";
import { buildDocumentReaderTools } from "@/lib/tools/document-reader";

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
  const { conversationId, messages: uiMessages, agenticMode } = (await req.json()) as {
    conversationId: number;
    messages: UIMessage[];
    agenticMode?: boolean;
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

  // Gather memory tools (remember, search_memories)
  const memoryToolSet = buildMemoryTools();

  // Gather integration tools (Brave Search, Notion, Context7) based on config
  const integrationToolSet = await buildIntegrationTools();

  // Gather code execution tools (python_exec, js_exec)
  const executionToolSet = await buildExecutionTools();

  // Gather document reader tools (read_document)
  const documentToolSet = await buildDocumentReaderTools();

  // Merge all tool sets (last writer wins on name collision)
  const tools = {
    ...mcpToolSet,
    ...fsToolSet,
    ...contextToolSet,
    ...memoryToolSet,
    ...integrationToolSet,
    ...executionToolSet,
    ...documentToolSet,
  };

  // Build combined system prompt with user preferences
  const prefs = await db.select().from(userPreferences).get();
  const prefParts: string[] = [];
  if (prefs?.preferredName) {
    prefParts.push(`The user's preferred name is "${prefs.preferredName}". Address them by this name.`);
  }
  if (prefs?.preferences) {
    prefParts.push(`The user's preferences and context: ${prefs.preferences}`);
  }
  if (prefs?.personality) {
    prefParts.push(`Your personality and tone should follow this guidance: ${prefs.personality}`);
  }

  const systemTip = prefParts.length > 0
    ? `\n\n## User preferences\n${prefParts.join("\n")}`
    : "";

  // Inject saved memories into the system prompt for context
  const memoryRows = await db.select().from(memories).orderBy(memories.createdAt).all();
  const memoryTip = memoryRows.length > 0
    ? `\n\n## Saved memories\nThe following are things you have remembered about the user across conversations. Use them to provide personalized and contextually relevant responses.\n${memoryRows.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const modelMessages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT + systemTip + memoryTip,
    messages: modelMessages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    // Allow up to 100 steps normally, or 500 in agentic/goal mode
    // so the model can work autonomously until task completion
    stopWhen: stepCountIs(agenticMode ? 500 : 100),
    onFinish: async ({ usage }) => {
      // Accumulate token usage — this callback fires before
      // toUIMessageStreamResponse's onFinish
      if (usage) {
        await db
          .update(conversations)
          .set({
            totalInputTokens: sql`total_input_tokens + ${usage.inputTokens ?? 0}`,
            totalOutputTokens: sql`total_output_tokens + ${usage.outputTokens ?? 0}`,
          })
          .where(eq(conversations.id, conversationId));
      }
    },
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
