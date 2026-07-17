import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { streamRegistry } from "@/lib/chat/stream-registry";
import { periodicallyPersistMessages } from "@/lib/chat/persist-interval";
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
import { createMcpToolsManager } from "@/lib/mcp/tools";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildContextTools } from "@/lib/tools/context";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildExecutionTools } from "@/lib/tools/exec";
import { buildDocumentReaderTools } from "@/lib/tools/document-reader";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { askQuestionsTool } from "@/lib/tools/ask-questions";
import {
  buildMainSpawnAgentTool,
  buildGetAgentResultTool,
} from "@/lib/tools/agent-spawner";
import { buildTodoTools } from "@/lib/tools/todo";
import { buildFileIndexTools } from "@/lib/tools/file-index";
import { buildRoutinesTools } from "@/lib/tools/routines";
import { queryRecentChanges } from "@/lib/fs/file-index";

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
  const { conversationId, messages: uiMessages = [] } = (await req.json()) as {
    conversationId: number;
    messages?: UIMessage[];
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

  // Read mode from the conversation in the database
  const mode = (conversation as any).mode ?? "chat";

  const provider = await db
    .select()
    .from(providers)
    .where(eq(providers.id, conversation.providerId))
    .get();
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  if (uiMessages.length === 0) {
    return NextResponse.json(
      { error: "No messages to process" },
      { status: 400 },
    );
  }

  const lastMessage = uiMessages[uiMessages.length - 1];
  if (lastMessage?.role === "user") {
    await persistUIMessage(conversationId, lastMessage);
    await db
      .update(conversations)
      .set({
        title: conversation.title === "New chat"
          ? titleFromMessage(lastMessage)
          : conversation.title,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conversationId));
  }

  const model = getLanguageModel(provider, conversation.modelId);

  // Gather MCP tools from enabled servers
  const enabledMcpServers = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.enabled, true))
    .all();

  // Gather MCP tools from enabled servers — keep clients alive during streaming
  let closeMcpClients: (() => Promise<void>) | undefined;
  let mcpToolSet: Record<string, unknown> | undefined;

  if (enabledMcpServers.length > 0) {
    const manager = await createMcpToolsManager(enabledMcpServers);
    mcpToolSet = manager.tools;
    closeMcpClients = manager.close;
  } else {
    mcpToolSet = undefined;
  }

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

  // Built-in always-on tools (delay, web_fetch, ask_questions)
  const builtinToolSet = {
    delay: delayTool,
    web_fetch: webFetchTool,
    ask_questions: askQuestionsTool,
  };

  // Agent spawner tools with chaining support
  const agentToolSet = {
    spawn_agent: buildMainSpawnAgentTool(provider, conversation.modelId, conversationId),
    get_agent_result: buildGetAgentResultTool(),
  };

  // File index tools for querying recent changes and searching indexed files
  const fileIndexToolSet = buildFileIndexTools();

  // Todo list tools for multi-step task planning
  const todoToolSet = buildTodoTools(conversationId);

  // Routine tools (create, run, list, update, delete routines)
  const routineToolSet = await buildRoutinesTools();

  // In plan mode, filter out write tools — AI can only read/plan, not modify files
  const effectiveFsToolSet =
    mode === "plan"
      ? Object.fromEntries(
          Object.entries(fsToolSet).filter(
            ([key]) =>
              !["write_file", "create_directory", "delete_directory", "rename_item"].includes(
                key,
              ),
          ),
        )
      : fsToolSet;

  // Build plan-mode specific system prompt instructions
  const planModePrompt =
    mode === "plan"
      ? `

## PLAN MODE — Read-only planning session

You are currently in **Plan mode**. This means:
- You CAN read files, list directories, search files, browse the web, and gather information.
- You CAN use \`todos_init\` to create a step-by-step plan.
- You CAN use \`ask_questions\` to gather information from the user.
- You CANNOT write, create, delete, or rename any files or directories.
- Your goal is to help the user plan their project by asking clarifying questions, researching options, and creating a detailed todo plan.
- Focus on understanding the user's requirements, exploring their codebase, and proposing a clear implementation plan.
- Use \`todos_init\` at the start to lay out the steps you'll help them plan.
- Do NOT attempt to modify any files — you don't have permission to write in this mode.`
      : "";

  // Merge all tool sets (last writer wins on name collision)
  const tools = {
    ...mcpToolSet,
    ...effectiveFsToolSet,
    ...contextToolSet,
    ...memoryToolSet,
    ...integrationToolSet,
    ...executionToolSet,
    ...documentToolSet,
    ...builtinToolSet,
    ...agentToolSet,
    ...fileIndexToolSet,
    ...todoToolSet,
    ...routineToolSet,
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

  // Inject recent file changes into the system prompt for freshness
  const recentChanges = await queryRecentChanges(10);
  const fileChangeTip = recentChanges.length > 0
    ? `\n\n## Recent file changes\nThe following files were recently modified in your watched directories. Use \`query_recent_changes\` for a fuller list, or these are the 10 most recent:\n${recentChanges.map((c) => `- [${c.changeType}] ${c.directoryLabel}/${c.relativePath} (${c.changedAt})`).join("\n")}`
    : "";

  const modelMessages = await convertToModelMessages(uiMessages);

  // Track whether onFinish successfully applied tokens, so the cleanup
  // doesn't double-count by applying the same usage again.
  let tokensApplied = false;

  const result = streamText({
    model,
    system: SYSTEM_PROMPT + systemTip + memoryTip + fileChangeTip + planModePrompt,
    messages: modelMessages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    // Allow up to 100 steps normally (chat/plan), or 500 in goal mode
    // so the model can work autonomously until task completion
    stopWhen: stepCountIs(mode === "goal" ? 500 : 100),
    onFinish: async ({ usage }) => {
      // Accumulate token usage — this callback fires before
      // toUIMessageStreamResponse's onFinish
      if (!usage || (!usage.inputTokens && !usage.outputTokens)) return;
      try {
        await db
          .update(conversations)
          .set({
            totalInputTokens: sql`total_input_tokens + ${usage.inputTokens ?? 0}`,
            totalOutputTokens: sql`total_output_tokens + ${usage.outputTokens ?? 0}`,
          })
          .where(eq(conversations.id, conversationId));
        tokensApplied = true;
      } catch (err) {
        console.error("Failed to update token usage in onFinish:", err);
      }
    },
  });

  // Get the UIMessageChunk stream so we can tee it — one branch for the
  // HTTP response, one for periodic persistence to the database.
  const uiMessageStream = result.toUIMessageStream({
    originalMessages: uiMessages,
    generateMessageId: () => crypto.randomUUID(),
  });

  // Tee the stream: [persistBranch, responseBranch]
  const [persistBranch, responseBranch] = uiMessageStream.tee();

  // Periodically persist partial messages to the DB (every 2s).
  // This ensures a page refresh shows partial AI responses.
  periodicallyPersistMessages(conversationId, uiMessages, persistBranch, async () => {
    // Cleanup after stream finishes:
    if (closeMcpClients) {
      await closeMcpClients();
    }
    // If onFinish failed or was skipped, apply tokens here as a fallback.
    // Only runs if onFinish didn't already apply them (avoids double-count).
    if (!tokensApplied) {
      try {
        const streamUsage = await result.usage;
        if (streamUsage && (streamUsage.inputTokens || streamUsage.outputTokens)) {
          await db
            .update(conversations)
            .set({
              totalInputTokens: sql`total_input_tokens + ${streamUsage.inputTokens ?? 0}`,
              totalOutputTokens: sql`total_output_tokens + ${streamUsage.outputTokens ?? 0}`,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(conversations.id, conversationId));
        } else {
          await db
            .update(conversations)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(conversations.id, conversationId));
        }
      } catch (err) {
        console.error("Failed to update token usage in cleanup:", err);
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
      }
    } else {
      // Tokens already applied — just update updatedAt
      await db
        .update(conversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
    }
  });

  // Build the SSE response for the client, and register the SSE stream
  // for reconnection support.
  return createUIMessageStreamResponse({
    stream: responseBranch,
    consumeSseStream: ({ stream }) => {
      streamRegistry.register(conversationId, stream);
    },
  });
}
