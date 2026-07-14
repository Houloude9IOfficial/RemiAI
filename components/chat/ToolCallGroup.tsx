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
  icon: React.ComponentType<{ className?: string }>;
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
  read_file: {
    present: "Reading file",
    past: "Read file",
    icon: FileText,
  },
  read_media: {
    present: "Reading media",
    past: "Read media",
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

export function ToolCallGroup({
  parts,
}: {
  parts: AnyToolPart[];
}) {
  const { present, past, icon: ActionIcon } = getGroupLabel(parts);

  // Detect if any part has questions output — keep expanded so the user can see
  // and interact with the question cards.
  const hasQuestions = parts.some(isQuestionsPart);

  // Start expanded if the group contains questions, otherwise collapsed.
  const [isOpen, setIsOpen] = useState(hasQuestions);

  const running = parts.some(isPartRunning);
  const completed = parts.every(isPartComplete);

  // Track whether the user manually clicked the toggle.
  // If they did, skip auto-collapse so their intent is respected.
  const userToggledRef = useRef(false);

  // Auto-expand when questions appear (output arrives after streaming completes)
  useEffect(() => {
    if (hasQuestions) {
      setIsOpen(true);
    }
  }, [hasQuestions]);

  // When all tools finish, auto-collapse ONLY if the user never manually
  // toggled the group open. Skip auto-collapse for questions — we want the
  // interactive cards to stay visible.
  useEffect(() => {
    if (completed && parts.length > 0 && !hasQuestions) {
      if (userToggledRef.current) return; // user manually toggled — keep as-is
      const timer = setTimeout(() => setIsOpen(false), 250);
      return () => clearTimeout(timer);
    }
  }, [completed, parts.length, hasQuestions]);

  const toggle = useCallback(() => {
    userToggledRef.current = true;
    setIsOpen((o) => !o);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20 dark:bg-muted/10 animate-tool-slide-up">
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
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted-foreground/10">
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <ActionIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>

        {/* Label */}
        <span className="text-sm font-medium text-foreground">
          {running ? present : past}
        </span>

        {/* Count */}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {parts.length} {parts.length === 1 ? "call" : "calls"}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            isOpen && "rotate-180",
          )}
        />
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
              <div
                key={(part as any).toolCallId ?? idx}
                className="animate-tool-card-in"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <ToolCallCard
                  part={part}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
