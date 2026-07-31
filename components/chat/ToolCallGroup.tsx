"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ToolUIPart, DynamicToolUIPart } from "ai";
import { getToolName } from "ai";
import { cn } from "@/lib/utils";
import { ToolCallCard } from "./ToolCallCard";
import {
  ChevronDown,
  Loader2,
  Sparkles,
  Search,
  Pencil,
  FolderSearch,
  List,
  FileText,
  Image,
  FileSearch,
  Clock,
  Monitor,
  Terminal,
  HelpCircle,
  Bot,
  ClipboardList,
  RefreshCw,
  Eye,
  Brain,
  User,
  UserRoundPen,
} from "lucide-react";

type AnyToolPart = ToolUIPart<any> | DynamicToolUIPart;

function getState(part: AnyToolPart): string {
  return (part as any).state ?? "call-result";
}

function isPartRunning(part: AnyToolPart): boolean {
  const s = getState(part);
  return (
    s === "call-result" ||
    s === "input-streaming" ||
    s === "input-available" ||
    s === "approval-requested"
  );
}

function isPartComplete(part: AnyToolPart): boolean {
  const s = getState(part);
  return (
    s === "output-available" ||
    s === "output-denied" ||
    s === "approval-responded"
  );
}

function getOutput(part: AnyToolPart): unknown {
  return (part as any).output;
}

function isQuestionsPart(part: AnyToolPart): boolean {
  const output = getOutput(part);
  return (
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).type === "questions"
  );
}

// ---------------------------------------------------------------------------
// Tool-specific action labels & icons
// ---------------------------------------------------------------------------

interface ToolLabel {
  present: string;
  past: string;
  icon: React.ComponentType<{ className?: string }> | null;
}

const TOOL_LABELS: Record<string, ToolLabel> = {
  list_permitted_roots: {
    present: "Discovering directories",
    past: "Discovered directories",
    icon: FolderSearch,
  },
  list_directory: {
    present: "Listing files",
    past: "Listed files",
    icon: List,
  },
  create_directory: {
    present: "Creating directory",
    past: "Created directory",
    icon: FolderSearch,
  },
  read_file: {
    present: "Reading file",
    past: "Read file",
    icon: FileText,
  },
  read_media: {
    present: "Scanning image",
    past: "Scanned image",
    icon: Image,
  },
  search_files: {
    present: "Searching files",
    past: "Searched files",
    icon: Search,
  },
  glob_files: {
    present: "Finding files",
    past: "Found files",
    icon: FileSearch,
  },
  write_file: {
    present: "Writing file",
    past: "Wrote file",
    icon: Pencil,
  },
  get_time_details: {
    present: "Checking time",
    past: "Checked time",
    icon: Clock,
  },
  get_device_details: {
    present: "Checking device",
    past: "Checked device",
    icon: Monitor,
  },
  python_exec: {
    present: "Running Python",
    past: "Ran Python",
    icon: Terminal,
  },
  js_exec: {
    present: "Running JavaScript",
    past: "Ran JavaScript",
    icon: Terminal,
  },
  read_document: {
    present: "Reading document",
    past: "Read document",
    icon: FileText,
  },
  ask_questions: {
    present: "Asking questions",
    past: "Asked questions",
    icon: HelpCircle,
  },
  spawn_agent: {
    present: "Spawning agent",
    past: "Spawned agent",
    icon: Bot,
  },
  get_agent_result: {
    present: "Checking agent",
    past: "Checked agent",
    icon: Bot,
  },
  todos_init: {
    present: "Planning tasks",
    past: "Planned tasks",
    icon: ClipboardList,
  },
  todos_update: {
    present: "Updating tasks",
    past: "Updated tasks",
    icon: RefreshCw,
  },
  todos_view: {
    present: "Viewing tasks",
    past: "Viewed tasks",
    icon: Eye,
  },
  list_available_tools: {
    present: "Discovering tools",
    past: "Discovered tools",
    icon: Search,
  },
  get_tool_details: {
    present: "Checking tool",
    past: "Checked tool",
    icon: Search,
  },
  query_file_index: {
    present: "Searching file index",
    past: "Searched file index",
    icon: Search,
  },
  get_tool_help: {
    present: "Getting help",
    past: "Got help",
    icon: HelpCircle,
  },
  get_recent_memories: {
    present: "Recalling memory",
    past: "Recalled memory",
    icon: Brain,
  },
  search_memories: {
    present: "Searching memory",
    past: "Searched memory",
    icon: Search,
  },
  get_profile: {
    present: "Checking profile",
    past: "Checked profile",
    icon: User,
  },
  update_profile: {
    present: "Updating profile",
    past: "Updated profile",
    icon: UserRoundPen,
  },
  remember: {
    present: "Saving to memory",
    past: "Saved to memory",
    icon: Brain,
  },
  fc_search: {
    present: "Searching web",
    past: "Searched web",
    icon: Search,
  },
  fc_scrape: {
    present: "Scraping web",
    past: "Scraped web",
    icon: Search,
  },
};

const FALLBACK_LABEL: ToolLabel = {
  present: "Thinking",
  past: "Thought",
  icon: Sparkles,
};

function getToolLabel(toolName: string): ToolLabel {
  return TOOL_LABELS[toolName.toLowerCase()] ?? FALLBACK_LABEL;
}

// Pick the most specific label from a group of tools (prefer non-fallback)
function getGroupLabel(parts: AnyToolPart[]): ToolLabel {
  let best: ToolLabel | null = null;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    let name: string;
    try {
      name = getToolName(part).toLowerCase();
    } catch {
      continue;
    }
    const label = getToolLabel(name);
    if (label !== FALLBACK_LABEL) best = label;
  }
  return best ?? FALLBACK_LABEL;
}

// Detect MCP tool calls — MCP tools arrive namespaced as "serverName__toolName".
// Returns the first MCP server name found, or undefined if the group is pure built-in.
function getMcpServerName(parts: AnyToolPart[]): string | undefined {
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    let name: string;
    try {
      name = getToolName(part);
    } catch {
      continue;
    }
    if (name.includes("__")) {
      return name.split("__")[0];
    }
  }
  return undefined;
}

export function ToolCallGroup({
  parts,
}: {
  parts: AnyToolPart[];
}) {
  const { present, past, icon: ActionIcon } = getGroupLabel(parts);

  // MCP tools arrive namespaced as "serverName__toolName" — surface a badge
  // so the user can see at a glance when the AI is talking to an MCP server.
  const mcpServer = getMcpServerName(parts);

  // Detect if any part has questions output — keep expanded so the user can see
  // and interact with the cards.
  const hasQuestions = parts.some(isQuestionsPart);
  const keepOpen = hasQuestions;

  // Start expanded if the group contains questions or suggestions, otherwise collapsed.
  const [isOpen, setIsOpen] = useState(keepOpen);

  const running = parts.some(isPartRunning);
  const completed = parts.every(isPartComplete);

  // Track whether the user manually clicked the toggle.
  // If they did, skip auto-collapse so their intent is respected.
  const userToggledRef = useRef(false);

  // Auto-expand when questions or suggestions appear (output arrives after streaming completes)
  useEffect(() => {
    if (keepOpen) {
      setIsOpen(true);
    }
  }, [keepOpen]);

  // When all tools finish, auto-collapse ONLY if the user never manually
  // toggled the group open. Skip auto-collapse for questions and suggestions — we want the
  // interactive cards to stay visible.
  useEffect(() => {
    if (completed && parts.length > 0 && !keepOpen) {
      if (userToggledRef.current) return; // user manually toggled — keep as-is
      const timer = setTimeout(() => setIsOpen(false), 250);
      return () => clearTimeout(timer);
    }
  }, [completed, parts.length, keepOpen]);

  const toggle = useCallback(() => {
    userToggledRef.current = true;
    setIsOpen((o) => !o);
  }, []);

  return (
    <div className={`overflow-hidden animate-tool-slide-up ${isOpen ? 'rounded-lg' : 'rounded-xl'}`}>
      {/* Header — always visible, clickable to toggle */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40",
          isOpen && "border-b border-border/50",
        )}
      >
        {/* Icon */}
        {ActionIcon && (
<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
  {running ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  ) : ActionIcon ? (
    <ActionIcon className="h-3.5 w-3.5 text-muted-foreground" />
  ) : null}
</div>
)}

        {/* Label */}
        <span className="text-sm font-medium text-foreground">
          {running ? present : past}
        </span>

        {/* MCP badge — shown when any call in the group hits an MCP server */}
        {mcpServer && (
          <span className="shrink-0 rounded-full bg-primary/5 px-1.5 py-px text-[10px] font-small leading-4 text-primary">
            MCP · {mcpServer}
          </span>
        )}

        {/* Count */}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {parts.length > 1 ? `${parts.length} ` : null}
          {parts.length === 1 ? "" : "calls"}
        </span>

        {/* Chevron */}
        { parts.length > 1 &&
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            isOpen && "rotate-180",
          )}
        />
}
      </button>

      {/* Collapsible body — animated via grid-rows trick */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1 p-1.5">
            {parts.map((part, idx) => (
              <div key={(part as any).toolCallId ?? idx}>
                <ToolCallCard part={part} compact />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
