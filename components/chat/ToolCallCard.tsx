"use client";

import { useState } from "react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName, isDynamicToolUIPart, isToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Hammer,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Image,
} from "lucide-react";
import { MediaDisplay } from "./MediaDisplay";
import { QuestionsCard } from "./QuestionsCard";
import { TodoBoard } from "./TodoBoard";
import { VisualCard } from "./VisualCard";

type AnyToolPart = ToolUIPart<any> | DynamicToolUIPart;

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

export function ToolCallCard({
  part,
  compact = true,
}: {
  part: any;
  compact?: boolean;
}) {
  // --- Defensive guard: any unexpected part shape silently
  // returns null instead of crashing the whole message bubble. ---
  if (!part || typeof part !== "object") return null;
  if (!isToolUIPart(part)) return null;

  // Safely extract fields — defensive against any potential runtime issues
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
  const errorText = getError(toolPart);
  const approved = getApproved(toolPart);

  const [inputOpen, setInputOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(
    state === "output-available" || state === "output-error",
  );

  const isCallResult = state === "call-result";
  const isStreamingInput =
    state === "input-streaming" || state === "input-available";
  const isComplete =
    state === "output-available" ||
    state === "output-denied" ||
    state === "approval-responded";
  const isError = state === "output-error";

  // Extract readable filename from the read_media input (shown in scanning indicator)
  const mediaFilename =
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
      ? (input as Record<string, unknown>).url ??
        (input as Record<string, unknown>).relativePath ??
        undefined
      : undefined;
  const shortMediaName = mediaFilename
    ? String(mediaFilename).split("/").pop()?.replace(/^[a-f0-9]{8}_/, "") ??
      String(mediaFilename)
    : undefined;

  // Detect if the output is a media result (from read_media tool)
  const isMediaResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    "type" in (output as Record<string, unknown>) &&
    ((output as Record<string, unknown>).type === "image" ||
      (output as Record<string, unknown>).type === "video");

  // Detect if the output is a code execution result (from python_exec / js_exec)
  const isExecResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    "stdout" in (output as Record<string, unknown>) &&
    typeof (output as Record<string, unknown>).stdout === "string";

  // Detect if the output is a questions result (from ask_questions)
  const isQuestionsResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).type === "questions";

  // Check if this is a read_media tool call (use endsWith for MCP namespace tolerance)
  const isReadMedia = toolName.endsWith("read_media");

  // Detect if the output is a todo list (from todos_init / todos_update / todos_view)
  const isTodoList =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).type === "todo_list";

  // Detect if the output is a visual result (from create_visual)
  const isVisualResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    (output as Record<string, unknown>).type === "visual";

  // Detect if the output is an agent spawn/result
  const isAgentResult =
    output !== undefined &&
    output !== null &&
    typeof output === "object" &&
    ((output as Record<string, unknown>).type === "agent_result" ||
      (output as Record<string, unknown>).type === "agent_spawn" ||
      (output as Record<string, unknown>).type === "agent_status" ||
      (output as Record<string, unknown>).type === "agent_error");

  // Split MCP namespaced name "server__tool" into server + display name
  const displayName = displayTitle.includes("__")
    ? displayTitle.split("__").slice(1).join("__")
    : displayTitle;
  const serverName = displayTitle.includes("__")
    ? displayTitle.split("__")[0]
    : undefined;

  const statusColor = isError
    ? "destructive"
    : isComplete
      ? "emerald"
      : "blue";

  if (compact) {
    // ---- Compact layout (inside ToolCallGroup) ----

    // For questions output, render the interactive QuestionsCard instead
    if (isQuestionsResult && output && isComplete) {
      return <QuestionsCard data={output} />;
    }

    // For todo list output, render the visual TodoBoard
    if (isTodoList && output && isComplete) {
      return <TodoBoard data={output} />;
    }

    // For visual results, render the VisualCard
    if (isVisualResult && output && isComplete) {
      return <VisualCard data={output} />;
    }

    // For agent results, render the AgentResultCard
    if (isAgentResult && output && isComplete) {
      return <AgentResultCard data={output as Record<string, unknown>} />;
    }

    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border text-sm transition-all duration-150",
          isError
            ? "border-destructive/20 bg-destructive/[0.04]"
            : isComplete
              ? "border-emerald-500/15 bg-emerald-500/[0.04]"
              : "border-blue-500/15 bg-blue-500/[0.04]",
        )}
      >
        {/* Compact header row */}
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          {/* Icon */}
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded",
              isError && "bg-destructive/10 text-destructive",
              isComplete && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              !isError && !isComplete && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            )}
          >
            {isError ? (
              <XCircle className="h-3 w-3" />
            ) : isComplete ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : isStreamingInput ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Hammer className="h-3 w-3" />
            )}
          </div>

          {/* Tool name */}
          <span className="truncate font-mono text-[11px] font-medium">
            {displayName}
          </span>

          {serverName && (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
              {serverName}
            </span>
          )}

          {/* Status badge */}
          <span
            className={cn(
              "ml-auto shrink-0 text-[9px] font-medium uppercase tracking-wider",
              isError && "text-destructive",
              isComplete && "text-emerald-600 dark:text-emerald-400",
              !isError && !isComplete && "text-blue-600 dark:text-blue-400",
            )}
          >
            {isError ? "Error" : isComplete ? "Done" : "Running"}
          </span>
        </div>

        {/* Input section */}
        {!isEmptyObject(input) && (
          <CompactSection
            open={inputOpen}
            onToggle={() => setInputOpen(!inputOpen)}
            label="Input"
          >
            <JsonBlock data={input} />
          </CompactSection>
        )}

        {/* Scanning indicator — shown while read_media is running but hasn't produced output yet */}
        {!isComplete && !isError && isReadMedia && (
          <div className="border-t border-blue-500/10 bg-blue-500/[0.03]">
            <div className="flex items-start gap-3 px-3 py-3">
              {/* Scanning animation */}
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
                <Image className="h-5 w-5 text-blue-500" />
                <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 shadow-sm shadow-blue-500/20">
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                </div>
              </div>
              {/* Text */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Scanning image
                </span>
                {shortMediaName && (
                  <span className="truncate text-xs text-blue-600/60 dark:text-blue-400/60">
                    {shortMediaName}
                  </span>
                )}
                {/* Animated scanning bar */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-blue-500/10">
                  <div className="h-full w-full origin-left animate-[scan-progress_2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Output section — media renders directly (no collapse/expand), text uses collapsible */}
        {output !== undefined && !isError && (
          isMediaResult ? (
            <div className="border-t border-border/30">
              <MediaDisplay data={output as Record<string, unknown>} />
            </div>
          ) : (
            <CompactSection
              open={outputOpen}
              onToggle={() => setOutputOpen(!outputOpen)}
              label="Result"
            >
              {isExecResult ? (
                <TerminalOutput data={output as Record<string, unknown>} />
              ) : isAgentResult ? (
                <AgentResultCard data={output as Record<string, unknown>} compact />
              ) : (
                <JsonBlock data={output} />
              )}
            </CompactSection>
          )
        )}

        {/* Error */}
        {errorText && (
          <div className="flex items-start gap-1.5 border-t border-destructive/15 px-2.5 py-1.5">
            <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-destructive" />
            <span className="text-[10px] leading-relaxed text-destructive">
              {errorText}
            </span>
          </div>
        )}

        {/* Approval denied */}
        {state === "output-denied" && (
          <div className="flex items-center gap-1.5 border-t border-amber-500/20 px-2.5 py-1.5 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3 text-amber-500" />
            {approved === false ? "Denied" : "Approval required"}
          </div>
        )}
      </div>
    );
  }

  // ---- Full-width layout (standalone, not inside a group) ----
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border text-sm transition-colors",
        isError
          ? "border-destructive/30 bg-destructive/5"
          : isComplete
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-blue-500/20 bg-blue-500/5",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            isError && "bg-destructive/10 text-destructive",
            isComplete && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            !isError && !isComplete && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
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

        <span
          className={cn(
            "shrink-0 text-[10px] font-medium uppercase tracking-wider",
            isError && "text-destructive",
            isComplete && "text-emerald-600 dark:text-emerald-400",
            !isError && !isComplete && "text-blue-600 dark:text-blue-400",
          )}
        >
          {isError
            ? "Error"
            : isComplete
              ? "Done"
              : isCallResult
                ? "Running"
                : "Streaming"}
        </span>
      </div>

      {/* Input section */}
      {!isEmptyObject(input) && (
        <CollapsibleSection
          open={inputOpen}
          onToggle={() => setInputOpen(!inputOpen)}
          label="Input"
        >
          <JsonBlock data={input} />
        </CollapsibleSection>
      )}

      {/* Error */}
      {errorText && (
        <div className="flex items-start gap-2 border-t border-destructive/20 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="text-xs text-destructive">{errorText}</span>
        </div>
      )}

      {/* Output section — media renders directly (no collapse/expand), text uses collapsible */}
      {output !== undefined && !isError && (
        isMediaResult ? (
          <div className="border-t border-border/50">
            <MediaDisplay data={output as Record<string, unknown>} />
          </div>
        ) : (
          <CollapsibleSection
            open={outputOpen}
            onToggle={() => setOutputOpen(!outputOpen)}
            label="Result"
          >
            {isExecResult ? (
              <TerminalOutput data={output as Record<string, unknown>} />
            ) : (
              <JsonBlock data={output} />
            )}
          </CollapsibleSection>
        )
      )}

      {/* Approval denied */}
      {state === "output-denied" && (
        <div className="flex items-center gap-2 border-t border-amber-500/20 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          {approved === false
            ? "Tool call was denied"
            : "Tool call requires approval"}
        </div>
      )}
    </div>
  );
}

/* ---- Agent Result Card ---- */

function AgentResultCard({
  data,
  compact,
}: {
  data: Record<string, unknown>;
  compact?: boolean;
}) {
  const type = data.type as string;
  const agentType = data.agent_type as string;
  const agentLabel = (data.agent_label as string) ?? agentType;
  const status = data.status as string;

  if (type === "agent_spawn" && status === "background") {
    return (
      <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2.5 text-xs">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
          </div>
          <span className="font-medium text-amber-700 dark:text-amber-300">
            {agentLabel} started
          </span>
        </div>
        <p className="text-muted-foreground">
          Task #{String(data.task_id)} is running in the background.{" "}
          {String(data.message)}
        </p>
      </div>
    );
  }

  if (
    type === "agent_result" &&
    status === "completed"
  ) {
    const resultText = data.result as string;
    const usage = data.usage as Record<string, unknown> | undefined;
    const inTokens = Number(usage?.inputTokens ?? 0);
    const outTokens = Number(usage?.outputTokens ?? 0);
    const hasUsage = inTokens > 0 || outTokens > 0;

    return (
      <div className="rounded-md overflow-hidden">
        {/* Agent header */}
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-2",
            "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold">{agentLabel} result</span>
          {hasUsage && (
            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
              {inTokens} in / {outTokens} out tokens
            </span>
          )}
        </div>
        {/* Result content */}
        {resultText && (
          <div className="max-h-80 overflow-y-auto border-t border-emerald-500/10 bg-background p-2.5 custom-scrollbar">
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 font-sans">
              {resultText}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (type === "agent_status" && status === "completed") {
    const resultText = data.result as string;
    const usage = data.usage as Record<string, unknown> | undefined;
    const inTokens = Number(usage?.inputTokens ?? 0);
    const outTokens = Number(usage?.outputTokens ?? 0);
    const hasUsage = inTokens > 0 || outTokens > 0;

    return (
      <div className="rounded-md overflow-hidden">
        <div className="flex items-center gap-2 bg-emerald-500/10 px-2.5 py-2 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold">{agentLabel} ready</span>
          {hasUsage && (
            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
              {inTokens} in / {outTokens} out
            </span>
          )}
        </div>
        {resultText && (
          <div className="max-h-80 overflow-y-auto border-t border-emerald-500/10 bg-background p-2.5 custom-scrollbar">
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 font-sans">
              {resultText}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (type === "agent_status" && status === "running") {
    return (
      <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-blue-700 dark:text-blue-300">
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
      <div className="rounded-md bg-destructive/5 border border-destructive/20 p-2.5 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="font-medium text-destructive">
            {agentLabel} {status === "not_found" ? "not found" : "failed"}
          </span>
        </div>
        <p className="text-destructive/80">
          {(data.error as string) ?? "Unknown error"}
        </p>
        {(data.hint as string) && (
          <p className="mt-1 text-muted-foreground italic">{String(data.hint)}</p>
        )}
      </div>
    );
  }

  return null;
}

/* ---- Sub-components ---- */

/**
 * Animated collapsible section — uses the grid-template-rows trick for
 * smooth open/close, with margin from card sides and scrollable content.
 */
function CollapsibleSection({
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
    <div className="border-t border-border/50">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 transition-transform duration-200" />
        ) : (
          <ChevronRight className="h-3 w-3 transition-transform duration-200" />
        )}
        {label}
      </button>
      {/* Animated body — grid rows + scrollable content */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-2 mb-2 max-h-60 overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact animated collapsible (inside ToolCallGroup) with margin and
 * sliding animation instead of instant pop.
 */
function CompactSection({
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
    <div className="border-t border-border/30">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left text-[9px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="h-2.5 w-2.5 transition-transform duration-200" />
        ) : (
          <ChevronRight className="h-2.5 w-2.5 transition-transform duration-200" />
        )}
        {label}
      </button>
      {/* Animated body */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-1.5 mb-1.5 max-h-48 overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function JsonBlock({ data }: { data: unknown }) {
  const formatted = formatJson(data);
  const [collapsed, setCollapsed] = useState(formatted ? formatted.length > 200 : false);

  if (!formatted)
    return (
      <span className="text-xs italic text-muted-foreground">empty</span>
    );

  return (
    <div className="relative">
      <pre
        className={cn(
          "custom-scrollbar overflow-x-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed",
          collapsed && "max-h-24 overflow-y-hidden",
        )}
      >
        <code>{formatted}</code>
      </pre>
      {formatted.length > 200 && (
        <button
          type="button"
          className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
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
 * Terminal-like output for code execution results (python_exec / js_exec).
 * Shows stdout in green, stderr in red, with an exit code badge.
 */
function TerminalOutput({ data }: { data: Record<string, unknown> }) {
  const stdout = (data.stdout as string) ?? "";
  const stderr = (data.stderr as string) ?? "";
  const exitCode = data.exitCode as number | null;
  const timedOut = (data.timedOut as boolean) ?? false;
  const duration = (data.duration as string) ?? "";
  const returnValue = data.returnValue;

  const hasStdout = stdout.length > 0;
  const hasStderr = stderr.length > 0;
  const hasReturn = returnValue !== undefined;

  if (!hasStdout && !hasStderr && !hasReturn) {
    return (
      <div className="rounded-md bg-[#1e1e2e] p-3 text-xs font-mono leading-relaxed">
        <span className="text-muted-foreground italic">(no output)</span>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-[#1e1e2e] overflow-hidden">
      {/* Terminal header bar */}
      <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-1.5">
        <div className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        </div>
        <span className="ml-2 text-[10px] text-white/40 font-mono">
          {timedOut ? "⏱ Timed out" : exitCode === 0 ? "✓ Success" : `✗ Exit ${exitCode}`}
        </span>
        {duration && (
          <span className="ml-auto text-[10px] text-white/30 font-mono">
            {duration}
          </span>
        )}
      </div>

      {/* Terminal body */}
      <div className="max-h-60 overflow-y-auto p-3 text-xs font-mono leading-relaxed custom-scrollbar">
        {hasStdout && (
          <pre className="text-green-400/90 whitespace-pre-wrap m-0">{stdout}</pre>
        )}
        {hasStderr && (
          <pre className="text-red-400/90 whitespace-pre-wrap m-0">{stderr}</pre>
        )}
        {hasReturn && (
          <div className="mt-2 border-t border-white/5 pt-2">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">Return value</span>
            <pre className="text-blue-400/90 whitespace-pre-wrap mt-1">
              {typeof returnValue === "object"
                ? JSON.stringify(returnValue, null, 2)
                : String(returnValue)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
