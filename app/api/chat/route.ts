import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/validation/api";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
  type ToolSet,
} from "ai";
import { streamRegistry } from "@/lib/chat/stream-registry";
import { periodicallyPersistMessages } from "@/lib/chat/persist-interval";
import { eq, sql, count } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  providers,
  providerModels,
  mcpServers,
  userPreferences,
  messages,
} from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { streamingReasoningProviderOptions } from "@/lib/providers/reasoning";
import {
  SYSTEM_PROMPT_BASE,
  SYSTEM_PROMPT_BASE_NO_MEMORY,
  CREATE_VISUAL_SECTION,
  RESEARCH_SECTION,
  SESSION_FILES_SECTION,
} from "@/lib/chat/system-prompt";
import { PERSISTENCE_GUIDANCE } from "@/lib/chat/persistence-guidance";
import {
  buildCachedInstructions,
  markLastToolForCache,
} from "@/lib/chat/prompt-cache";
import {
  optimizeMessageHistory,
  RECENT_MESSAGES_KEPT,
} from "@/lib/chat/history-optimizer";
import { retrieveRelevantMemories } from "@/lib/chat/memories";
import {
  summarizeConversationBackground,
  shouldSummarize,
  SUMMARIZE_RECENT_KEEP,
} from "@/lib/chat/summarizer";
import {
  activeToolNames,
  buildLoadToolGroupsTool,
  buildToolAvailabilityNote,
  computeActiveToolGroups,
  parseStoredToolState,
  persistActiveToolGroups,
} from "@/lib/chat/tool-groups";
import {
  reconstructConversationHistory,
  MAX_DELTA_MESSAGES,
} from "@/lib/chat/history-reconstruction";
import { autoTitleConversation } from "@/lib/chat/title-generator";
import { createMcpToolsManager } from "@/lib/mcp/tools";
import { buildFilesystemTools } from "@/lib/fs/tools";
import { buildContextTools } from "@/lib/tools/context";
import { buildMemoryTools } from "@/lib/tools/memories";
import { buildIntegrationTools } from "@/lib/tools/integrations";
import { buildExecutionTools } from "@/lib/tools/exec";
import { buildPlaywrightTools } from "@/lib/tools/playwright";
import { buildDocumentReaderTools } from "@/lib/tools/document-reader";
import { buildMediaTools } from "@/lib/media/tools";
import { delayTool } from "@/lib/tools/delay";
import { webFetchTool } from "@/lib/tools/web-fetch";
import { buildCreateVisualTool } from "@/lib/tools/create-visual";
import { askQuestionsTool } from "@/lib/tools/ask-questions";
import { suggestFollowupsTool } from "@/lib/tools/suggest-followups";
import { setRunNameTool } from "@/lib/tools/run-name";
import { buildSendNotificationTool } from "@/lib/tools/notifications";
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
import { buildSkillsToolSet } from "@/lib/skills/tools";
import { buildActiveSkillsSection } from "@/lib/skills/system-prompt";
import { userContextFromHeaders } from "@/lib/geo";
import { queryRecentChanges } from "@/lib/fs/file-index";
import { estimateTokenCount, normaliseTool } from "@/lib/utils";
import {
  extractImageAttachments,
  stripImageMarkdown,
} from "@/lib/chat/process-images";
import {
  normalizeStreamError,
  encodeStreamError,
  type StreamErrorPayload,
} from "@/lib/chat/error-payload";
import { createRunTrace } from "@/lib/observability/run-trace";
import {
  advanceBuildRepairState,
  buildRepairGuidance,
  type BuildRepairState,
} from "@/lib/chat/build-repair";
import {
  chooseQualityStrategy,
  estimateTaskComplexity,
  normalizeQualityPolicy,
} from "@/lib/chat/quality-policy";
import {
  chooseModelRoute,
  type ModelRouteCandidate,
} from "@/lib/chat/model-routing";
import { verifyQualityAnswer } from "@/lib/chat/quality-verifier";
import {
  buildRunSummary,
  buildPartsFromSteps,
  checksFromSteps,
  finishBuildRun,
  recordBuildRun,
  summarizeChangedFiles,
  updateBuildRunCheckpoint,
  type BuildCheckpoint,
} from "@/lib/build/runs";
import {
  recordCitedClaims,
  withSourceProvenance,
} from "@/lib/research/source-storage";
import { saveBuildResultArtifact } from "@/lib/artifacts/storage";

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

/**
 * Wrap tools so directory-based (`rootId` / `relativePath`) access is
 * rejected, keeping only chat-file `url` access. Used for fully isolated
 * (memory-disabled) chats: read_document / media tools may still read files
 * the user explicitly attached to THIS chat, but never the user's configured
 * directories. The model gets a clear string result instead of a throw so it
 * can recover (e.g. ask for the file as an attachment).
 */
function restrictToChatUrls(tools: Record<string, unknown>): Record<string, unknown> {
  const restricted: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as Record<string, unknown>;
    const originalExecute = t.execute as
      | ((args: Record<string, unknown>) => unknown)
      | undefined;
    restricted[name] = originalExecute
      ? {
          ...t,
          execute: (args: Record<string, unknown>) => {
            if (args && (args.rootId !== undefined || args.relativePath !== undefined)) {
              return "Directory access is disabled in this chat (memory is off — fully isolated). Attach the file to the chat and read it via its `url` instead.";
            }
            return originalExecute(args);
          },
        }
      : t;
  }
  return restricted;
}

// ── Request validation ────────────────────────────────────────────────
// ChatGPT-style chat requests: the client ships only the NEW message(s) plus
// the conversation id — never the full history (that caused 413s on long
// chats). The server rebuilds the full conversation from the `messages`
// table and merges this delta in.
const chatRequestSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()).default([]),
      }),
    )
    .min(1, "A chat request must include at least one message")
    .max(
      MAX_DELTA_MESSAGES,
      `A chat request can carry at most ${MAX_DELTA_MESSAGES} messages — new clients only send the delta; the server reconstructs the full history`,
    ),
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  messageId: z.string().optional(),
});

export async function POST(req: Request) {
  const trace = createRunTrace({ kind: "chat" });
  trace.metric("retryBudget", 3);
  trace.event("request.received", { method: "POST" });

  // Validate the request body server-side so a malformed payload is rejected
  // with a clear 400 instead of silently corrupting conversation state.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    trace.finish("failed", { phase: "request_validation" });
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    trace.finish("failed", { phase: "request_validation" });
    return jsonError(parsed.error);
  }
  const { conversationId, trigger, messageId } = parsed.data;
  trace.metric("conversationId", conversationId);
  trace.metric("requestMessageCount", parsed.data.messages.length);
  trace.event("request.validated", { trigger });
  // The delta's `parts` are a JSON round-trip of UI parts — validated as a
  // generic array above, narrowed to the SDK's UIMessage shape here.
  const deltaMessages = parsed.data.messages as UIMessage[];

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
  // Captured here (after the guard) so the narrowed `string` type survives
  // into closures like streamText's onFinish below.
  const conversationModelId = conversation.modelId;

  // Read mode from the conversation in the database
  let mode = conversation.mode ?? "chat";

  // Per-chat memory switch: when off, NO saved memories are injected into the
  // system prompt and the memory tools (remember / search_memories /
  // get_recent_memories) are not registered — the AI can neither read nor
  // write memory snapshots from this conversation.
  const memoryEnabled = conversation.memoryEnabled !== false;

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

  if (deltaMessages.length === 0) {
    trace.finish("failed", { phase: "request_validation" });
    return NextResponse.json(
      { error: "No messages to process" },
      { status: 400 },
    );
  }

  // ── First-exchange detection (for background auto-titling) ───────────
  // A brand-new chat starts with zero persisted messages and the default
  // "New chat" title. If that still holds at request time, the response we
  // are about to generate is the FIRST AI response — when it completes we'll
  // kick off a cheap background completion that turns the first two messages
  // into a proper title (e.g. "Particle Engine Error Fix"), so the sidebar
  // shows something meaningful even if the user already navigated away.
  const messageCountStartedAt = performance.now();
  const [countRow] = await db
    .select({ count: count() })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .all();
  trace.dbQuery("message_count", messageCountStartedAt);
  const existingMessageCount = countRow?.count ?? 0;
  const isFirstExchange =
    existingMessageCount === 0 && conversation.title === "New chat";

  // ── Reconstruct the full conversation server-side (ChatGPT-style) ───
  // The client only sent the newest message(s). Load everything already
  // persisted for this conversation, apply regenerate truncation, merge the
  // delta (deduped by uiId), and persist any NEW user messages. Everything
  // downstream (`uiMessages`) now sees the complete, ordered history — the
  // exact same shape the client used to upload on every message.
  const reconstructionStartedAt = performance.now();
  const uiMessages = await reconstructConversationHistory(db, {
    conversationId,
    deltaMessages,
    trigger,
    messageId,
  });
  trace.dbQuery("conversation_reconstruction", reconstructionStartedAt, {
    messageCount: uiMessages.length,
  });
  trace.metric("reconstructedMessageCount", uiMessages.length);

  const lastMessage = uiMessages[uiMessages.length - 1];
  if (lastMessage?.role === "user") {
    await db
      .update(conversations)
      .set({
        title: conversation.title === "New chat"
          ? titleFromMessage(lastMessage)
          : conversation.title,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conversationId));

    const previousMessage = uiMessages[uiMessages.length - 2];
    const answeredPlanQuestions = mode === "plan" && previousMessage?.role === "assistant" &&
      previousMessage.parts.some((part) => {
        if (!part || typeof part !== "object" || !("output" in part)) return false;
        const output = part.output;
        return output !== null && typeof output === "object" &&
          "type" in output && output.type === "questions";
      });
    if (answeredPlanQuestions) {
      mode = "goal";
      await db.update(conversations)
        .set({ mode: "goal", updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
    }
  }

  const promptAssemblyStartedAt = performance.now();

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

  // Gather filesystem tools from configured directories. Fully isolated
  // (memory-disabled) chats get NO filesystem access — the AI cannot read or
  // write the user's directories at all.
  const fsToolSet = memoryEnabled ? await buildFilesystemTools() : {};

  // User context sent by the browser (timezone + locale). Used to report the
  // user's LOCAL time in get_time_details and to localize web search results.
  const userContext = userContextFromHeaders(
    req.headers.get("x-user-timezone"),
    req.headers.get("x-user-locale"),
  );

  // Gather context tools (time, device info)
  const contextToolSet = buildContextTools(
    req.headers.get("user-agent") ?? undefined,
    userContext.timezone,
    userContext.language,
  );

  // Gather memory tools (remember, search_memories, get_recent_memories).
  // Skipped entirely for memory-disabled chats (e.g. temporary chats) so the
  // AI cannot read or write memory snapshots — the tools simply don't exist
  // in the toolset for those requests.
  const memoryToolSet = memoryEnabled ? buildMemoryTools() : {};

  // Gather integration tools (Brave Search, Notion, Context7) based on config
  const integrationToolSet = await buildIntegrationTools(userContext);
  const sourceProvenanceOptions = {
    conversationId,
    sourceRunId: trace.traceId,
  };
  const sourceAwareWebFetchTool = withSourceProvenance(
    webFetchTool,
    "web_fetch",
    sourceProvenanceOptions,
  );
  const sourceAwareIntegrationToolSet = Object.fromEntries(
    Object.entries(integrationToolSet).map(([name, tool]) =>
      [
        name,
        [
          "brave_web_search",
          "brave_image_search",
          "news_search",
          "news_top_headlines",
          "fc_search",
          "fc_scrape",
          "fc_crawl",
        ].includes(name)
          ? withSourceProvenance(tool, name, sourceProvenanceOptions)
          : tool,
      ] as const,
    ),
  );

  // Gather code execution tools (python_exec, js_exec, bash_execute). Code
  // runs on the user's machine and can reach their data — excluded entirely
  // from fully isolated (memory-disabled) chats.
  const executionToolSet = memoryEnabled
    ? await buildExecutionTools(
        conversation.bashMode === "full" ? "full" : "sandboxed",
      )
    : {};

  // Gather native Playwright browser automation tools (browser_open, ...)
  const playwrightToolSet = await buildPlaywrightTools(conversationId);

  // Gather document reader tools (read_document) and media tools. In fully
  // isolated (memory-disabled) chats these are restricted to chat-file URLs
  // only — rootId-based directory access is rejected (the tool sets stay so
  // files the user explicitly attaches in THIS chat still work).
  const documentToolSet = memoryEnabled
    ? await buildDocumentReaderTools()
    : restrictToChatUrls(await buildDocumentReaderTools());

  // Gather media tools (get_media_metadata, convert_media, extract_audio,
  // extract_video_frames, transcribe_audio, manage_transcription_models) —
  // outputs default to this conversation's session sandbox
  const mediaToolSet = memoryEnabled
    ? buildMediaTools(conversationId)
    : restrictToChatUrls(buildMediaTools(conversationId));

  // Build create visual tool (conditionally based on user setting)
  const createVisualToolSet = await buildCreateVisualTool();
  const createVisualEnabled = "create_visual" in createVisualToolSet;

  // Built-in tools (delay, web_fetch, notifications, ask_questions, suggest_followups, get_tool_help, list_available_tools)
  const builtinToolSet = {
    delay: delayTool,
    send_notification: buildSendNotificationTool(conversationId),
    web_fetch: sourceAwareWebFetchTool,
    ask_questions: askQuestionsTool,
    suggest_followups: suggestFollowupsTool,
    set_run_name: setRunNameTool,
    ...createVisualToolSet,
    ...buildToolHelpTool(),
    ...buildListAvailableToolsTool(),
  };

  // Agent spawner tools with chaining support. Spawned sub-agents bundle
  // memory/profile tools, so fully isolated chats can't spawn them.
  const agentToolSet = memoryEnabled
    ? {
        spawn_agent: buildMainSpawnAgentTool(
          provider,
          conversation.modelId,
          conversationId,
          userContext,
        ),
        get_agent_result: buildGetAgentResultTool(),
      }
    : {};

  // File index tools for querying recent changes and searching indexed files.
  // Excluded from fully isolated chats — the file index is a persistent scan
  // of the user's directories.
  const fileIndexToolSet = memoryEnabled ? buildFileIndexTools() : {};

  // Profile tools (get_profile, update_profile) — the profile is the user's
  // personal data; excluded from fully isolated (memory-disabled) chats.
  const profileToolSet = memoryEnabled ? buildProfileTools() : {};

  // Todo list tools for multi-step task planning
  const todoToolSet = buildTodoTools(conversationId);

  // Routine tools (create, run, list, update, delete routines)
  const routineToolSet = await buildRoutinesTools(conversationId);

  // Scheduled tasks tool (schedule future tasks)
  const scheduleToolSet = await buildScheduleTool(conversationId);

  // Session files tools — per-conversation private file sandbox
  const sessionFileToolSet = buildSessionFileTools(conversationId, {
    sourceRunId: trace.traceId,
  });

  // Skills tools (list_skills, load_skill) — the "plugins" analog; hidden in
  // fully isolated (memory-disabled) chats just like ChatGPT temp chats ignore
  // plugins.
  const skillsToolSet = memoryEnabled ? buildSkillsToolSet() : {};

  // In plan mode, filter out write tools — AI can only read/plan, not modify files
  const writeBlocklist = [
    "write_file",
    "edit_file",
    "create_directory",
    "delete_directory",
    "rename_item",
    "session_file_write",
    "session_file_edit",
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

  // Build mode-specific system prompt instructions
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
  const buildModePrompt =
    mode === "build"
      ? `

## BUILD MODE — Deliver a verified software change

You are currently in **Build mode**. Treat each request as a task contract, not as a request for a code snippet.

Before editing:
- State a concise plan and the acceptance checks you will use.
- Inspect the relevant repository files and identify the correct permitted directory.
- Prefer \`edit_file\` for existing files and use normalized forward-slash paths. Use \`write_file\` only for new files or intentional full replacements.

While working:
- Keep the work scoped to the user's request and use \`todos_init\`/\`todos_update\` for multi-step tasks.
- Run the narrowest relevant typecheck, test, build, or preview command with \`bash_execute\` after changes. Do not treat file writes alone as verification.
- For web outputs, perform a bounded preview smoke check in one command: start the local server, probe a localhost/127.0.0.1 URL with curl or wget, then terminate the server before the command exits. Never claim a preview passed from a server start alone.
- If a check fails or is incomplete, automatically perform at most two repair attempts: inspect the error, edit with file tools, rerun the failed check, and stop with an honest failure report if it still fails.
- If a check fails, diagnose the output, repair the change, and rerun the failed check when practical. A failed check must remain visible in the final report.
- Do not use Bash to create, edit, or delete files; use the file tools so the change ledger remains inspectable.

Definition of done:
1. The requested files or behavior are implemented.
2. Relevant checks were run and their actual outcomes are known.
3. The final response lists changed files, checks run, and any remaining failure or uncertainty.
4. Never claim the task is complete or verified when a relevant check failed, timed out, or was not run.`
      : "";

  // Merge all tool sets (last writer wins on name collision). Typed as a
  // loose record so the list_available_tools rebuild below can replace the
  // original entry.
  const tools: Record<string, unknown> = {
    ...mcpToolSet,
    ...effectiveFsToolSet,
    ...contextToolSet,
    ...memoryToolSet,
    ...sourceAwareIntegrationToolSet,
    ...executionToolSet,
    ...playwrightToolSet,
    ...documentToolSet,
    ...mediaToolSet,
    ...builtinToolSet,
    ...agentToolSet,
    ...fileIndexToolSet,
    ...todoToolSet,
    ...profileToolSet,
    ...routineToolSet,
    ...scheduleToolSet,
    ...effectiveSessionFileToolSet,
    ...skillsToolSet,
  };

  // list_available_tools should only advertise tools that are ACTUALLY
  // registered for this request — a tool behind a disabled toggle (e.g. Code
  // Execution, off by default) or an unconfigured integration cannot be
  // called, and telling the model it exists only leads to failed calls.
  // Rebuild it after the merge with the real tool names (normaliseTool below
  // still normalises the rebuilt definition like every other tool).
  tools.list_available_tools = buildListAvailableToolsTool(
    new Set(Object.keys(tools)),
  )["list_available_tools"];

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

  // Fully isolated (memory-disabled) chats must not know the user AT ALL —
  // no profile, no preferences, no name. The AI greets and answers as a
  // stranger would.
  const profileTip = !memoryEnabled
    ? ""
    : profileParts.length > 0
      ? `\n\n## User profile\nThe following is what you know about the user from their profile:\n${profileParts.map((p) => `- ${p}`).join("\n")}`
      : "";

  const systemTip = !memoryEnabled
    ? ""
    : prefParts.length > 0
      ? `\n\n## User preferences\n${prefParts.join("\n")}`
      : "";

  // Inject memories relevant to the CURRENT request, capped to a hard token
  // budget (relevance + recency scoring, deduped). Irrelevant memories are
  // still reachable via search_memories / get_recent_memories tools, so this
  // only trims what the model sees — never what it can recall on demand.
  const lastUserText =
    [...uiMessages]
      .reverse()
      .find((m) => m.role === "user")
      ?.parts.filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      )
      .map((p) => p.text)
      .join(" ") ?? "";
  const qualityStrategy = chooseQualityStrategy(
    normalizeQualityPolicy(conversation.qualityPolicy),
    estimateTaskComplexity(lastUserText, mode),
  );
  const enabledRouteProviders = await db
    .select()
    .from(providers)
    .where(eq(providers.enabled, true))
    .all();
  const enabledRouteModels = await db
    .select()
    .from(providerModels)
    .where(eq(providerModels.enabled, true))
    .all();
  const selectedRouteCandidate: ModelRouteCandidate = {
    providerId: provider.id,
    providerKind: provider.kind,
    providerLabel: provider.label,
    modelId: conversation.modelId,
  };
  const routeCandidates: ModelRouteCandidate[] = enabledRouteProviders.flatMap((routeProvider) =>
    enabledRouteModels
      .filter((routeModel) => routeModel.providerId === routeProvider.id)
      .map((routeModel) => ({
        providerId: routeProvider.id,
        providerKind: routeProvider.kind,
        providerLabel: routeProvider.label,
        modelId: routeModel.modelId,
      })),
  );
  if (!routeCandidates.some((candidate) =>
    candidate.providerId === selectedRouteCandidate.providerId &&
    candidate.modelId === selectedRouteCandidate.modelId,
  )) {
    routeCandidates.push(selectedRouteCandidate);
  }
  const qualityRoute = chooseModelRoute({
    policy: qualityStrategy.policy,
    complexity: qualityStrategy.complexity,
    text: lastUserText,
    mode,
    selected: selectedRouteCandidate,
    candidates: routeCandidates,
  });
  const activeProvider = enabledRouteProviders.find(
    (routeProvider) => routeProvider.id === qualityRoute.active.providerId,
  ) ?? provider;
  const activeModelId = qualityRoute.active.modelId;
  const model = getLanguageModel(activeProvider, activeModelId);
  trace.metric("qualityPolicy", qualityStrategy.policy);
  trace.metric("taskComplexity", qualityStrategy.complexity);
  trace.metric("selectedProviderId", provider.id);
  trace.metric("routedProviderId", qualityRoute.active.providerId);
  trace.metric("qualityEscalated", qualityRoute.escalated);
  trace.event("quality.strategy_selected", {
    policy: qualityStrategy.policy,
    complexity: qualityStrategy.complexity,
    label: qualityStrategy.label,
  });
  trace.event("quality.route_selected", {
    escalated: qualityRoute.escalated,
    selectedModel: selectedRouteCandidate.modelId,
    activeModel: qualityRoute.active.modelId,
    activeProvider: qualityRoute.active.providerLabel,
    reason: qualityRoute.reason,
    expectedLatency: qualityRoute.expectedLatency,
    expectedCost: qualityRoute.expectedCost,
    verifierEligible: qualityRoute.verifierEligible,
  });

  // Memory-disabled chats get NO saved-memories block — the model must answer
  // from this conversation alone (the memory tools aren't registered either).
  const relevantMemories = memoryEnabled ? await retrieveRelevantMemories(lastUserText) : [];
  const memoryTip = relevantMemories.length > 0
    ? `\n\n## Saved memories\nThings you have remembered about the user across conversations, ranked by relevance to the current request. Use them to personalize responses.\n${relevantMemories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  // ── Intent-based dynamic tool loading ─────────────────────────────
  // Simple chats register only the CORE tool subset (~2-3k tokens instead of
  // ~7k); heavier groups (exec, scheduling, session files, integrations…)
  // load on demand via deterministic intent classification, recent tool
  // usage, and the conversation's stored groups. The model can always enable
  // more via load_tool_groups / list_available_tools.
  const storedToolGroups = parseStoredToolState(conversation.toolGroups);
  // `let`: prepareStep below updates it when load_tool_groups enables a group
  // mid-stream, so onFinish's persist uses the freshest active set.
  let activeToolGroups = computeActiveToolGroups({
    userText: lastUserText,
    // Keep groups alive that were used in the recent window (mid-project
    // follow-ups like "make the button blue" must not lose session files).
    recentMessages: uiMessages.slice(-10),
    stored: storedToolGroups,
  });
  // Every registered tool lives in the BASE set; the SDK `activeTools` filter
  // (initial value below, re-evaluated every step by prepareStep) decides
  // which definitions actually reach the provider. Simple chats therefore
  // still send only the core subset (~1-2k tokens), while load_tool_groups
  // can add an unloaded group MID-STREAM — the model uses it in the very
  // next step of the same response, no "repeat your request" round-trip.
  //
  // `Record<string, any>` is how every other tool set in this app is typed
  // (the AI SDK accepts these raw `{ description, inputSchema, execute }`
  // objects, e.g. in lib/tools/*.ts) — it also keeps the load_tool_groups
  // shape from breaking the ToolSet union.
  const baseTools: Record<string, unknown> = {
    ...tools,
    // Appended LAST on purpose: markLastToolForCache puts the Anthropic
    // cache breakpoint on it, and since load_tool_groups is always active
    // and always last in the per-step filtered set, the tool-definitions
    // prefix stays cacheable on every step of the loop.
    load_tool_groups: buildLoadToolGroupsTool(conversationId, tools),
  };

  // AI SDK v7 requires `inputSchema` on every tool definition — some builders
  // in this codebase still emit the legacy `parameters` key, which the SDK
  // silently drops (the provider would get an EMPTY schema, so models guess
  // parameter shapes and can pass e.g. a comma-separated string where an
  // array is expected — the "groups.filter is not a function" crash — and
  // tool call input would never be validated). Normalise once so every tool
  // gets its real schema sent to the model and its input validated.
  for (const [name, tool] of Object.entries(baseTools)) {
    if (tool && typeof tool === "object") {
      baseTools[name] = normaliseTool(tool as Record<string, unknown>);
    }
  }
  const cachedBaseTools = markLastToolForCache(activeProvider, baseTools);

  // The initial active set = core + classified + stored groups (identical to
  // the old filtered set). prepareStep re-derives it before every step.
  const initialActiveToolNames = activeToolNames(tools, activeToolGroups);
  const estimatedToolDefinitionChars = Object.entries(baseTools).reduce(
    (total, [name, tool]) => {
      const toolRecord = tool && typeof tool === "object"
        ? tool as Record<string, unknown>
        : {};
      return total + name.length + String(toolRecord.description ?? "").length +
        (toolRecord.inputSchema ? 120 : 0);
    },
    0,
  );
  trace.metric("activeToolCount", initialActiveToolNames.length);
  trace.metric("activeToolNames", initialActiveToolNames);
  trace.metric("estimatedToolDefinitionChars", estimatedToolDefinitionChars);

  // Inject recent file changes into the system prompt for freshness.
  // Capped to 5 — the model can call query_recent_changes for more. Skipped
  // for fully isolated (memory-disabled) chats — that's the user's data.
  const recentChanges = memoryEnabled ? await queryRecentChanges(5) : [];
  const fileChangeTip = recentChanges.length > 0
    ? `\n\n## Recent file changes\nRecently modified in your watched directories (most recent first):\n${recentChanges.map((c) => `- [${c.changeType}] ${c.directoryLabel}/${c.relativePath}`).join("\n")}`
    : "";

  // Adaptive system prompt: detect lower-end models and give them a shorter prompt
  const modelId = activeModelId.toLowerCase();
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

  // ── System prompt split for provider prompt caching ──────────────────
  // The STATIC part (base prompt + tool guidance) is byte-identical on every
  // request and every agentic step, so Anthropic marks it with a
  // cache_control breakpoint and reads it from cache instead of re-billing
  // it. The DYNAMIC part (prefs, profile, memories, recent file changes,
  // plan mode) changes between requests and is placed AFTER the breakpoint
  // so it never invalidates the cached prefix. buildCachedInstructions
  // returns a plain string for providers without explicit caching.
  const researchRequested =
    /\bresearch\b|\bcitation|\bcite\b|\bsources?\b|\bcurrent information\b|\bsearch the web\b/i.test(
      lastUserText,
    ) ||
    activeToolGroups.has("web_search") ||
    activeToolGroups.has("news") ||
    activeToolGroups.has("firecrawl");
  const researchSection = researchRequested ? RESEARCH_SECTION : "";
  // Memory-disabled chats (temporary or the per-chat memory toggle) use the
  // base prompt WITHOUT the memory guidance section — see lib/chat/system-prompt.ts.
  const promptBase = memoryEnabled ? SYSTEM_PROMPT_BASE : SYSTEM_PROMPT_BASE_NO_MEMORY;

  const staticSystemPrompt = researchRequested
    ? (isLowCapability
      ? promptBase + visualSection + researchSection + SESSION_FILES_SECTION + PERSISTENCE_GUIDANCE +
        `\n\n**CRITICAL: Keep responses very short and focused.** Use the simplest tool for each task. If unsure about a tool, call \`get_tool_help\`. Avoid multi-step planning unless the task truly requires it.`
      : promptBase + visualSection + researchSection + SESSION_FILES_SECTION + PERSISTENCE_GUIDANCE)
    : isLowCapability
    ? promptBase + visualSection + SESSION_FILES_SECTION + PERSISTENCE_GUIDANCE +
      `\n\n**CRITICAL: Keep responses very short and focused.** Use the simplest tool for each task. If unsure about a tool, call \`get_tool_help\`. Avoid multi-step planning unless the task truly requires it.`
    : promptBase + visualSection + SESSION_FILES_SECTION + PERSISTENCE_GUIDANCE;
  // Rolling-conversation summary: the earliest messages (covered by a
  // background summary) are replaced in the model payload by a compact prose
  // recap injected into the dynamic prompt below. The full messages stay in
  // the DB for the UI and future edits — this only trims what reaches the LLM.
  const conversationSummary = conversation.summary ?? "";
  const summaryCovered = conversation.summaryMessageCount ?? 0;
  // Never drop the recent verbatim window, even if the stored summary covers
  // more than the client currently has (e.g. after a regenerate trimmed rows).
  const historyDrop = Math.min(
    summaryCovered,
    Math.max(0, uiMessages.length - RECENT_MESSAGES_KEPT),
  );
  const summarySection =
    conversationSummary && historyDrop > 0
      ? `\n\n## Earlier conversation (summarized)\nThe following summarizes the earlier part of this conversation. Use it for continuity — do not reference raw tool results you have not actually re-run.\n${conversationSummary}`
      : "";

  // Note about which tool groups are loaded — only added when something was
  // actually filtered out, so fully-loaded conversations pay zero overhead.
  const toolAvailabilityNote = buildToolAvailabilityNote(tools, activeToolGroups);

  // Active skills section — enabled skills' name + description injected into
  // the DYNAMIC prompt (after the static prompt / prompt-cache breakpoint) so
  // toggling a skill never invalidates the cached prefix. Full instructions
  // load on demand via the always-available load_skill tool. Skipped for
  // fully isolated chats (the skills tools aren't registered either).
  const activeSkillsSection = memoryEnabled
    ? await buildActiveSkillsSection(isLowCapability)
    : "";

  // Split off the availability note so prepareStep can rebuild the
  // instructions with a FRESH note once load_tool_groups enables a group
  // mid-stream (the note is the only part of the dynamic prompt that can
  // change mid-request).
  const qualityPolicyPrompt = `\n\n## Quality policy — ${qualityStrategy.label}\nTask complexity estimate: ${qualityStrategy.complexity}. ${qualityStrategy.verificationGuidance}\nSelected model: ${selectedRouteCandidate.providerLabel} / ${selectedRouteCandidate.modelId}. Active route: ${qualityRoute.active.providerLabel} / ${qualityRoute.active.modelId}. ${qualityRoute.reason} Routing is deterministic and bounded; never make another provider call unless the Quality-first verifier is eligible.`;

  const dynamicSystemPromptBase =
    systemTip + profileTip + memoryTip + fileChangeTip + summarySection +
    planModePrompt + buildModePrompt + activeSkillsSection + qualityPolicyPrompt;

  const dynamicSystemPrompt = dynamicSystemPromptBase + toolAvailabilityNote;

  const fullSystemPrompt = staticSystemPrompt + dynamicSystemPrompt;

  // Optimize the message history before sending it to the model:
  // - UI-only parts (step-start markers, reasoning) are dropped.
  // - Old tool rounds collapse into compact natural-language traces
  //   (inputs with file contents/code and oversized outputs are replaced by
  //   short references — the model can re-run the tool to re-fetch).
  // - Messages covered by the rolling summary are dropped from the payload.
  const modelMessages = await convertToModelMessages(
    optimizeMessageHistory(
      historyDrop > 0 ? uiMessages.slice(historyDrop) : uiMessages,
    ),
  );

  // ── Native image processing ───────────────────────────────────
  // Scan user messages for image markdown references of attached files
  // (legacy `/api/chat/uploads/...` or session sandbox
  // `/api/chat/{id}/session-files/...` URLs) and inject the raw image data
  // as native multimodal content parts.
  // Modern LLMs (Claude 3.5, GPT-4o, Gemini) process these natively via their vision
  // encoder — far more efficient and reliable than the old read_media tool approach.
  for (const msg of modelMessages) {
    if (msg.role !== "user") continue;
    const content = msg.content;
    if (typeof content === "string") {
      const attachments = await extractImageAttachments(content);
      if (attachments.length > 0) {
        const cleanText = stripImageMarkdown(content);
        const parts: unknown[] = [];
        if (cleanText) {
          parts.push({ type: "text" as const, text: cleanText });
        }
        for (const att of attachments) {
          parts.push({
            type: "image" as const,
            image: att.buffer,
            // AI SDK v7 reads `mediaType` on image parts — `mimeType` is
            // ignored, which made the SDK fall back to magic-byte sniffing
            // (fails for formats without a recognizable signature).
            mediaType: att.mimeType,
          });
        }
        msg.content = parts as typeof msg.content;
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
        const newParts: unknown[] = [];
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
                  // AI SDK v7 reads `mediaType` on image parts — `mimeType`
                  // is ignored (see the string-content branch above).
                  mediaType: att.mimeType,
                });
              }
            } else {
              newParts.push(part);
            }
          } else {
            newParts.push(part);
          }
        }
        msg.content = newParts as typeof msg.content;
      }
    }
  }

  trace.event("prompt.assembled", {
    durationMs: Math.max(0, Math.round(performance.now() - promptAssemblyStartedAt)),
    messageCount: modelMessages.length,
    activeToolCount: initialActiveToolNames.length,
  });

  // Track whether onFinish successfully applied tokens, so the cleanup
  // doesn't double-count by applying the same usage again.
  let tokensApplied = false;
  let aborted = false;
  let finalFinishReason: string | undefined;
  let finalStepCount = 0;

  // Capture a normalized error payload from streamText's onError callback so
  // the frontend can render a friendly, structured error (instead of a raw
  // provider stack or a generic "An error occurred").
  let capturedErrorPayload: StreamErrorPayload | null = null;

  // Cached prepareStep result. Reused verbatim on every step unless
  // load_tool_groups ran in the previous step (only then can the active tool
  // set have changed) — avoids a DB read + prompt rebuild on ordinary steps.
  // Returning the SAME object (not undefined) is important: prepareStep
  // returning undefined would fall back to the OUTER activeTools, reverting
  // any mid-stream group additions.
  let lastStepComputed:
    | {
        activeTools: string[];
        instructions: ReturnType<typeof buildCachedInstructions>;
      }
    | undefined;

  let buildRunId: number | undefined;
  const buildDefinitionOfDone = [
    "Requested files or behavior implemented",
    "Relevant checks run",
    "Changed files reported",
    "Failures or uncertainty disclosed",
  ];
  const buildCheckpointParts: unknown[] = [];
  let buildCheckpointWrite: Promise<void> = Promise.resolve();
  let buildRepairState: BuildRepairState = {
    attempt: 0,
    lastFailureSignature: "",
  };
  if (mode === "build") {
    try {
      const startedBuildRun = await recordBuildRun({
        conversationId,
        sourceRunId: trace.traceId,
        task: lastUserText,
        status: "running",
        definitionOfDone: buildDefinitionOfDone,
        changedFiles: [],
        checks: [],
        summary: buildRunSummary([], [], "running"),
        checkpoint: {
          step: 0,
          phase: "executing",
          repairAttempt: 0,
          changedFiles: [],
          checks: [],
          updatedAt: new Date().toISOString(),
        },
      });
      buildRunId = startedBuildRun.id;
    } catch (error) {
      console.warn("[build] Failed to create running build checkpoint:", error);
    }
  }

  const result = streamText({
    model,
    instructions: buildCachedInstructions(
      activeProvider,
      staticSystemPrompt,
      dynamicSystemPrompt,
    ),
    messages: modelMessages,
    tools: cachedBaseTools as ToolSet,
    // Only supported Anthropic reasoning families receive reasoning options.
    // Unknown/local/OpenAI-compatible models stay on their normal stream.
    providerOptions: streamingReasoningProviderOptions(
      activeProvider.kind,
      activeModelId,
    ),
    // Initial active set (core + classified + stored groups). prepareStep
    // re-evaluates it before every step, so load_tool_groups can add groups
    // mid-stream.
    activeTools: initialActiveToolNames,
    // Re-evaluate the active tool set before every step. When load_tool_groups
    // ran in the previous step, the newly enabled group's tools become
    // registered for THIS step — the model can use them in the same response
    // instead of asking the user to repeat their request. Also refreshes the
    // tool-availability note so the model stops treating the group as
    // unloaded. (The per-step set is a subset of the base set, so unloaded
    // definitions never reach the provider and token savings are preserved.)
    prepareStep: async ({ steps }) => {
      // Fast path: unless load_tool_groups ran in the previous step, the
      // active tool set cannot have changed — reuse the cached result so
      // ordinary multi-step runs pay zero extra DB reads / prompt rebuilds.
      const prevStep = steps.at(-1);
      const enabledGroupsThisRound =
        prevStep?.toolCalls?.some(
          (tc) => tc.toolName === "load_tool_groups",
        ) ?? false;
      const currentBuildChecks =
        mode === "build" ? checksFromSteps(steps) : [];
      const buildHasFailure = currentBuildChecks.some(
        (check) => check.status !== "passed",
      );
      if (!enabledGroupsThisRound && lastStepComputed && !buildHasFailure) {
        return lastStepComputed;
      }

      const currentRow = await db
        .select({ toolGroups: conversations.toolGroups })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .get();
      const freshStored = parseStoredToolState(currentRow?.toolGroups);
      const freshActive = computeActiveToolGroups({
        userText: lastUserText,
        recentMessages: uiMessages.slice(-10),
        stored: freshStored,
      });
      activeToolGroups = freshActive;
      const repairNote = buildHasFailure
        ? `\n\n## BUILD REPAIR LOOP\n${buildRepairGuidance(Math.max(1, buildRepairState.attempt))}`
        : "";
      lastStepComputed = {
        activeTools: activeToolNames(tools, freshActive),
        instructions: buildCachedInstructions(
          activeProvider,
          staticSystemPrompt,
          dynamicSystemPromptBase +
            repairNote +
            buildToolAvailabilityNote(tools, freshActive),
        ),
      };
      return lastStepComputed;
    },
    // Retry retryable provider failures (network, 5xx, rate limits) up to
    // 3 times with exponential backoff before surfacing the error.
    maxRetries: qualityStrategy.maxRetries,
    // The quality policy adjusts effort without creating hidden provider calls.
    // Complex Goal/Build tasks retain the larger execution budget.
    maxOutputTokens:
      mode === "goal" || mode === "build"
        ? Math.max(qualityStrategy.maxOutputTokens, 16_384)
        : qualityStrategy.maxOutputTokens,
    // Allow up to 100 steps normally (chat/plan), or 500 in goal mode
    // so the model can work autonomously until task completion
    stopWhen: stepCountIs(mode === "goal" || mode === "build" ? 10000 : 7500),
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
    onStepEnd: ({ stepNumber, usage, toolCalls: stepToolCalls, toolResults, finishReason }) => {
      trace.step(stepNumber, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        toolCallCount: stepToolCalls.length,
        toolResultCount: toolResults.length,
        finishReason,
      });
      if (mode === "build" && buildRunId) {
        buildCheckpointParts.push({ toolResults });
        const changedFiles = summarizeChangedFiles(
          buildPartsFromSteps(buildCheckpointParts),
        );
        const checks = checksFromSteps(buildCheckpointParts);
        const repairUpdate = advanceBuildRepairState(buildRepairState, checks);
        buildRepairState = {
          attempt: repairUpdate.attempt,
          lastFailureSignature: repairUpdate.lastFailureSignature,
        };
        if (repairUpdate.hasFailure) {
          trace.metric("buildRepairAttempt", repairUpdate.attempt);
          trace.event("build.repair_required", {
            attempt: repairUpdate.attempt,
            guidance: buildRepairGuidance(repairUpdate.attempt),
          });
        }
        const checkpoint: BuildCheckpoint = {
          step: stepNumber,
          phase: repairUpdate.phase,
          repairAttempt: repairUpdate.attempt,
          changedFiles,
          checks,
          updatedAt: new Date().toISOString(),
        };
        buildCheckpointWrite = buildCheckpointWrite
          .then(async () => {
            await updateBuildRunCheckpoint(db, buildRunId!, checkpoint);
          })
          .catch((error) => {
            console.warn("[build] Failed to persist checkpoint:", error);
          });
      }
    },
    onError: (err) => {
      capturedErrorPayload = normalizeStreamError(err);
      trace.providerError(err);
      console.error("[stream] Provider error:", err);
    },
    onAbort: () => {
      aborted = true;
      trace.recordState("cancelled");
    },
    onFinish: async ({ text: outputText, usage, finishReason, steps, toolCalls }) => {
      finalFinishReason = finishReason;
      finalStepCount = steps?.length ?? 0;
      trace.metric("finishReason", finishReason);
      trace.metric("finalStepCount", finalStepCount);
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
      if (researchRequested && runText.trim() && !capturedErrorPayload) {
        void recordCitedClaims({
          conversationId,
          sourceRunId: trace.traceId,
          answerText: runText,
        }).catch((error) => {
          console.warn("[research] Failed to persist claim provenance:", error);
        });
      }
      if (
        qualityRoute.verifierEligible &&
        finishReason === "stop" &&
        runText.trim() &&
        !capturedErrorPayload
      ) {
        try {
          const verification = await verifyQualityAnswer({
            model,
            task: lastUserText,
            answer: runText,
          });
          trace.metric("qualityVerifierIssueCount", verification.issueCount);
          trace.metric("qualityVerifierConfidence", verification.confidence);
          trace.event("quality.verifier_completed", {
            verdict: verification.verdict,
            issueCount: verification.issueCount,
            confidence: verification.confidence,
          });
        } catch (error) {
          trace.event("quality.verifier_failed", {
            category: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
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

      if (mode === "build") {
        const buildParts = buildPartsFromSteps(steps ?? []);
        const checks = checksFromSteps(steps ?? []);
        const changedFiles = summarizeChangedFiles(buildParts);
        const buildStatus = aborted
          ? "interrupted"
          : capturedErrorPayload || checks.some((check) => check.status === "failed")
            ? "failed"
            : "completed";
        const buildSummary = buildRunSummary(changedFiles, checks, buildStatus);
        await buildCheckpointWrite;
        const repairUpdate = advanceBuildRepairState(buildRepairState, checks);
        buildRepairState = {
          attempt: repairUpdate.attempt,
          lastFailureSignature: repairUpdate.lastFailureSignature,
        };
        const finalCheckpoint: BuildCheckpoint = {
          step: finalStepCount,
          phase: repairUpdate.phase,
          repairAttempt: repairUpdate.attempt,
          changedFiles,
          checks,
          updatedAt: new Date().toISOString(),
        };
        let resultArtifactId: number | null = null;
        try {
          const resultArtifact = await saveBuildResultArtifact(db, {
            conversationId,
            sourceRunId: trace.traceId,
            task: lastUserText,
            status: buildStatus,
            summary: buildSummary,
            definitionOfDone: buildDefinitionOfDone,
            changedFiles,
            checks,
            checkpoint: finalCheckpoint,
          });
          resultArtifactId = resultArtifact?.id ?? null;
        } catch (error) {
          console.warn("[build] Failed to persist result artifact:", error);
        }
        try {
          if (buildRunId) {
            await finishBuildRun(db, buildRunId, {
              status: buildStatus,
              changedFiles,
              checks,
              summary: buildSummary,
              error: capturedErrorPayload?.message ?? null,
              checkpoint: finalCheckpoint,
              resultArtifactId,
            });
          } else {
            await recordBuildRun({
              conversationId,
              sourceRunId: trace.traceId,
              task: lastUserText,
              status: buildStatus,
              definitionOfDone: buildDefinitionOfDone,
              changedFiles,
              checks,
              summary: buildSummary,
              error: capturedErrorPayload?.message ?? null,
              checkpoint: finalCheckpoint,
              resultArtifactId,
            });
          }
        } catch (error) {
          console.warn("[build] Failed to finalize build run:", error);
        }
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

        const tokenUpdateStartedAt = performance.now();
        await db
          .update(conversations)
          .set({
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
        console.error("Failed to update token usage in onFinish:", err);
      }

      // ── Persist active tool groups ────────────────────────────────
      // Cheap, non-blocking UPDATE: explicit groups (load_tool_groups) stay
      // forever; the request's own classifier∪recency set is stored as
      // `recent` so short follow-ups ("yes", "do it") inherit the tools the
      // conversation was using — and stale groups decay once a project ends.
      void persistActiveToolGroups({
        conversationId,
        activeGroups: activeToolGroups,
      });

      // ── Background rolling summary ─────────────────────────────────
      // When the conversation has grown far past the last summary, fire a
      // cheap background completion that compresses the earliest segment
      // (everything before the recent verbatim window) into a compact prose
      // recap. Future requests inject it into the system prompt and drop the
      // summarized messages from the model payload, capping input-token
      // growth on long conversations. Fire-and-forget — never blocks the
      // stream and swallows all errors.
      if (!capturedErrorPayload) {
        const covered = conversation.summaryMessageCount ?? 0;
        if (shouldSummarize({ totalMessages: uiMessages.length, coveredMessages: covered })) {
          const untilCount = Math.max(0, uiMessages.length - SUMMARIZE_RECENT_KEEP);
          void summarizeConversationBackground({
            conversationId,
            provider,
            modelId: conversationModelId,
            untilCount,
            parentTraceId: trace.traceId,
          });
        }
      }

      // ── Background auto-title ─────────────────────────────────────
      // First AI response in a brand-new chat: fire a tiny, cheap request
      // that reads the first user message + this reply and writes a short
      // title to the DB. Fire-and-forget — never blocks the stream, and it
      // keeps running server-side even after the user navigates away.
      if (isFirstExchange && !capturedErrorPayload && runText.trim()) {
        const firstUser = uiMessages.find((m) => m.role === "user");
        if (firstUser) {
          const userText = firstUser.parts
            .filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join(" ");
          void autoTitleConversation({
            conversationId,
            provider,
            modelId: conversationModelId,
            userText,
            assistantText: runText,
            expectedTitle: titleFromMessage(firstUser),
            parentTraceId: trace.traceId,
          });
        }
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
    // Forward structured reasoning parts when the selected provider emits
    // them; providers without reasoning output simply emit none.
    sendReasoning: true,
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

        const tokenFallbackStartedAt = performance.now();
        await db
          .update(conversations)
          .set({
            totalInputTokens: sql`total_input_tokens + ${estimatedInput}`,
            totalOutputTokens: sql`total_output_tokens + ${estimatedOutput}`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(conversations.id, conversationId));
        trace.dbQuery("token_usage_fallback_update", tokenFallbackStartedAt, {
          inputTokens: estimatedInput,
          outputTokens: estimatedOutput,
        });
      } catch (err) {
        console.error("Failed to update token usage in cleanup:", err);
        await db
          .update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
      }
    } else {
      // Tokens already applied — just update updatedAt
      const updatedAtStartedAt = performance.now();
      await db
        .update(conversations)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
      trace.dbQuery("conversation_updated_at", updatedAtStartedAt);
    }

    const state = aborted
      ? "cancelled"
      : capturedErrorPayload
        ? capturedErrorPayload.shouldResume
          ? "partially_completed"
          : "failed"
        : "completed";
    trace.recordState(state, {
      finishReason: finalFinishReason,
      finalStepCount,
    });
    trace.finish(state, {
      finishReason: finalFinishReason,
      finalStepCount,
    });
  }, trace);

  // Build the SSE response for the client, and register the SSE stream
  // for reconnection support.
  return createUIMessageStreamResponse({
    stream: enrichedBranch,
    consumeSseStream: ({ stream }) => {
      streamRegistry.register(conversationId, stream);
    },
  });
}
