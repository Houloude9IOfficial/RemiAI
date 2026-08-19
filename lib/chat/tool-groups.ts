import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { asStringArray } from "@/lib/utils";

/**
 * Intent-based dynamic tool loading.
 *
 * Sending all ~40 tool definitions on every request costs ~7k input tokens of
 * pure static overhead — re-billed on every agentic step. This module instead
 * registers a small CORE set on simple chats and loads the heavier groups
 * (code execution, scheduled tasks, session files, routines, integrations…)
 * only when the request actually needs them.
 *
 * Active groups are the union of four signals:
 *
 *   active = CORE ∪ classifier(latest user message)
 *            ∪ recency(groups used in the last N messages)
 *            ∪ storedExplicit (load_tool_groups adds — persistent)
 *            ∪ storedRecent (last request's classifier∪recency — decays)
 *
 * - **Classifier** is deterministic (keyword/pattern scoring, no LLM call) and
 *   deliberately generous — a false positive only costs tokens, while a false
 *   negative could leave the model without a needed tool.
 * - **Recency** keeps a tool group alive mid-project ("make the button blue"
 *   right after building a website must not lose `session_files`).
 * - **storedExplicit** is the `load_tool_groups` escape hatch: model-requested
 *   groups persist across requests.
 * - **storedRecent** is written at the end of each request with that request's
 *   own classifier∪recency (NOT the full active set), so short follow-ups
 *   ("yes", "do it") inherit the conversation's tools — and stale groups
 *   decay naturally once a project ends.
 *
 * Only tools registered in a CONDITIONAL group are ever filtered out — core
 * tools and anything unregistered (e.g. MCP tools) always load.
 */

/** Tool names that are always available, even on the simplest chat. */
export const CORE_TOOLS: ReadonlySet<string> = new Set([
  // context
  "get_time_details",
  "get_device_details",
  // memory
  "remember",
  "get_recent_memories",
  "search_memories",
  // file index
  "query_recent_changes",
  "query_file_index",
  // filesystem read basics (URL-capable + root discovery)
  "list_permitted_roots",
  "read_file",
  // builtins
  "delay",
  "web_fetch",
  "ask_questions",
  "suggest_followups",
  "send_notification",
  "set_run_name",
  "get_tool_help",
  "list_available_tools",
  "load_tool_groups",
  // skills (cheap, always available)
  "list_skills",
  "load_skill",
]);

interface ToolGroup {
  /** Short label used in the system-prompt availability note. */
  label: string;
  /** Exact tool names belonging to the group. */
  tools: string[];
  /** Keyword/pattern triggers for the intent classifier. */
  keywords: string[];
}

/**
 * Conditional tool groups. Anything here is dropped from simple chats until
 * the classifier, recency, stored state, or load_tool_groups activates it.
 * (Plan-mode write blocklisting still applies on top in the chat route.)
 *
 * Keywords are deliberately conservative about high-frequency English words:
 * bare "app", "page", "what is", "make" etc. over-trigger and quietly erase
 * the savings — multi-word phrases and tool-specific terms are preferred.
 */
export const CONDITIONAL_GROUPS: Record<string, ToolGroup> = {
  fs_write: {
    label: "filesystem-write",
    tools: [
      "write_file",
      "edit_file",
      "create_directory",
      "delete_directory",
      "rename_item",
    ],
    keywords: [
      "write", "write a", "edit", "create", "create a", "build a", "build me",
      "make a", "make me", "generate", "save", "save to", "add a", "add the",
      "update the", "change the", "fix the", "delete the", "remove the",
      "rename", "move", "copy", "folder", "directory", "mkdir", "overwrite",
      "append", "refactor", "implement", "modify", "patch", "scaffold",
      "new file", "save this", "save the", ".py", ".js", ".ts", ".tsx",
      ".jsx", "project", "codebase",
    ],
  },
  fs_read: {
    label: "filesystem-read",
    tools: [
      "list_directory",
      "search_files",
      "glob_files",
      "read_media",
    ],
    keywords: [
      "list", "search", "find", "glob", "read", "open", "browse",
      "contents", "files in", "what's in", "look at", "list the files",
      "image", "screenshot", "photo", "media", "folder", "directory",
      "project", "codebase", "file",
    ],
  },
  document_reader: {
    label: "document-reader",
    tools: ["read_document"],
    keywords: [
      "pdf", "docx", "epub", "odt", "rtf", ".doc", "word doc", "word document",
      "document", "resume", "cv", "contract",
    ],
  },
  session_files: {
    label: "session-files",
    tools: [
      "session_file_list",
      "session_file_read",
      "session_file_read_media",
      "session_file_write",
      "session_file_edit",
      "session_file_mkdir",
      "session_file_move",
      "session_file_download",
      "session_file_delete",
      "session_present_file",
      "session_present_files",
    ],
    keywords: [
      "website", "web page", "landing page", "html", "css", "javascript file",
      "build a", "build me", "generate a", "write me a", "draft", "letter",
      "resume", "zip", "download", "artifact", "template", "mockup",
      "prototype", "invoice", "make a website", "create a website",
    ],
  },
  playwright: {
    label: "browser-automation",
    tools: [
      "browser_open",
      "browser_click",
      "browser_fill",
      "browser_extract",
      "browser_screenshot",
      "browser_interact",
      "browser_close",
    ],
    keywords: [
      "open a website", "open the website", "open this page", "navigate to",
      "load the page", "load this page", "render the page", "go to the url",
      "visit the site", "browser", "playwright", "automate", "automation",
      "click on", "click the", "fill in the form", "fill the form",
      "fill out the form", "submit the form", "login to", "log in to",
      "sign in", "sign up", "take a screenshot", "screenshot of",
      "screenshot the", "javascript rendered", "javascript-rendered",
      "interact with the page", "web automation", "live website",
      "check the website", "view the page", "see the page", "open in a browser",
    ],
  },
  exec: {
    label: "code-execution",
    tools: ["python_exec", "js_exec", "bash_execute"],
    keywords: [
      "run this", "run the", "run some", "run code", "execute", "python",
      "javascript", "node", "npm", "terminal", "bash", "shell", "script",
      "compute", "calculate", "snippet", "cli", "repl", "test the code",
      "execute code", "data analysis", "analyze data", "math", "algorithm",
      "pip install", "npm install", "run a script",
      "git", "typecheck", "lint", "deploy", "compile",
    ],
  },
  create_visual: {
    label: "create-visual",
    tools: ["create_visual"],
    keywords: [
      "chart", "graph", "visual", "dashboard", "diagram", "timeline", "kpi",
      "stat card", "svg", "visualize", "plot", "pie chart", "bar chart",
      "line chart", "metrics", "infographic", "flow chart", "data viz",
      "visualization",
    ],
  },
  scheduling: {
    label: "scheduled-tasks",
    tools: [
      "schedule_task",
      "list_scheduled_tasks",
      "update_scheduled_task",
      "cancel_scheduled_task",
    ],
    keywords: [
      "schedule", "remind", "reminder", "later today", "tomorrow", "recurring",
      "cron", "timer", "notify me", "in 10 minutes", "in an hour", "at 5pm",
      "at midnight", "every day", "every week", "every monday", "daily",
      "weekly", "tonight", "scheduled",
    ],
  },
  todo: {
    label: "todo-list",
    tools: ["todos_init", "todos_update", "todos_view"],
    keywords: [
      "todo", "todos", "checklist", "to-do", "task list", "breakdown",
      "make a plan", "first step", "step-by-step", "outline", "create a plan",
    ],
  },
  routines: {
    label: "routines",
    tools: [
      "create_routine",
      "run_routine",
      "list_routines",
      "update_routine",
      "delete_routine",
      "get_routine_logs",
    ],
    keywords: [
      "routine", "automation", "reusable script", "save this script",
      "automate", "scripting",
    ],
  },
  agent: {
    label: "agent-spawner",
    tools: ["spawn_agent", "get_agent_result"],
    keywords: [
      "research", "deep dive", "investigate", "in depth", "sub-agent",
      "sub agent", "complex task", "background task", "parallel tasks",
      "multi-step", "thoroughly", "comprehensive", "deep research",
    ],
  },
  profile: {
    label: "user-profile",
    tools: ["get_profile", "update_profile"],
    keywords: [
      "profile", "what do you know about me", "my name is", "bio",
      "occupation", "update my profile", "about me", "my job", "my background",
      "pronouns",
    ],
  },
  web_search: {
    label: "web-search",
    tools: ["brave_web_search", "brave_image_search"],
    keywords: [
      "search the web", "search online", "google", "look it up", "look this up",
      "web search", "search for", "on the internet", "find online",
      "pictures of", "photos of", "images of", "picture of", "photo of",
      "image of", "show me a picture", "show me pictures", "show me photos",
      "show me images", "find images", "image search", "what does it look like",
    ],
  },
  notion: {
    label: "notion",
    tools: ["notion_search_pages", "notion_get_page"],
    keywords: ["notion"],
  },
  context7: {
    label: "context7-docs",
    tools: ["context7_get_docs"],
    keywords: [
      "docs for", "documentation", "api docs", "how do i use", "library docs",
      "framework docs", "read the docs", "reference for",
    ],
  },
  news: {
    label: "news",
    tools: ["news_search", "news_top_headlines"],
    keywords: [
      "news", "headlines", "breaking", "current events", "what happened today",
      "today's news",
    ],
  },
  firecrawl: {
    label: "firecrawl",
    tools: [
      "fc_search",
      "fc_scrape",
      "fc_crawl",
      "fc_interact",
      "fc_stop_interaction",
    ],
    keywords: [
      "scrape", "crawl", "extract data from", "scrape website", "web scraping",
      "scraping",
    ],
  },
  media_tools: {
    label: "media-tools",
    tools: [
      "get_media_metadata",
      "convert_media",
      "extract_audio",
      "extract_video_frames",
      "transcribe_audio",
      "manage_transcription_models",
    ],
    keywords: [
      "metadata", "fps", "frame rate", "frame-rate", "codec", "bitrate",
      "bit rate", "resolution", "duration of", "video file", "audio file",
      "convert video", "convert audio", "convert to", "transcode", "transcoding",
      "convert this video", "convert this audio", "mp4", "webm", "mkv", "mov",
      "avi", "mp3", "wav", "flac", "m4a", "ogg", "opus", "extract audio",
      "extract the audio", "extract sound", "remove the video", "frames from",
      "extract frames", "extract frame", "get a frame", "frame from the video",
      "thumbnail", "analyze this video", "analyze the video", "analyze the audio",
      "what's in the video", "what is in the video", "transcribe",
      "transcription", "speech to text", "speech-to-text", "captions",
      "subtitles", "transcript", "what did they say", "what was said",
      "what does the audio say", "caption this", "trim the", "trim video",
      "trim audio", "cut the video", "cut the audio",
    ],
  },
};

/** Derived map: tool name → owning conditional group id. */
const GROUP_BY_TOOL: Record<string, string> = {};
for (const [groupId, group] of Object.entries(CONDITIONAL_GROUPS)) {
  for (const tool of group.tools) {
    GROUP_BY_TOOL[tool] = groupId;
  }
}

/** Human-readable list of all conditional group ids, for tool params. */
export const CONDITIONAL_GROUP_IDS = Object.keys(CONDITIONAL_GROUPS);

/** Compiled keyword matchers: multi-word → substring, single-word → prefix. */
const GROUP_MATCHERS: Record<string, RegExp[]> = {};
for (const [groupId, group] of Object.entries(CONDITIONAL_GROUPS)) {
  GROUP_MATCHERS[groupId] = group.keywords.map((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return keyword.includes(" ")
      ? new RegExp(escaped, "i")
      : new RegExp(`\\b${escaped}`, "i");
  });
}

/**
 * Classify which conditional groups a message needs, using keyword/pattern
 * scoring. Generous on purpose: loading an extra group only costs tokens;
 * missing one could leave the model without a needed tool.
 */
export function classifyToolGroups(text: string): Set<string> {
  const active = new Set<string>();
  const lower = text.toLowerCase();
  if (!lower.trim()) return active;

  for (const [groupId, matchers] of Object.entries(GROUP_MATCHERS)) {
    for (const matcher of matchers) {
      if (matcher.test(lower)) {
        active.add(groupId);
        break;
      }
    }
  }
  return active;
}

/** Extract tool names referenced in a message's parts (from any UI part shape). */
export function toolNamesFromMessage(
  message: { parts: unknown[] } | undefined,
): string[] {
  if (!message || !Array.isArray(message.parts)) return [];
  const names: string[] = [];
  for (const rawPart of message.parts) {
    const part = rawPart as Record<string, unknown>;
    const type = part.type;
    if (typeof type === "string" && type.startsWith("tool-") && type !== "tool-invocation") {
      names.push(type.slice("tool-".length));
    } else if (type === "tool-invocation") {
      const inv = part.toolInvocation as Record<string, unknown> | undefined;
      if (inv && typeof inv.toolName === "string") names.push(inv.toolName);
    }
  }
  return names;
}

/** Map a set of tool names to the conditional groups that own them. */
export function groupsForTools(toolNames: Iterable<string>): Set<string> {
  const groups = new Set<string>();
  for (const name of toolNames) {
    const groupId = GROUP_BY_TOOL[name];
    if (groupId) groups.add(groupId);
  }
  return groups;
}

/**
 * Persisted tool-group state on the conversation row.
 *
 * Stored as a JSON object to keep two lifetimes separate:
 * - `explicit`: groups enabled via load_tool_groups — persistent.
 * - `recent`:   the last request's own classifier∪recency — overwritten every
 *   request, so it decays once a project ends.
 */
export interface StoredToolState {
  explicit: Set<string>;
  recent: Set<string>;
}

/** Parse the stored tool_groups JSON column (tolerates old array shape). */
export function parseStoredToolState(value: unknown): StoredToolState {
  const explicit = new Set<string>();
  const recent = new Set<string>();
  if (Array.isArray(value)) {
    // Legacy shape (pre-split): treat as explicit adds.
    for (const item of value) {
      if (typeof item === "string" && CONDITIONAL_GROUPS[item]) explicit.add(item);
    }
    return { explicit, recent };
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const merge = (target: Set<string>, list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (typeof item === "string" && CONDITIONAL_GROUPS[item]) target.add(item);
      }
    };
    merge(explicit, rec.explicit);
    merge(recent, rec.recent);
  }
  return { explicit, recent };
}

/**
 * Compute the active tool groups for a request.
 *
 * @param userText        the latest user message text (intent signal)
 * @param recentMessages  recent messages whose tool usage should stay alive
 * @param stored          explicit + recent groups from the conversation row
 */
export function computeActiveToolGroups(opts: {
  userText: string;
  recentMessages: Array<{ parts: unknown[] }>;
  stored: StoredToolState;
}): Set<string> {
  const { userText, recentMessages, stored } = opts;

  const active = classifyToolGroups(userText);

  // Recency: keep groups that were used in the recent window.
  for (const message of recentMessages) {
    for (const group of groupsForTools(toolNamesFromMessage(message))) {
      active.add(group);
    }
  }

  // Stored: explicit (persistent) + recent (from the last request).
  for (const group of stored.explicit) {
    active.add(group);
  }
  for (const group of stored.recent) {
    active.add(group);
  }

  return active;
}

/**
 * Filter a fully-built tool set down to core + active conditional groups.
 * Tools not registered in any conditional group (core, MCP, etc.) always pass.
 */
export function filterTools(
  tools: Record<string, unknown>,
  activeGroups: ReadonlySet<string>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const groupId = GROUP_BY_TOOL[name];
    if (groupId === undefined || CORE_TOOLS.has(name) || activeGroups.has(groupId)) {
      filtered[name] = tool;
    }
  }
  return filtered;
}

/** Group labels that are genuinely always loaded (their tools are all core). */
const ALWAYS_LOADED_LABELS = ["context", "memory", "file-index", "builtin"];

/**
 * Short availability note for the system prompt (only when filtering is
 * active). Lists what is loaded AND what can be enabled, so the model never
 * tries to call a tool that isn't registered.
 */
export function buildToolAvailabilityNote(
  tools: Record<string, unknown>,
  activeGroups: ReadonlySet<string>,
): string {
  const loadedLabels: string[] = [];
  const unloadedLabels: string[] = [];
  for (const [groupId, group] of Object.entries(CONDITIONAL_GROUPS)) {
    // Only mention groups whose tools actually exist in this build
    // (e.g. skip integrations with no API key configured).
    const present = group.tools.some((name) => tools[name] !== undefined);
    if (!present) continue;
    if (activeGroups.has(groupId)) loadedLabels.push(group.label);
    else unloadedLabels.push(group.label);
  }
  if (unloadedLabels.length === 0) return ""; // nothing was filtered out

  const loaded = [...ALWAYS_LOADED_LABELS, ...loadedLabels.sort()].join(", ");
  return (
    `\n\n## Tool availability\n` +
    `Some tools are loaded on demand to save tokens. **Only call the tools listed above.**\n` +
    `Loaded: ${loaded}.\n` +
    `Not loaded: ${unloadedLabels.sort().join(", ")}.\n` +
    `To enable an unloaded group, call \`load_tool_groups({ groups: [...] })\` — the tools become available immediately in this same response, then continue with the current request.`
  );
}

/**
 * The tool NAMES that should be registered for a given active-group set:
 * core tools + active conditional groups (+ unregistered tools like MCP).
 * Used as the SDK `activeTools` filter so unloaded tools' definitions never
 * reach the provider — and so they CAN be added mid-stream by prepareStep
 * when load_tool_groups enables a group.
 */
export function activeToolNames(
  tools: Record<string, unknown>,
  activeGroups: ReadonlySet<string>,
): string[] {
  return Object.keys(filterTools(tools, activeGroups)).concat(["load_tool_groups"]);
}

/**
 * The `load_tool_groups` tool: lets the model explicitly enable conditional
 * groups. The chat route re-evaluates the active tool set before every step
 * (SDK `prepareStep` + `activeTools`), so a group enabled here becomes
 * available to the model in the very NEXT step of the SAME response — no
 * "repeat your request" round-trip. Enabled groups are stored as `explicit`
 * and persist across requests.
 *
 * @param toolSet the fully-built tool set for this request (used to skip
 *   groups whose tools aren't actually present, e.g. unconfigured
 *   integrations, so the tool never promises tools that can't materialize).
 */
export function buildLoadToolGroupsTool(
  conversationId: number,
  toolSet?: Record<string, unknown>,
): {
  description: string;
  // AI SDK v7 property (the legacy `parameters` key is silently ignored —
  // the model would get an empty schema and input would never be validated).
  inputSchema: z.ZodType;
  execute: (args: { groups?: string[] | string }) => Promise<string>;
} {
  // A group is only "loadable" when at least one of its tools exists in this
  // build (mirrors buildToolAvailabilityNote's presence check). Without the
  // tool set (older callers) assume everything is present.
  const groupIsPresent = (g: string): boolean => {
    if (!toolSet) return true;
    return CONDITIONAL_GROUPS[g].tools.some((name) => toolSet[name] !== undefined);
  };

  return {
    description:
      `Enable tool groups that are currently unloaded so they become available to you immediately. ` +
      `You can use them in your next step of this same response. ` +
      `Valid groups: ${CONDITIONAL_GROUP_IDS.join(", ")}. ` +
      `Call list_available_tools first to confirm a tool exists, then call this, then continue with the user's request.`,
    inputSchema: z.object({
      groups: z
        .array(z.string().min(1))
        .min(1)
        .describe(`Tool group ids to enable: ${CONDITIONAL_GROUP_IDS.join(", ")}`),
    }),
    execute: async ({ groups }: { groups?: string[] | string }) => {
      // Defensive normalisation: tool args are not always validated before
      // `execute` runs, and models sometimes pass a comma-separated string
      // ("fs_write, fs_read") or omit the field instead of a proper array.
      // Normalise any shape so this never throws (e.g. the old
      // "groups.filter is not a function" crash).
      const requested = asStringArray(groups).filter((g) => CONDITIONAL_GROUPS[g]);
      const valid = requested.filter(groupIsPresent);
      const skipped = requested.filter((g) => !groupIsPresent(g));
      if (valid.length === 0) {
        return (
          `No loadable tool groups in request. Valid groups: ${CONDITIONAL_GROUP_IDS.join(", ")}. ` +
          (skipped.length > 0
            ? `Requested but not available in this build: ${skipped.join(", ")}.`
            : "")
        );
      }

      db.transaction(() => {
        const current = db
          .select({ toolGroups: conversations.toolGroups })
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .get();
        const parsed = parseStoredToolState(current?.toolGroups);
        for (const g of valid) parsed.explicit.add(g);
        db.update(conversations)
          .set({ toolGroups: { explicit: Array.from(parsed.explicit), recent: Array.from(parsed.recent) } })
          .where(eq(conversations.id, conversationId))
          .run();
      });

      return (
        `Enabled tool group(s): ${valid.join(", ")}. ` +
        `The tools are now loaded — they will be available in your next step, so continue with the user's request.` +
        (skipped.length > 0
          ? ` Skipped (tools not available in this build): ${skipped.join(", ")}.`
          : "")
      );
    },
  };
}

/**
 * Persist the tool-group state after a request. Best-effort and cheap (a
 * single UPDATE, no LLM call).
 *
 * - `explicit` groups (load_tool_groups adds) are preserved forever.
 * - `recent` is set to THIS request's own classifier∪recency signal (not the
 *   full active set, which would grow monotonically), so stale groups decay.
 *
 * The stored state is RE-READ from the database rather than trusting a
 * snapshot: load_tool_groups can add explicit groups mid-stream, and writing
 * a stale snapshot back would silently clobber them.
 */
export async function persistActiveToolGroups(opts: {
  conversationId: number;
  activeGroups: ReadonlySet<string>;
}): Promise<void> {
  try {
    const { conversationId, activeGroups } = opts;
    const row = await db
      .select({ toolGroups: conversations.toolGroups })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();
    const stored = parseStoredToolState(row?.toolGroups);
    const recent = new Set(activeGroups);
    for (const group of stored.explicit) recent.delete(group);
    await db
      .update(conversations)
      .set({
        toolGroups: {
          explicit: Array.from(stored.explicit),
          recent: Array.from(recent),
        },
      })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    console.error("[tool-groups] Failed to persist active groups:", err);
  }
}
