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
import { buildProfileTools } from "@/lib/tools/profile";
import { buildRoutinesTools } from "@/lib/tools/routines";
import { buildScheduleTool } from "@/lib/tools/schedule";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { estimateTokenCount } from "@/lib/utils";
import {
  extractImageAttachments,
  stripImageMarkdown,
} from "@/lib/chat/process-images";

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

  // Profile tools (get_profile, update_profile)
  const profileToolSet = buildProfileTools();

  // Todo list tools for multi-step task planning
  const todoToolSet = buildTodoTools(conversationId);

  // Routine tools (create, run, list, update, delete routines)
  const routineToolSet = await buildRoutinesTools();

  // Scheduled tasks tool (schedule future tasks)
  const scheduleToolSet = await buildScheduleTool(conversationId);

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
    ...profileToolSet,
    ...routineToolSet,
    ...scheduleToolSet,
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

  // Inject profile details
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

  const profileTip = profileParts.length > 0
    ? `\n\n## User profile\nThe following is what you know about the user from their profile:\n${profileParts.map((p) => `- ${p}`).join("\n")}`
    : "";

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

  const fullSystemPrompt =
    SYSTEM_PROMPT + systemTip + profileTip + memoryTip + fileChangeTip + planModePrompt;
  const modelMessages = await convertToModelMessages(uiMessages);

  // ── Native image processing ───────────────────────────────────
  // Scan user messages for image upload markdown references (`![...](/api/chat/uploads/...)`)
  // and inject the raw image data as native multimodal content parts.
  // Modern LLMs (Claude 3.5, GPT-4o, Gemini) process these natively via their vision
  // encoder — far more efficient and reliable than the old read_media tool approach.
  for (const msg of modelMessages) {
    if (msg.role !== "user") continue;
    const content = msg.content;
    if (typeof content === "string") {
      const attachments = await extractImageAttachments(content);
      if (attachments.length > 0) {
        const cleanText = stripImageMarkdown(content);
        const parts: any[] = [];
        if (cleanText) {
          parts.push({ type: "text" as const, text: cleanText });
        }
        for (const att of attachments) {
          parts.push({
            type: "image" as const,
            image: att.buffer,
            mimeType: att.mimeType,
          });
        }
        msg.content = parts;
      }
    } else if (Array.isArray(content)) {
      // Check if any text part contains image references
      let hasImages = false;
      for (const part of content) {
        if (part.type === "text") {
          const attachments = await extractImageAttachments(part.text);
          if (attachments.length > 0) {
            hasImages = true;
            break;
          }
        }
      }
      if (hasImages) {
        const newParts: any[] = [];
        for (const part of content) {
          if (part.type === "text") {
            const attachments = await extractImageAttachments(part.text);
            if (attachments.length > 0) {
              const cleanText = stripImageMarkdown(part.text);
              if (cleanText) {
                newParts.push({ type: "text" as const, text: cleanText });
              }
              for (const att of attachments) {
                newParts.push({
                  type: "image" as const,
                  image: att.buffer,
                  mimeType: att.mimeType,
                });
              }
            } else {
              newParts.push(part);
            }
          } else {
            newParts.push(part);
          }
        }
        msg.content = newParts;
      }
    }
  }

  // Track whether onFinish successfully applied tokens, so the cleanup
  // doesn't double-count by applying the same usage again.
  let tokensApplied = false;

  // Capture the full error object from streamText's onError callback so we
  // can enrich the error chunk sent to the client (the SDK's default error
  // chunk only contains a generic "An error occurred." message).
  let capturedError: unknown = null;

  const result = streamText({
    model,
    system: fullSystemPrompt,
    messages: modelMessages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    // Allow up to 100 steps normally (chat/plan), or 500 in goal mode
    // so the model can work autonomously until task completion
    stopWhen: stepCountIs(mode === "goal" ? 500 : 100),
    onError: (err) => {
      capturedError = err;
      console.error("[stream] Provider error:", err);
    },
    onFinish: async ({ text: outputText, usage }) => {
      try {
        // Use provider's usage if available, otherwise estimate
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;

        // Estimate input tokens from system prompt + all messages
        const estimatedInput =
          inputTokens > 0
            ? inputTokens
            : estimateTokenCount(
                fullSystemPrompt +
                  uiMessages
                    .map(
                      (m) =>
                        m.parts
                          .filter(
                            (p): p is { type: "text"; text: string } =>
                              p.type === "text",
                          )
                          .map((p) => p.text)
                          .join(" "),
                    )
                    .join("\n"),
              );

        // Estimate output tokens from the generated text
        const estimatedOutput =
          outputTokens > 0 ? outputTokens : estimateTokenCount(outputText ?? "");

        await db
          .update(conversations)
          .set({
            totalInputTokens:
              sql`total_input_tokens + ${estimatedInput}`,
            totalOutputTokens:
              sql`total_output_tokens + ${estimatedOutput}`,
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

  // Pipe the response branch through a transform that enriches error chunks
  // with the full error details captured from onError.  Without this, the
  // client only sees "Error: An error occurred." instead of the actual
  // status code, response body, and other debugging information.
  const enrichedBranch = responseBranch.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === "error" && capturedError) {
          const err = capturedError as Record<string, unknown>;

          // For AI_RetryError the responseBody lives on nested errors
          const errs = (Array.isArray(err.errors) ? err.errors : []) as Array<Record<string, unknown>>;
          const responseBody = err.responseBody ?? (errs[0]?.responseBody ?? null);
          const statusCode = err.statusCode ?? (errs[0]?.statusCode ?? null);
          const url = err.url ?? (errs[0]?.url ?? null);

          controller.enqueue({
            type: "error",
            errorText: [
              `${err.name || "Error"}: ${err.message ?? ""}`,
              statusCode != null ? `\nStatus: ${statusCode}` : "",
              url ? `URL: ${url}` : "",
              responseBody
                ? `\nResponse:\n${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2)}`
                : "",
              err.reason ? `\nReason: ${err.reason}` : "",
              errs.length > 0
                ? `\nRetries (${errs.length}): ` +
                  errs
                    .slice(0, 3)
                    .map(
                      (e, i) =>
                        `[${i + 1}] ${e.name || "Error"}: ${e.message ?? ""}` +
                        (e.statusCode != null ? ` (${e.statusCode})` : ""),
                    )
                    .join(" → ") +
                  (errs.length > 3 ? ` +${errs.length - 3} more` : "")
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          } as any);
        } else {
          controller.enqueue(chunk);
        }
      },
    }),
  );

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
        const inputTokens = streamUsage?.inputTokens ?? 0;
        const outputTokens = streamUsage?.outputTokens ?? 0;

        // Estimate input from system prompt + messages if provider didn't give usage
        const estimatedInput =
          inputTokens > 0
            ? inputTokens
            : estimateTokenCount(
                fullSystemPrompt +
                  uiMessages
                    .map(
                      (m) =>
                        m.parts
                          .filter(
                            (p): p is { type: "text"; text: string } =>
                              p.type === "text",
                          )
                          .map((p) => p.text)
                          .join(" "),
                    )
                    .join("\n"),
              );

        // Also grab the final output text from stream usage's total
        const estimatedOutput =
          outputTokens > 0
            ? outputTokens
            : estimateTokenCount(await result.text);

        await db
          .update(conversations)
          .set({
            totalInputTokens: sql`total_input_tokens + ${estimatedInput}`,
            totalOutputTokens: sql`total_output_tokens + ${estimatedOutput}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(conversations.id, conversationId));
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
    stream: enrichedBranch,
    consumeSseStream: ({ stream }) => {
      streamRegistry.register(conversationId, stream);
    },
  });
}
