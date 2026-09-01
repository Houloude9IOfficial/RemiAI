"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ToolUIPart, DynamicToolUIPart } from "ai";
import { getToolName } from "ai";
import { cn } from "@/lib/utils";
import {
  summarizeBuildCheckCounts,
  summarizeBuildChecks,
  type BuildVerificationCheck,
} from "@/lib/chat/build-verification";
import { ToolCallCard } from "./ToolCallCard";
import {
  CheckCircle2,
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
  XCircle,
  Download,
  Music,
  Clapperboard,
  AudioLines,
  SlidersHorizontal,
} from "lucide-react";

type AnyToolPart = ToolUIPart | DynamicToolUIPart;

function getState(part: AnyToolPart): string {
  return part.state ?? "call-result";
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
  return part.output;
}

function getInput(part: AnyToolPart): unknown {
  return part.input;
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

function isRunNamePart(part: AnyToolPart): boolean {
  try {
    return bareToolName(getToolName(part)) === "set_run_name";
  } catch {
    return false;
  }
}

function getRunName(parts: AnyToolPart[]): string | null {
  for (const part of parts) {
    if (!isRunNamePart(part)) continue;
    const output = asRecord(getOutput(part));
    const input = asRecord(getInput(part));
    const name = output?.name ?? input?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
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
  edit_file: {
    present: "Editing file",
    past: "Edited file",
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
  get_media_metadata: {
    present: "Reading media metadata",
    past: "Read media metadata",
    icon: FileSearch,
  },
  convert_media: {
    present: "Converting media",
    past: "Converted media",
    icon: Clapperboard,
  },
  extract_audio: {
    present: "Extracting audio",
    past: "Extracted audio",
    icon: Music,
  },
  extract_video_frames: {
    present: "Extracting frames",
    past: "Extracted frames",
    icon: Image,
  },
  transcribe_audio: {
    present: "Transcribing audio",
    past: "Transcribed audio",
    icon: AudioLines,
  },
  manage_transcription_models: {
    present: "Managing transcription models",
    past: "Managed transcription models",
    icon: SlidersHorizontal,
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
  load_tool_groups: {
    present: "Loading tools",
    past: "Loaded tools",
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
  brave_web_search: {
    present: "Searching web",
    past: "Searched web",
    icon: Search,
  },
  brave_image_search: {
    present: "Searching images",
    past: "Searched images",
    icon: Image,
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
  session_file_edit: {
    present: "Editing session file",
    past: "Edited session file",
    icon: Pencil,
  },
  set_run_name: {
    present: "Starting work",
    past: "Completed work",
    icon: Sparkles,
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

/**
 * Claude-style summary of a tool run: the past-tense activity label, call
 * count, run name, and live state. Used by the collapsed activity line at
 * the top of a message.
 */
export function summarizeToolActivity(parts: AnyToolPart[]) {
  const visibleParts = parts.filter((part) => !isRunNamePart(part));
  const groupParts = visibleParts.length > 0 ? visibleParts : parts;
  const { present, past } = getGroupLabel(groupParts);
  return {
    present,
    past,
    count: groupParts.length,
    runName: getRunName(parts),
    running: groupParts.some(isPartRunning),
    hasError: groupParts.some(isPartError),
    hasQuestions: groupParts.some(isQuestionsPart),
  };
}

function getGroupLabel(parts: AnyToolPart[]): ToolLabel {
  let best: ToolLabel | null = null;
  let sessionWriteCount = 0;
  let sessionWriteCreates = 0;
  let hasSessionEdit = false;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    let name: string;
    try {
      name = getToolName(part);
    } catch {
      continue;
    }
    const bare = bareToolName(name);
    if (bare === "session_file_write") {
      sessionWriteCount++;
      const output = asRecord(getOutput(part));
      if (output && output.created === true) sessionWriteCreates++;
    }
    if (bare === "session_file_edit") hasSessionEdit = true;
    const label = getToolLabel(name);
    if (label !== FALLBACK_LABEL) best = label;
  }
  // If ALL session_file_write calls were updates (zero creates), show "Updated"
  if (sessionWriteCount > 0 && sessionWriteCreates === 0 && best) {
    return { present: "Updating session file", past: "Updated session file", icon: best.icon };
  }
  // A chain that reads AND edits session files is summarized by the edit —
  // that's the significant action (reads are just prep work).
  if (hasSessionEdit && best) {
    const editLabel = TOOL_LABELS.session_file_edit;
    return { present: editLabel.present, past: editLabel.past, icon: editLabel.icon };
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

export function extractFileChanges(parts: AnyToolPart[]): FileChangeSummary[] {
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

    if (name === "write_file" || name === "session_file_write" || name === "edit_file" || name === "session_file_edit") {
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
        typeof output?.bytesChanged === "number" ? output.bytesChanged :
        typeof output?.wrote === "number" ? output.wrote : undefined;

      // Fallback: estimate lines from input content when metadata missing
      let added = linesAdded;
      const removed = linesRemoved;
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

/**
 * File-change summary box. Rendered inline under a tool group by default, or
 * as a standalone canvas-style card (used at the end of a message).
 */
export function FileChangeDigest({
  changes,
  standalone = false,
}: {
  changes: FileChangeSummary[];
  standalone?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (changes.length === 0) return null;

  const visible = showAll ? changes : changes.slice(0, FILE_PREVIEW_LIMIT);
  const hidden = changes.length - visible.length;

  return (
    <div className={standalone ? "" : "px-2 pb-1.5"}>
      <div
        className={
          standalone
            ? "overflow-hidden rounded-xl bg-primary/[0.04] px-3.5 py-3"
            : "mt-1 rounded-md border border-border/20 bg-surface-2/60 px-2.5 py-2"
        }
      >
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          {changes.length === 1
            ? "1 change"
            : `${changes.length} changes`}
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

function VerificationDigest({ checks }: { checks: BuildVerificationCheck[] }) {
  if (checks.length === 0) return null;

  const counts = summarizeBuildCheckCounts(checks);
  return (
    <div className="px-2 pb-1.5">
      <div className="mt-1 rounded-md border border-border/20 bg-surface-2/60 px-2.5 py-2">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span>Verification</span>
          <span className="ml-auto tabular-nums">
            {counts.passed > 0 && (
              <span className="text-status-success">{counts.passed} passed</span>
            )}
            {counts.failed > 0 && (
              <span className="ml-2 text-status-danger">{counts.failed} failed</span>
            )}
            {counts.incomplete > 0 && (
              <span className="ml-2 text-muted-foreground">{counts.incomplete} incomplete</span>
            )}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {checks.map((check, index) => (
            <li
              key={`${check.toolName}-${check.command}-${index}`}
              className="flex min-w-0 items-center gap-2 text-[11px] leading-tight"
            >
              {check.status === "passed" ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-status-success" />
              ) : (
                <XCircle className="h-3 w-3 shrink-0 text-status-danger" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
                {check.command}
              </span>
              <span
                className={cn(
                  "shrink-0 tabular-nums",
                  check.status === "passed"
                    ? "text-status-success"
                    : check.status === "failed"
                      ? "text-status-danger"
                      : "text-muted-foreground",
                )}
              >
                {check.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ToolCallGroup({
  parts,
  headerless = false,
}: {
  parts: AnyToolPart[];
  /** Render only the execution trace — no header button or collapsible
      wrapper. Used inside the Claude-style activity disclosure, which owns
      the summary line and expand/collapse state. */
  headerless?: boolean;
}) {
  const visibleParts = parts.filter((part) => !isRunNamePart(part));
  const runName = getRunName(parts);
  const groupParts = visibleParts.length > 0 ? visibleParts : parts;
  const { present, past } = getGroupLabel(groupParts);
  const mcpServer = getMcpServerName(groupParts);
  const hasQuestions = groupParts.some(isQuestionsPart);
  const keepOpen = hasQuestions;
  const isBatch = groupParts.length > 1;

  const [isOpen, setIsOpen] = useState(keepOpen);
  const userToggledRef = useRef(false);

  const running = groupParts.some(isPartRunning);
  const completed = groupParts.every(isPartComplete) && groupParts.length > 0;
  const hasError = groupParts.some(isPartError);

  const fileChanges = useMemo(() => extractFileChanges(groupParts), [groupParts]);
  const verificationChecks = useMemo(
    () => summarizeBuildChecks(groupParts),
    [groupParts],
  );
  const hasVerificationFailure = verificationChecks.some(
    (check) => check.status === "failed",
  );

  // Client-side elapsed timer (live while running; frozen when done)
  const startRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalElapsedMs, setFinalElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (running) {
      if (startRef.current === null) startRef.current = Date.now();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the frozen duration when a new tool run starts
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
    if (keepOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- questions must force the disclosure open after tool output arrives
      setIsOpen(true);
    }
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

  const displayElapsed = finalElapsedMs ??
    // eslint-disable-next-line react-hooks/refs -- the timer's start marker is intentionally read during render for the live label
    (running && startRef.current !== null ? elapsedMs : null);

  const summaryLabel = runName ??
    (hasError || hasVerificationFailure
      ? hasVerificationFailure && !hasError
        ? "Verification failed"
        : "Work stopped with an error"
      : running
        ? present
        : past);

  // Single unremarkable call — no grouping needed. In headerless mode we
  // still show it as a plain card inside the disclosure's trace.
  if (
    !headerless &&
    !isBatch &&
    !runName &&
    fileChanges.length === 0 &&
    verificationChecks.length === 0
  ) {
    return <ToolCallCard part={groupParts[0]} compact />;
  }

  const trace = (
    <div className="flex flex-col gap-1 p-1.5 pt-0">
      {groupParts.map((part, idx) => {
              const runningPart = isPartRunning(part);
              const errorPart = isPartError(part);
              const completePart = isPartComplete(part);
              let toolName = "tool";
              try {
                toolName = bareToolName(getToolName(part));
              } catch {
                // Keep a stable generic label for malformed/persisted parts.
              }
              const StepIcon = getToolLabel(toolName).icon ?? Wrench;
              return (
                <div
                  key={part.toolCallId ?? idx}
                  className="relative pl-5"
                  aria-label={`${getToolLabel(toolName).past}: ${toolName}`}
                >
                  {idx < groupParts.length - 1 && (
                    <span
                      className="absolute left-1.5 top-4.5 bottom-[-0.25rem] w-px bg-border/60"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      "absolute left-0 top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background",
                      errorPart
                        ? "text-status-danger"
                        : runningPart
                          ? "text-primary"
                          : completePart
                            ? "text-status-success"
                            : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {errorPart ? (
                      <XCircle className="h-3 w-3" />
                    ) : runningPart ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <StepIcon className="h-3 w-3" />
                    )}
                  </span>
                  <ToolCallCard part={part} compact />
                </div>
              );
            })}
    </div>
  );

  // Headerless — just the trace (owned by the activity disclosure).
  if (headerless) {
    return (
      <div className="animate-tool-slide-up">
        {!running && <VerificationDigest checks={verificationChecks} />}
        {trace}
      </div>
    );
  }

  return (
    <div className="animate-tool-slide-up">
      {/* Header — styled exactly like a compact ToolCallCard, with the call
          count appended so a group is still distinguishable from one call */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={`${summaryLabel}${groupParts.length > 1 ? `, ${groupParts.length} calls` : ""}`}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <div
          className={cn(
            "flex h-3 w-3 shrink-0 items-center justify-center",
            hasError || hasVerificationFailure
              ? "text-status-danger"
              : "text-muted-foreground",
          )}
        >
          {hasError || hasVerificationFailure ? (
            <XCircle className="h-3 w-3" />
          ) : running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
        </div>

        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
          {summaryLabel}
          {groupParts.length > 1 && (
            <span className="text-muted-foreground">
              {" "}· {groupParts.length} calls
            </span>
          )}
        </span>

        {mcpServer && (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
            {mcpServer}
          </span>
        )}

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {!running && <VerificationDigest checks={verificationChecks} />}

      {/* Collapsible execution trace — the connector makes sequential tool
          work readable without exposing private model chain-of-thought. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isOpen ? "grid-rows-[1fr] mt-1.5" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">{trace}</div>
      </div>
    </div>
  );
}
