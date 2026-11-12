"use client";

import type { ToolUIPart, DynamicToolUIPart } from "ai";
import { getToolName } from "ai";
import { cn } from "@/lib/utils";
import {
  summarizeBuildCheckCounts,
  type BuildVerificationCheck,
} from "@/lib/chat/build-verification";
import {
  CheckCircle2,
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
  AlertTriangle,
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

function isPartError(part: AnyToolPart): boolean {
  return getState(part) === "output-error";
}

function getOutput(part: AnyToolPart): unknown {
  return part.output;
}

function getInput(part: AnyToolPart): unknown {
  return part.input;
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
  bash_execute: { present: "Running command", past: "Ran command", icon: Terminal },
  work_terminal: { present: "Running command", past: "Ran command", icon: Terminal },
  create_visual: { present: "Creating visual", past: "Created visual", icon: Image },
  canvas_create: { present: "Creating canvas", past: "Created canvas", icon: FilePlus2 },
  canvas_open: { present: "Opening canvas", past: "Opened canvas", icon: Eye },
  canvas_add_file: { present: "Adding canvas file", past: "Added canvas file", icon: FilePlus2 },
  suggest_followups: { present: "Preparing suggestions", past: "Prepared suggestions", icon: Sparkles },
  work_browser_screenshot: { present: "Capturing screenshot", past: "Captured screenshot", icon: Image },
  switch_mode: { present: "Switching mode", past: "Switched mode", icon: RefreshCw },
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
  present: "Running tool",
  past: "Ran tool",
  icon: Wrench,
};

function getToolLabel(toolName: string): ToolLabel {
  const name = bareToolName(toolName);
  return Object.hasOwn(TOOL_LABELS, name) ? TOOL_LABELS[name] : FALLBACK_LABEL;
}

function toolFailed(part: AnyToolPart) {
  const result = asRecord(getOutput(part));
  return isPartError(part) || Boolean(result?.error) ||
    result?.success === false || result?.ok === false || result?.timedOut === true ||
    (typeof result?.exitCode === "number" && result.exitCode !== 0);
}

/** User-facing activity uses fixed labels and counts, with no tool payloads. */
export function describeToolActivity(part: AnyToolPart, active: boolean) {
  const name = bareToolName(getToolName(part) ?? "");
  const { present, past, icon } = getToolLabel(name);
  const result = asRecord(getOutput(part));
  const failed = toolFailed(part);
  const denied = getState(part) === "output-denied" ||
    ("approval" in part && part.approval?.approved === false);
  const running = !failed && !denied && (isPartRunning(part) ||
    ("preliminary" in part && part.preliminary === true));
  const label = result?.timedOut === true ? `${present} timed out`
    : failed ? `${present} failed`
    : denied ? `${present} was denied`
    : running ? active ? present : `${present} was interrupted`
    : past;
  return { Icon: failed || denied ? AlertTriangle : icon ?? Wrench, label, name, failed, denied, running };
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

  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (part.state !== "output-available" || part.preliminary || toolFailed(part)) continue;

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

  return changes.reverse();
}

export function FileChangeDigest({ changes }: { changes: FileChangeSummary[] }) {
  return (
    <ul tabIndex={0} aria-label="Changed files" className="mt-2 max-h-[min(50dvh,20rem)] space-y-2 overflow-y-auto overscroll-contain rounded-lg border border-border/50 p-3">
      {changes.map((change) => {
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
  );
}

export function VerificationDigest({ checks }: { checks: BuildVerificationCheck[] }) {
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
              key={`${check.toolName}-${index}`}
              className="flex min-w-0 items-center gap-2 text-[11px] leading-tight"
            >
              {check.status === "passed" ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-status-success" />
              ) : (
                <XCircle className="h-3 w-3 shrink-0 text-status-danger" />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground/80">
                {getToolLabel(check.toolName).past}
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
