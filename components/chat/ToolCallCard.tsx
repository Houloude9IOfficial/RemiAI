"use client";

import { useState } from "react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName, isDynamicToolUIPart, isToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import { decodeStreamError, STREAM_ERROR_PREFIX } from "@/lib/chat/error-payload";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Image,
  ChevronRight,
} from "lucide-react";
import { MediaDisplay } from "./MediaDisplay";
import { QuestionsCard } from "./QuestionsCard";
import { VisualCard } from "./VisualCard";

type AnyToolPart = ToolUIPart<any> | DynamicToolUIPart;

/** Lightweight / metadata tools — render as a single expandable line. */
const MINOR_TOOLS = new Set([
  "get_time_details",
  "get_device_details",
  "get_recent_memories",
  "query_recent_changes",
  "search_memories",
  "remember",
  "get_profile",
  "update_profile",
  "get_tool_help",
  "list_available_tools",
  "get_tool_details",
  "todos_view",
  "todos_init",
  "todos_update",
  "list_permitted_roots",
  "get_agent_result",
]);

function bareName(name: string): string {
  const lower = name.toLowerCase();
  return lower.includes("__") ? lower.split("__").slice(1).join("__") : lower;
}

function getState(part: AnyToolPart): string {
  return (part as any).state ?? "call-result";
}

function getInput(part: AnyToolPart): unknown {
  return (part as any).input;
}

function getOutput(part: AnyToolPart): unknown {
  return (part as any).output;
}

function getError(part: AnyToolPart): string | undefined {
  return (part as any).errorText;
}

/**
 * Tool errors can arrive either as plain text (current server behavior) or as
 * an encoded RMERR_JSON payload (older persisted messages). Decode the payload
 * so cards show the real, readable error instead of a raw "RMERR_JSON:%7B..."
 * blob.
 */
function formatToolError(errorText: string | undefined): string {
  if (!errorText || !errorText.includes(STREAM_ERROR_PREFIX)) {
    return errorText ?? "";
  }
  const decoded = decodeStreamError(errorText);
  if (!decoded) return errorText;
  // Prefer the real underlying message (the last "message=..." segment of the
  // technical field, mirroring ErrorCard's digging) over the generic title.
  const tech = decoded.technical ?? "";
  const idx = tech.lastIndexOf("message=");
  if (idx >= 0) {
    const rest = tech.slice(idx + "message=".length).trim();
    if (rest) return rest;
  }
  return decoded.title ?? errorText;
}

function getApproved(part: AnyToolPart): boolean | undefined {
  return (part as any).approved;
}

function isEmptyObject(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    Object.keys(obj as Record<string, unknown>).length === 0
  );
}

function minorSummary(name: string, output: unknown, running: boolean): string {
  if (running) {
    const labels: Record<string, string> = {
      get_time_details: "Checking time…",
      get_device_details: "Checking device…",
      get_recent_memories: "Recalling memory…",
      query_recent_changes: "Checking changes…",
      search_memories: "Searching memory…",
      remember: "Saving memory…",
      get_profile: "Checking profile…",
      update_profile: "Updating profile…",
      get_tool_help: "Getting help…",
      list_available_tools: "Listing tools…",
      get_tool_details: "Checking tool…",
      todos_view: "Viewing tasks…",
      todos_init: "Planning tasks…",
      todos_update: "Updating tasks…",
      list_permitted_roots: "Listing directories…",
      get_agent_result: "Checking agent…",
    };
    return labels[name] ?? `Running ${name}…`;
  }

  const out = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  if (name === "get_time_details" && out) {
    const t = out.localTime ?? out.time ?? out.iso ?? out.formatted;
    if (typeof t === "string") return `Time · ${t}`;
  }
  if (name === "remember") return "Saved to memory";
  if (name === "get_recent_memories" || name === "search_memories") {
    const count = Array.isArray(out?.memories)
      ? out.memories.length
      : Array.isArray(out?.results)
        ? out.results.length
        : typeof out?.count === "number"
          ? out.count
          : null;
    if (count !== null) return `Memory · ${count} result${count === 1 ? "" : "s"}`;
    return "Checked memory";
  }
  if (name === "query_recent_changes") {
    const count = Array.isArray(out?.changes)
      ? out.changes.length
      : typeof out?.count === "number"
        ? out.count
        : null;
    if (count !== null) return `Changes · ${count} result${count === 1 ? "" : "s"}`;
    return "Checked changes";
  }
  if (name === "get_profile") return "Checked profile";
  if (name === "update_profile") return "Updated profile";
  if (name === "todos_init" || name === "todos_update" || name === "todos_view") {
    const itemsCount = Array.isArray(out?.items) ? out.items.length : null;
    const updatedCount = Array.isArray(out?.updated)
      ? out.updated.length
      : null;
    if (out?.action === "initialized") {
      return itemsCount !== null
        ? `Created todo list · ${itemsCount} item${itemsCount === 1 ? "" : "s"}`
        : "Created todo list";
    }
    if (out?.action === "updated") {
      return updatedCount !== null
        ? `Updated ${updatedCount} todo${updatedCount === 1 ? "" : "s"}`
        : "Updated todos";
    }
    if (out?.action === "viewed") {
      if (typeof out?.progress === "string" && out.progress) {
        return `Todo list · ${out.progress}`;
      }
      return itemsCount !== null
        ? `Viewed todo list · ${itemsCount} item${itemsCount === 1 ? "" : "s"}`
        : "Viewed todo list";
    }
    return `Todo list${itemsCount !== null ? ` · ${itemsCount} items` : ""}`;
  }
  if (name === "get_device_details") return "Checked device";
  if (name === "list_permitted_roots") {
    const n = Array.isArray(out?.roots) ? out.roots.length : null;
    return n !== null ? `Directories · ${n}` : "Listed directories";
  }
  return name.replace(/_/g, " ");
}

function operationSummary(name: string, running: boolean): string {
  if (running) return `Working on ${name.replace(/_/g, " ")}`;
  const labels: Record<string, string> = {
    js_exec: "Ran JavaScript",
    python_exec: "Ran Python",
    bash_execute: "Ran Bash command",
    read_file: "Read file",
    read_media: "Read media",
    search_files: "Searched files",
    glob_files: "Found files",
    list_directory: "Listed directory",
    web_fetch: "Fetched page",
    web_search: "Searched web",
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

export function ToolCallCard({
  part,
  compact = true,
}: {
  part: any;
  compact?: boolean;
}) {
  if (!part || typeof part !== "object") return null;
  if (!isToolUIPart(part)) return null;

  const toolPart = part as AnyToolPart;
  let toolName: string;
  try {
    toolName = getToolName(toolPart);
  } catch {
    toolName = "tool";
  }

  const displayTitle = isDynamicToolUIPart(toolPart)
    ? (toolPart.title ?? toolName)
    : toolName;

  const state = getState(toolPart);
  const input = getInput(toolPart);
  const output = getOutput(toolPart);
  const errorText = formatToolError(getError(toolPart));
  const approved = getApproved(toolPart);

  const [inputOpen, setInputOpen] = useState(false);
  // Collapsed by default — avoids oversized cards and nested scroll traps.
  const [outputOpen, setOutputOpen] = useState(false);
  const [minorOpen, setMinorOpen] = useState(false);

  const isCallResult = state === "call-result";
  const isStreamingInput =
    state === "input-streaming" || state === "input-available";
  const isComplete =
    state === "output-available" ||
    state === "output-denied" ||
    state === "approval-responded";
  const isError = state === "output-error";
  const isRunning = !isComplete && !isError;

  const mediaFilename =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).url ??
        (input as Record<string, unknown>).relativePath ??
        undefined
      : undefined;
  const shortMediaName = mediaFilename
    ? String(mediaFilename).split("/").pop()?.replace(/^[a-f0-9]{8}_/, "") ??
      String(mediaFilename)
    : undefined;

  const isMediaResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    "type" in (output as Record<string, unknown>) &&
    ((output as Record<string, unknown>).type === "image" ||
      (output as Record<string, unknown>).type === "video");

  const isExecResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    "stdout" in (output as Record<string, unknown>) &&
    typeof (output as Record<string, unknown>).stdout === "string";

  const isQuestionsResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).type === "questions";

  const isReadMedia = toolName.endsWith("read_media");

  const isVisualResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).type === "visual";

  const isAgentResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    ((output as Record<string, unknown>).type === "agent_result" ||
      (output as Record<string, unknown>).type === "agent_spawn" ||
      (output as Record<string, unknown>).type === "agent_status" ||
      (output as Record<string, unknown>).type === "agent_error");

  const displayName = displayTitle.includes("__")
    ? displayTitle.split("__").slice(1).join("__")
    : displayTitle;
  const serverName = displayTitle.includes("__")
    ? displayTitle.split("__")[0]
    : undefined;

  const toolBare = bareName(toolName);
  const isMinor = MINOR_TOOLS.has(toolBare);

  // Special rich outputs — always take precedence
  if (compact) {
    if (isQuestionsResult && output && isComplete) {
      return <QuestionsCard data={output} />;
    }
    if (isVisualResult && output && isComplete) {
      return <VisualCard data={output} />;
    }
    if (isAgentResult && output && isComplete && !isMinor) {
      return <AgentResultCard data={output as Record<string, unknown>} />;
    }

    // ── Minor tools: single line, expand on click ─────────────────────
    if (isMinor) {
      return (
        <div className="rounded-md">
          <button
            type="button"
            onClick={() => setMinorOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/35"
          >
            {isRunning ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            ) : isError ? (
              <XCircle className="h-3 w-3 shrink-0 text-status-danger" />
            ) : (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
              {minorSummary(toolBare, output, isRunning)}
            </span>
            {(output !== undefined || errorText) && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                  minorOpen && "rotate-180",
                )}
              />
            )}
          </button>
          {minorOpen && (
            <div className="mx-2 mb-1 rounded-md border border-border/40 bg-surface-2/50 px-2.5 py-2">
              {errorText ? (
                <p className="text-[11px] text-status-danger">{errorText}</p>
              ) : (
                <ResultBody
                  output={output}
                  isExecResult={isExecResult}
                  isAgentResult={isAgentResult}
                  isMediaResult={isMediaResult}
                />
              )}
            </div>
          )}
        </div>
      );
    }

    const isFileOperation = new Set([
      "write_file", "edit_file", "create_directory", "rename_item",
      "delete_directory", "session_file_write", "session_file_edit",
      "session_file_mkdir", "session_file_move", "session_file_delete",
    ]).has(toolBare);
    if (isFileOperation) {
      const inRecord = input && typeof input === "object" ? input as Record<string, unknown> : {};
      const outRecord = output && typeof output === "object" ? output as Record<string, unknown> : {};
      const path = String(outRecord.path ?? inRecord.relativePath ?? inRecord.path ?? inRecord.to ?? "file").split("/").pop();
      const created = outRecord.created === true || toolBare.includes("mkdir");
      const added = typeof outRecord.linesAdded === "number" ? outRecord.linesAdded : 0;
      const removed = typeof outRecord.linesRemoved === "number" ? outRecord.linesRemoved : 0;
      const verb = isRunning ? "Working on" : created ? "Created" : toolBare.includes("edit") ? "Edited" : toolBare.includes("delete") ? "Deleted" : "Updated";
      return (
        <div className="rounded-md">
          <button type="button" onClick={() => setOutputOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/35">
            {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <CheckCircle2 className="h-3 w-3 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">{verb} <span className="font-mono">{path}</span></span>
            {!isRunning && <span className="shrink-0 text-[11px] tabular-nums"><span className="text-status-success">+{added}</span> <span className="text-status-danger">-{removed}</span></span>}
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", outputOpen && "rotate-180")} />
          </button>
          {outputOpen && (
            <div className="mx-2 mb-1 rounded border border-border/35 bg-surface-2/40 p-2">
              {!isEmptyObject(input) && <JsonBlock data={input} />}
              {output !== undefined && <div className="mt-2"><ResultBody output={output} isExecResult={false} isAgentResult={false} isMediaResult={false} /></div>}
              {errorText && <p className="text-[11px] text-status-danger">{errorText}</p>}
            </div>
          )}
        </div>
      );
    }

    // ── Standard compact card ─────────────────────────────────────────
    return (
      <div className="rounded-md">
        <button
          type="button"
          onClick={() => setOutputOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/35 cursor-pointer"
        >
          <div
            className={cn(
              "flex h-3 w-3 shrink-0 items-center justify-center",
              isError && "text-status-danger",
              isComplete && "text-muted-foreground",
              isRunning && "text-muted-foreground",
            )}
          >
            {isError ? (
              <XCircle className="h-3 w-3" />
            ) : isComplete ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
          </div>

          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">
            {operationSummary(toolBare, isRunning)}
          </span>

          {serverName && (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
              {serverName}
            </span>
          )}

          {/* <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              outputOpen && "rotate-180",
            )}
          /> */}
        </button>

        {!isComplete && !isError && isReadMedia && (
          <div className="border-t border-border/35 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Image className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">Scanning image</p>
                {shortMediaName && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {shortMediaName}
                  </p>
                )}
              </div>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {outputOpen && (
          <div className="border-t border-border/35 mb-5">
            {!isEmptyObject(input) && (
              <DetailSection
                open={inputOpen}
                onToggle={() => setInputOpen(!inputOpen)}
                label="Input"
              >
                <JsonBlock data={input} />
              </DetailSection>
            )}

            {output !== undefined && !isError && (
              isMediaResult ? (
                <div className="px-2 py-2">
                  <MediaDisplay data={output as Record<string, unknown>} />
                </div>
              ) : (
                <div className="px-2.5 py-2">
                  <ResultBody
                    output={output}
                    isExecResult={isExecResult}
                    isAgentResult={isAgentResult}
                    isMediaResult={false}
                  />
                </div>
              )
            )}

            {errorText && (
              <div className="flex items-start gap-1.5 px-2.5 py-2">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-status-danger" />
                <span className="text-[11px] leading-relaxed text-status-danger">
                  {errorText}
                </span>
              </div>
            )}

            {state === "output-denied" && (
              <div className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-muted-foreground">
                <AlertCircle className="h-3 w-3 text-status-warning" />
                {approved === false ? "Denied" : "Approval required"}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- Full-width layout (standalone) ----
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border text-sm",
        isError
          ? "border-status-danger/30 bg-status-danger/5"
          : "border-border/50 bg-surface-2/30",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            isError && "bg-status-danger/10 text-status-danger",
            isComplete && "bg-status-success/10 text-status-success",
            isRunning && "bg-muted text-muted-foreground",
          )}
        >
          {isError ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : isStreamingInput ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Terminal className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate font-mono text-xs font-medium">
            {displayName}
          </span>
          {serverName && (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {serverName}
            </span>
          )}
        </div>

        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {isError
            ? "Error"
            : isComplete
              ? "Done"
              : isCallResult
                ? "Running"
                : "Streaming"}
        </span>
      </div>

      {!isEmptyObject(input) && (
        <DetailSection
          open={inputOpen}
          onToggle={() => setInputOpen(!inputOpen)}
          label="Input"
        >
          <JsonBlock data={input} />
        </DetailSection>
      )}

      {errorText && (
        <div className="flex items-start gap-2 border-t border-status-danger/20 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-danger" />
          <span className="text-xs text-status-danger">{errorText}</span>
        </div>
      )}

      {output !== undefined && !isError && (
        isMediaResult ? (
          <div className="border-t border-border/40">
            <MediaDisplay data={output as Record<string, unknown>} />
          </div>
        ) : (
          <DetailSection
            open={outputOpen}
            onToggle={() => setOutputOpen(!outputOpen)}
            label="Result"
          >
            <ResultBody
              output={output}
              isExecResult={isExecResult}
              isAgentResult={isAgentResult}
              isMediaResult={false}
            />
          </DetailSection>
        )
      )}

      {state === "output-denied" && (
        <div className="flex items-center gap-2 border-t border-status-warning/20 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-status-warning" />
          {approved === false
            ? "Tool call was denied"
            : "Tool call requires approval"}
        </div>
      )}
    </div>
  );
}

function ResultBody({
  output,
  isExecResult,
  isAgentResult,
  isMediaResult,
}: {
  output: unknown;
  isExecResult: boolean;
  isAgentResult: boolean;
  isMediaResult: boolean;
}) {
  if (isMediaResult && output) {
    return <MediaDisplay data={output as Record<string, unknown>} />;
  }
  if (isExecResult && output) {
    return <ExecOutput data={output as Record<string, unknown>} />;
  }
  if (isAgentResult && output) {
    return <AgentResultCard data={output as Record<string, unknown>} compact />;
  }
  return <JsonBlock data={output} />;
}

/* ---- Agent Result Card ---- */

function AgentResultCard({
  data,
  compact,
}: {
  data: Record<string, unknown>;
  compact?: boolean;
}) {
  void compact;
  const type = data.type as string;
  const agentType = data.agent_type as string;
  const agentLabel = (data.agent_label as string) ?? agentType;
  const status = data.status as string;

  if (type === "agent_spawn" && status === "background") {
    return (
      <div className="rounded-md border border-status-warning/25 bg-status-warning/5 p-2.5 text-xs">
        <div className="mb-1.5 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-status-warning" />
          <span className="font-medium text-foreground">{agentLabel} started</span>
        </div>
        <p className="text-muted-foreground">
          Task #{String(data.task_id)} is running in the background.{" "}
          {String(data.message)}
        </p>
      </div>
    );
  }

  if (type === "agent_result" && status === "completed") {
    const resultText = data.result as string;
    const usage = data.usage as Record<string, unknown> | undefined;
    const inTokens = Number(usage?.inputTokens ?? 0);
    const outTokens = Number(usage?.outputTokens ?? 0);
    const hasUsage = inTokens > 0 || outTokens > 0;

    return (
      <div className="overflow-hidden rounded-md border border-border/40">
        <div className="flex items-center gap-2 bg-status-success/10 px-2.5 py-2 text-status-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold">{agentLabel} result</span>
          {hasUsage && (
            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
              {inTokens} in / {outTokens} out
            </span>
          )}
        </div>
        {resultText && (
          <pre className="whitespace-pre-wrap p-2.5 text-xs leading-relaxed text-foreground/90 font-sans">
            {resultText}
          </pre>
        )}
      </div>
    );
  }

  if (type === "agent_status" && status === "completed") {
    const resultText = data.result as string;
    return (
      <div className="overflow-hidden rounded-md border border-border/40">
        <div className="flex items-center gap-2 bg-status-success/10 px-2.5 py-2 text-status-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold">{agentLabel} ready</span>
        </div>
        {resultText && (
          <pre className="whitespace-pre-wrap p-2.5 text-xs leading-relaxed text-foreground/90 font-sans">
            {resultText}
          </pre>
        )}
      </div>
    );
  }

  if (type === "agent_status" && status === "running") {
    return (
      <div className="rounded-md border border-border/50 bg-surface-2/50 p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="font-medium text-foreground">
            {agentLabel} is still working...
          </span>
        </div>
      </div>
    );
  }

  if (
    (type === "agent_error" || type === "agent_status") &&
    (status === "failed" || status === "error" || status === "not_found")
  ) {
    return (
      <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-2.5 text-xs">
        <div className="mb-1 flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 shrink-0 text-status-danger" />
          <span className="font-medium text-status-danger">
            {agentLabel} {status === "not_found" ? "not found" : "failed"}
          </span>
        </div>
        <p className="text-status-danger/80">
          {(data.error as string) ?? "Unknown error"}
        </p>
      </div>
    );
  }

  return null;
}

/* ---- Sub-components ---- */

function DetailSection({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/35">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/30"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
      </button>
      {open && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  const formatted = formatJson(data);
  const [collapsed, setCollapsed] = useState(
    formatted ? formatted.length > 320 : false,
  );

  if (!formatted) {
    return <span className="text-xs italic text-muted-foreground">empty</span>;
  }

  return (
    <div>
      <pre
        className={cn(
          "overflow-x-auto rounded-md bg-none p-2.5 text-[11px] leading-relaxed text-foreground/85",
          collapsed && "max-h-28 overflow-hidden",
        )}
      >
        <code>{formatted}</code>
      </pre>
      {formatted.length > 320 && (
        <button
          type="button"
          className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3 w-3" /> Show all
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" /> Collapse
            </>
          )}
        </button>
      )}
    </div>
  );
}

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

/**
 * Modern exec output — no fake terminal chrome, single expand (no nested scroll).
 */
function ExecOutput({ data }: { data: Record<string, unknown> }) {
  const stdout = (data.stdout as string) ?? "";
  const stderr = (data.stderr as string) ?? "";
  const exitCode = data.exitCode as number | null;
  const timedOut = (data.timedOut as boolean) ?? false;
  const duration = (data.duration as string) ?? "";
  const returnValue = data.returnValue;

  const hasStdout = stdout.length > 0;
  const hasStderr = stderr.length > 0;
  const hasReturn = returnValue !== undefined;
  const fullText = [stdout, stderr].filter(Boolean).join("\n");
  const [collapsed, setCollapsed] = useState(fullText.length > 600);

  if (!hasStdout && !hasStderr && !hasReturn) {
    return (
      <p className="text-xs italic text-muted-foreground">(no output)</p>
    );
  }

  const ok = !timedOut && exitCode === 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border/45">
      <div className="flex items-center gap-2 border-b border-border/35 px-2.5 py-1.5">
        <span
          className={cn(
            "text-[11px] font-medium",
            timedOut || (exitCode !== null && exitCode !== 0)
              ? "text-status-danger"
              : "text-status-success",
          )}
        >
          {timedOut ? "Timed out" : ok ? "Success" : `Exit ${exitCode}`}
        </span>
        {duration && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {duration}
          </span>
        )}
      </div>

      <div
        className={cn(
          "px-2.5 py-2 text-[12px] font-mono leading-relaxed",
          collapsed && "max-h-40 overflow-hidden",
        )}
      >
        {hasStdout && (
          <pre className="m-0 whitespace-pre-wrap text-foreground/90">{stdout}</pre>
        )}
        {hasStderr && (
          <pre className="m-0 whitespace-pre-wrap text-status-danger/90">{stderr}</pre>
        )}
        {hasReturn && (
          <div className={cn((hasStdout || hasStderr) && "mt-2 border-t border-border/30 pt-2")}>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Return
            </span>
            <pre className="mt-1 whitespace-pre-wrap text-foreground/80">
              {typeof returnValue === "object"
                ? JSON.stringify(returnValue, null, 2)
                : String(returnValue)}
            </pre>
          </div>
        )}
      </div>

      {fullText.length > 600 && (
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-1 border-t border-border/35 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          {collapsed ? (
            <>
              <ChevronRight className="h-3 w-3" /> Show all
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Collapse
            </>
          )}
        </button>
      )}
    </div>
  );
}
