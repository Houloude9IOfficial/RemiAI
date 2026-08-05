"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  FilePlus2,
  FileMinus2,
  FileDiff,
  Wrench,
  Download,
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

function isPartError(part: AnyToolPart): boolean {
  return getState(part) === "output-error";
}

function getOutput(part: AnyToolPart): unknown {
  return (part as any).output;
}

function getInput(part: AnyToolPart): unknown {
  return (part as any).input;
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

function bareToolName(name: string): string {
  const lower = name.toLowerCase();
  return lower.includes("__") ? lower.split("__").slice(1).join("__") : lower;
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
  web_search: {
    present: "Searching web",
    past: "Searched web",
    icon: Search,
  },
  web_fetch: {
    present: "Fetching content",
    past: "Fetched content",
    icon: Search,
  },
  fc_scrape: {
    present: "Scraping web",
    past: "Scraped web",
    icon: Search,
  },
  session_file_list: {
    present: "Listing session files",
    past: "Listed session files",
    icon: List,
  },
  session_file_read: {
    present: "Reading session file",
    past: "Read session file",
    icon: FileText,
  },
  session_file_write: {
    present: "Writing session file",
    past: "Wrote session file",
    icon: Pencil,
  },
  session_file_download: {
    present: "Downloading session files",
    past: "Downloaded session files",
    icon: Download,
  },
  session_file_delete: {
    present: "Deleting session file",
    past: "Deleted session file",
    icon: FolderSearch,
  },
  session_present_files: {
    present: "Preparing session files",
    past: "Presented session files",
    icon: Eye,
  },
  session_open_file: {
    present: "Opening session file",
    past: "Opened session file",
    icon: Eye,
  },
  rename_item: {
    present: "Renaming",
    past: "Renamed",
    icon: Pencil,
  },
  delete_directory: {
    present: "Deleting",
    past: "Deleted",
    icon: FolderSearch,
  },
};

const FALLBACK_LABEL: ToolLabel = {
  present: "Working",
  past: "Worked",
  icon: Wrench,
};

function getToolLabel(toolName: string): ToolLabel {
  return TOOL_LABELS[bareToolName(toolName)] ?? FALLBACK_LABEL;
}

function getGroupLabel(parts: AnyToolPart[]): ToolLabel {
  let best: ToolLabel | null = null;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    let name: string;
    try {
      name = getToolName(part);
    } catch {
      continue;
    }
    const label = getToolLabel(name);
    if (label !== FALLBACK_LABEL) best = label;
  }
  return best ?? FALLBACK_LABEL;
}

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

// ---------------------------------------------------------------------------
// Elapsed time helpers
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms / 100) * 100)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) {
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

// ---------------------------------------------------------------------------
// File-change digest (mixed precision)
// ---------------------------------------------------------------------------

export type FileChangeSummary = {
  path: string;
  kind: "create" | "edit" | "delete" | "rename";
  linesAdded?: number;
  linesRemoved?: number;
  bytes?: number;
};

function shortPath(fp: string): string {
  const normalized = fp.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/") || normalized;
  return parts.slice(-2).join("/");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickPath(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.replace(/\\/g, "/");
    }
  }
  return null;
}

function extractFileChanges(parts: AnyToolPart[]): FileChangeSummary[] {
  const changes: FileChangeSummary[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (!isPartComplete(part) && !isPartError(part)) continue;

    let name: string;
    try {
      name = bareToolName(getToolName(part));
    } catch {
      continue;
    }

    const input = asRecord(getInput(part));
    const output = asRecord(getOutput(part));

    if (name === "write_file" || name === "session_file_write") {
      const path =
        pickPath(
          output?.relativePath,
          output?.path,
          input?.relativePath,
          input?.path,
        ) ?? null;
      if (!path || seen.has(path)) continue;
      seen.add(path);

      const created = output?.created === true;
      const linesAdded =
        typeof output?.linesAdded === "number" ? output.linesAdded : undefined;
      const linesRemoved =
        typeof output?.linesRemoved === "number"
          ? output.linesRemoved
          : undefined;
      const bytes =
        typeof output?.wrote === "number" ? output.wrote : undefined;

      // Fallback: estimate lines from input content when metadata missing
      let added = linesAdded;
      let removed = linesRemoved;
      if (added === undefined && typeof input?.content === "string") {
        const content = input.content as string;
        added = content.length === 0 ? 0 : content.split("\n").length;
      }

      changes.push({
        path,
        kind: created ? "create" : "edit",
        linesAdded: added,
        linesRemoved: removed,
        bytes,
      });
      continue;
    }

    if (name === "create_directory") {
      const path =
        pickPath(output?.path, input?.relativePath, input?.path) ?? null;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      changes.push({ path, kind: "create" });
      continue;
    }

    if (name === "delete_directory" || name === "session_file_delete") {
      const path =
        pickPath(output?.path, input?.relativePath, input?.path) ?? null;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      changes.push({ path, kind: "delete" });
      continue;
    }

    if (name === "rename_item") {
      const path =
        pickPath(
          output?.newPath,
          input?.destRelativePath,
          input?.newRelativePath,
          input?.relativePath,
        ) ?? null;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      changes.push({ path, kind: "rename" });
    }
  }

  return changes;
}

const FILE_PREVIEW_LIMIT = 4;

function FileChangeDigest({ changes }: { changes: FileChangeSummary[] }) {
  const [showAll, setShowAll] = useState(false);
  if (changes.length === 0) return null;

  const visible = showAll ? changes : changes.slice(0, FILE_PREVIEW_LIMIT);
  const hidden = changes.length - visible.length;

  return (
    <div className="px-3.5 pb-2.5">
      <div className="mt-2 rounded-lg border border-border/20 bg-surface-2/60 px-2.5 py-2">
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          {changes.length === 1
            ? "1 file changed"
            : `${changes.length} files changed`}
        </div>
        <ul className="flex flex-col gap-1">
          {visible.map((change) => {
            const KindIcon =
              change.kind === "create"
                ? FilePlus2
                : change.kind === "delete"
                  ? FileMinus2
                  : FileDiff;
            return (
              <li
                key={`${change.kind}-${change.path}`}
                className="flex items-center gap-2 text-[12px] leading-tight"
              >
                <KindIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-foreground/85">
                  {shortPath(change.path)}
                </span>
                <span className="shrink-0 tabular-nums text-[11px]">
                  {typeof change.linesAdded === "number" &&
                    change.linesAdded > 0 && (
                      <span className="text-status-success">
                        +{change.linesAdded}
                      </span>
                    )}
                  {typeof change.linesRemoved === "number" &&
                    change.linesRemoved > 0 && (
                      <span className="ml-1 text-status-danger">
                        −{change.linesRemoved}
                      </span>
                    )}
                  {change.linesAdded === undefined &&
                    change.linesRemoved === undefined &&
                    typeof change.bytes === "number" && (
                      <span className="text-muted-foreground">
                        {change.bytes < 1024
                          ? `${change.bytes} B`
                          : `${(change.bytes / 1024).toFixed(1)} KB`}
                      </span>
                    )}
                </span>
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Show {hidden} more {hidden === 1 ? "file" : "files"}
          </button>
        )}
        {showAll && changes.length > FILE_PREVIEW_LIMIT && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="mt-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ToolCallGroup({
  parts,
}: {
  parts: AnyToolPart[];
}) {
  const { present, past, icon: ActionIcon } = getGroupLabel(parts);
  const mcpServer = getMcpServerName(parts);
  const hasQuestions = parts.some(isQuestionsPart);
  const keepOpen = hasQuestions;

  const [isOpen, setIsOpen] = useState(keepOpen);
  const userToggledRef = useRef(false);

  const running = parts.some(isPartRunning);
  const completed = parts.every(isPartComplete) && parts.length > 0;
  const hasError = parts.some(isPartError);

  const fileChanges = useMemo(() => extractFileChanges(parts), [parts]);

  // Client-side elapsed timer (live while running; frozen when done)
  const startRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalElapsedMs, setFinalElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (running) {
      if (startRef.current === null) startRef.current = Date.now();
      setFinalElapsedMs(null);
      const id = window.setInterval(() => {
        setElapsedMs(Date.now() - (startRef.current ?? Date.now()));
      }, 1);
      return () => window.clearInterval(id);
    }
    if (completed && startRef.current !== null && finalElapsedMs === null) {
      const total = Date.now() - startRef.current;
      setElapsedMs(total);
      setFinalElapsedMs(total);
    }
  }, [running, completed, finalElapsedMs]);

  useEffect(() => {
    if (keepOpen) setIsOpen(true);
  }, [keepOpen]);

  useEffect(() => {
    if (completed && parts.length > 0 && !keepOpen) {
      if (userToggledRef.current) return;
      const timer = setTimeout(() => setIsOpen(false), 250);
      return () => clearTimeout(timer);
    }
  }, [completed, parts.length, keepOpen]);

  const toggle = useCallback(() => {
    userToggledRef.current = true;
    setIsOpen((o) => !o);
  }, []);

  const displayElapsed =
    finalElapsedMs ?? (running && startRef.current !== null ? elapsedMs : null);

  const summaryLabel = running ? present : past;

  return (
    <div
      className={cn(
        "overflow-hidden border border-border/55 bg-surface-1/40 animate-tool-slide-up",
        isOpen ? "rounded-xl" : "rounded-xl",
      )}
    >
      {/* Header — always visible, clickable to toggle */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/35",
        )}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : ActionIcon ? (
            <ActionIcon
              className={cn(
                "h-4.5 w-4.5",
                hasError ? "text-status-danger" : "text-muted-foreground",
              )}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">
              {summaryLabel}
            </span>
            {mcpServer && (
              <span className="shrink-0 rounded-md bg-primary/8 px-1.5 py-px text-[10px] font-medium text-primary">
                MCP · {mcpServer}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {displayElapsed !== null && (
              <span className="tabular-nums">
                {running
                  ? `Working · ${formatElapsed(displayElapsed)}`
                  : `Worked for ${formatElapsed(displayElapsed)}`}
              </span>
            )}
            {displayElapsed === null && running && (
              <span>Working…</span>
            )}
            {fileChanges.length > 0 && !running && (
              <>
                {displayElapsed !== null && <span aria-hidden>·</span>}
                <span>
                  {fileChanges.length === 1
                    ? "1 file"
                    : `${fileChanges.length} files`}
                </span>
              </>
            )}
            {parts.length > 1 && (
              <>
                {(displayElapsed !== null || fileChanges.length > 0) && (
                  <span aria-hidden>·</span>
                )}
                <span className="tabular-nums">{parts.length} calls</span>
              </>
            )}
          </div>
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* File digest — rendered once in a stable spot below the header so it
          never pops or remounts when the tool calls expand/collapse beneath it */}
      {fileChanges.length > 0 && !running && (
        <FileChangeDigest changes={fileChanges} />
      )}

      {/* Collapsible body — only the individual tool calls animate */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isOpen ? "grid-rows-[1fr] mt-1.5" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1 p-1.5 pt-0">
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
