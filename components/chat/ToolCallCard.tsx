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
} from "lucide-react";
import { MediaDisplay } from "./MediaDisplay";
import { QuestionsCard } from "./QuestionsCard";

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

        {/* Output section */}
        {output !== undefined && !isError && (
          <CompactSection
            open={outputOpen}
            onToggle={() => setOutputOpen(!outputOpen)}
            label="Result"
          >
            {isMediaResult ? (
              <MediaDisplay data={output as Record<string, unknown>} />
            ) : isExecResult ? (
              <TerminalOutput data={output as Record<string, unknown>} />
            ) : (
              <JsonBlock data={output} />
            )}
          </CompactSection>
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
      )}        {/* Output section */}
      {output !== undefined && !isError && (
        <CollapsibleSection
          open={outputOpen}
          onToggle={() => setOutputOpen(!outputOpen)}
          label="Result"
        >
          {isMediaResult ? (
            <MediaDisplay data={output as Record<string, unknown>} />
          ) : isExecResult ? (
            <TerminalOutput data={output as Record<string, unknown>} />
          ) : (
            <JsonBlock data={output} />
          )}
        </CollapsibleSection>
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
