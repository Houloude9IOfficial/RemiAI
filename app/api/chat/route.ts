import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
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
import { SYSTEM_PROMPT_BASE, CREATE_VISUAL_SECTION, SESSION_FILES_SECTION } from "@/lib/chat/system-prompt";
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
import { buildCreateVisualTool } from "@/lib/tools/create-visual";
import { askQuestionsTool } from "@/lib/tools/ask-questions";
import { suggestFollowupsTool } from "@/lib/tools/suggest-followups";
import {
  buildMainSpawnAgentTool,
  buildGetAgentResultTool,
} from "@/lib/tools/agent-spawner";
import { buildTodoTools } from "@/lib/tools/todo";
import { buildFileIndexTools } from "@/lib/tools/file-index";
import { buildSessionFileTools } from "@/lib/session-files/tools";
import { buildProfileTools } from "@/lib/tools/profile";
import { buildRoutinesTools } from "@/lib/tools/routines";
import { buildScheduleTool } from "@/lib/tools/schedule";
import { buildToolHelpTool, buildListAvailableToolsTool } from "@/lib/tools/tool-help";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { estimateTokenCount } from "@/lib/utils";
import {
  extractImageAttachments,
  stripImageMarkdown,
} from "@/lib/chat/process-images";
import {
  normalizeStreamError,
  encodeStreamError,
  type StreamErrorPayload,
} from "@/lib/chat/error-payload";

// A response that ends with a commitment to take an action (e.g. "let me dig
// deeper into the pages") while the run made ZERO tool calls is almost always
// an interrupted run — the model intended to keep working but the generation
// was cut short (provider truncation, dropped tool calls, or an early stop).
// Used to detect silent stops that would otherwise look like a normal (but
// empty) completion. Only the TAIL of the response is matched: a completed
// reply ends with its conclusion, not with a promise to act.
const DANGLING_ACTION_TAIL_RE =
  /\b(let me|i'?ll|i'?m (going|about) to|gonna)\s+(also|just|first|now|then|quickly)?\s*(dig|check|look|search|fetch|find|crawl|scrape|read|pull|grab|dive|verify|confirm|explore|review|investigate|take a look|look into|see if|see what|find out|get|open|run|try|test|examine|inspect|gather|compile)\b/i;

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

  // Build create visual tool (conditionally based on user setting)
  const createVisualToolSet = await buildCreateVisualTool();
  const createVisualEnabled = "create_visual" in createVisualToolSet;

  // Built-in tools (delay, web_fetch, ask_questions, suggest_followups, get_tool_help, list_available_tools)
  const builtinToolSet = {
    delay: delayTool,
    web_fetch: webFetchTool,
    ask_questions: askQuestionsTool,
    suggest_followups: suggestFollowupsTool,
    ...createVisualToolSet,
    ...buildToolHelpTool(),
    ...buildListAvailableToolsTool(),
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

  // Session files tools — per-conversation private file sandbox
  const sessionFileToolSet = buildSessionFileTools(conversationId);

  // In plan mode, filter out write tools — AI can only read/plan, not modify files
  const writeBlocklist = [
    "write_file",
    "create_directory",
    "delete_directory",
    "rename_item",
    "session_file_write",
    "session_file_mkdir",
    "session_file_move",
    "session_file_delete",
  ];
  const effectiveFsToolSet =
    mode === "plan"
      ? Object.fromEntries(
          Object.entries(fsToolSet).filter(([key]) => !writeBlocklist.includes(key)),
        )
      : fsToolSet;
  const effectiveSessionFileToolSet =
    mode === "plan"
      ? Object.fromEntries(
          Object.entries(sessionFileToolSet).filter(
            ([key]) => !writeBlocklist.includes(key),
          ),
        )
      : sessionFileToolSet;

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
    ...effectiveSessionFileToolSet,
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

  // Adaptive system prompt: detect lower-end models and give them a shorter prompt
  const modelId = conversation.modelId.toLowerCase();
  // Detect lower-end models by checking for known small-model patterns.
  // "Small" = models under ~30B params or known to have <32K context or poor
  // instruction-following. Only models flagged as low-capability get an even
  // shorter prompt to avoid filling their limited context window.
  const isLowCapability =
    // Small parameter-count models
    /\b(3b|7b|8b|2b|1\.5b|0\.5b|1b|1\.1b|1\.3b|1\.6b|2\.7b|3\.8b)\b/i.test(
      modelId,
    ) ||
    // Low-capability model families (explicitly small variants only)
    /(llama-3\.2-(1b|3b)|phi-3-(mini|small)|gemma-2-(2b|9b)|mistral-7b|mixtral-8x7b|falcon-7b|deepseek-(coder|lite|r1-distill)|qwen-2\.5-(0\.5b|1\.5b|3b|7b)|olmo-7b|granite-3b|aya-(8b|23b)|command-r(\+|7b)?-04b|smollm2|stablelm-2|internlm2-(1\.8b|7b))/.test(
      modelId,
    );

  // Conditionally include create-visual instructions based on tool toggle
  const visualSection = createVisualEnabled ? CREATE_VISUAL_SECTION : '';

  const fullSystemPrompt =
    (isLowCapability
      ? SYSTEM_PROMPT_BASE + visualSection + SESSION_FILES_SECTION +
        `\n\n**CRITICAL: Keep responses very short and focused.** Use the simplest tool for each task. If unsure about a tool, call \`get_tool_help\`. Avoid multi-step planning unless the task truly requires it.`
      : SYSTEM_PROMPT_BASE + visualSection + SESSION_FILES_SECTION) +
    systemTip +
    profileTip +
    memoryTip +
    fileChangeTip +
    planModePrompt;
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

  // Capture a normalized error payload from streamText's onError callback so
  // the frontend can render a friendly, structured error (instead of a raw
  // provider stack or a generic "An error occurred").
  let capturedErrorPayload: StreamErrorPayload | null = null;

  const result = streamText({
    model,
    system: fullSystemPrompt,
    messages: modelMessages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    // Ask providers for a generous output budget so low default caps don't
    // cut the model off mid-response — the #1 cause of runs that appear to
    // "just stop" after a partial reply. 4096 covers typical chat replies;
    // goal mode gets a much larger budget for long autonomous runs. Kept
    // conservative so small-context models don't reject the request.
    maxOutputTokens: mode === "goal" ? 16_384 : 4_096,
    // Allow up to 100 steps normally (chat/plan), or 500 in goal mode
    // so the model can work autonomously until task completion
    stopWhen: stepCountIs(mode === "goal" ? 10000 : 7500),
    onError: (err) => {
      capturedErrorPayload = normalizeStreamError(err);
      console.error("[stream] Provider error:", err);
    },
    onFinish: async ({ text: outputText, usage, finishReason, steps, toolCalls }) => {
      // Treat provider/SDK hard stops as a structured "interrupted" error so
      // users understand why a run appeared to "just stop" — and so the UI
      // can offer a one-click Continue. Without this, these runs end with a
      // clean finish chunk and the partial response silently sits there.
      const runText =
        (steps ?? [])
          .map((step) => step.text ?? "")
          .filter(Boolean)
          .join("\n") || outputText || "";
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
      // Dangling-promise detection: only fire for short text-only responses.
      // A dangling stop is a brief fragment (the reported case was ~250
      // chars); a long completed reply that happens to close with a promise
      // phrase would be a false positive, so keep the length gate tight.
      const isShortTextOnly =
        runText.length < 600 && (steps ?? []).at(-1)?.toolCalls?.length === 0;
      const stoppedEarly =
        // Output token limit / max steps reached, or the loop ended while
        // tool calls were still pending.
        finishReason === "length" ||
        finishReason === "tool-calls" ||
        // The model's FINAL sentence commits to an action ("let me dig
        // deeper...") but the run ended without calling any more tools — the
        // generation was cut short. Only the last sentence counts: a
        // completed reply ends with its conclusion, not with a promise to act.
        (finishReason === "stop" &&
          isShortTextOnly &&
          DANGLING_ACTION_TAIL_RE.test(
            runText.slice(-240).split(/[.!?]\s+/).filter(Boolean).pop() ?? "",
          ));

      if (stoppedEarly) {
        capturedErrorPayload = {
          version: 1,
          category: "step_limit",
          title:
            finishReason === "stop" ? "Remi stopped mid-task" : "Step limit reached",
          message:
            finishReason === "stop"
              ? "The response ended before the task was completed. Continue to resume from where it stopped."
              : "This run reached the configured step/token limit before completion. Continue to resume from where it stopped.",
          technical: `finishReason=${finishReason} steps=${(steps ?? []).length} toolCalls=${hasToolCalls ? toolCalls.length : 0}`,
          retryable: true,
          shouldResume: true,
        };
      }

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
  //
  // Pass a real `onError` so tool errors (e.g. "Root directory 8 not found")
  // reach the UI and the model instead of the SDK's generic
  // "An error occurred." fallback. Without this, the model can never
  // self-correct (e.g. re-call list_permitted_roots) because it only sees
  // a generic message.
  const uiMessageStream = result.toUIMessageStream({
    originalMessages: uiMessages,
    generateMessageId: () => crypto.randomUUID(),
    // Return the PLAIN error message here. The SDK uses this callback's return
    // value as the `errorText` for inline tool errors (tool-input-error,
    // tool-output-error parts) that render directly on the tool card — encoding
    // those as RMERR_JSON blobs made cards show raw "RMERR_JSON:%7B..." garbage
    // instead of the real message. Terminal stream failures are still converted
    // into structured RMERR_JSON payloads by the transform below.
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      return message.trim() || "An error occurred.";
    },
  });

  // Tee the stream: [persistBranch, responseBranch]
  const [persistBranch, responseBranch] = uiMessageStream.tee();

  // Pipe the response branch through a transform that injects a structured
  // error payload for user-friendly frontend messaging.
  //
  // Interrupted runs (step/output limit, dangling promise, provider
  // truncation) end with a CLEAN finish chunk — the SDK never emits an error
  // chunk for them, so the UI would silently stop with no Continue option.
  // We hold the terminal finish chunk and, when the run was interrupted
  // (capturedErrorPayload was set by onFinish), emit an error chunk instead.
  // This is race-safe: streamText's onFinish fires in the SDK's upstream
  // consumer flush, which always completes before this transform's flush.
  let pendingFinishChunk: UIMessageChunk | null = null;
  const enrichedBranch = responseBranch.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "error") {
          const payload = capturedErrorPayload ?? normalizeStreamError(chunk.errorText);
          controller.enqueue({
            type: "error",
            errorText: encodeStreamError(payload),
          } as UIMessageChunk);
        } else if (chunk.type === "finish") {
          pendingFinishChunk = chunk;
        } else {
          controller.enqueue(chunk);
        }
      },
      flush(controller) {
        if (!pendingFinishChunk) return;
        if (capturedErrorPayload) {
          controller.enqueue({
            type: "error",
            errorText: encodeStreamError(capturedErrorPayload),
          } as UIMessageChunk);
        } else {
          controller.enqueue(pendingFinishChunk);
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
