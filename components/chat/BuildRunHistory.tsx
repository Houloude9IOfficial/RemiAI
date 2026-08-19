"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  ExternalLink,
  FileDiff,
  Hammer,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dispatchSessionFilesPresent } from "@/lib/api/session-files";
import { dispatchChatInputPrefill } from "@/lib/chat-input-registry";
import { buildBuildContinuationPrompt } from "@/lib/chat/build-continuation";

type BuildRun = {
  id: number;
  task: string;
  status: "running" | "completed" | "failed" | "interrupted";
  summary: string;
  error?: string | null;
  definitionOfDone: string[];
  changedFiles: Array<{
    path: string;
    kind: "create" | "edit" | "delete" | "rename";
    linesAdded?: number;
    linesRemoved?: number;
    openable?: boolean;
    diffPreview?: string;
  }>;
  checks: Array<{
    command: string;
    status: "passed" | "failed" | "incomplete";
    detail: string;
    kind?: "command" | "preview";
  }>;
  createdAt: string;
  resultArtifactId?: number | null;
  checkpoint?: {
    step: number;
    phase: "executing" | "verifying" | "repairing";
    repairAttempt: number;
    updatedAt: string;
  } | null;
};

type BuildRunsResponse = { runs: BuildRun[] };

function statusLabel(status: BuildRun["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Needs attention";
  if (status === "interrupted") return "Interrupted";
  return "Running";
}

function statusIcon(status: BuildRun["status"]) {
  if (status === "completed") return CheckCircle2;
  if (status === "failed") return XCircle;
  return CircleDashed;
}

export function BuildRunHistory({ conversationId }: { conversationId: number }) {
  const { data, isError } = useQuery({
    queryKey: ["build-runs", conversationId],
    queryFn: async (): Promise<BuildRunsResponse> => {
      const response = await fetch(`/api/conversations/${conversationId}/build-runs`);
      if (!response.ok) throw new Error("Failed to load Build history");
      return response.json();
    },
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  const runs = data?.runs ?? [];
  const hasError = isError;
  const [expanded, setExpanded] = useState(false);
  const latestRun = runs[0];
  const canCollapse = !hasError && runs.length > 0;

  return (
    <div className="mx-4 mt-2 mb-1 animate-slide-down">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/30 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
          {hasError ? (
            <AlertTriangle className="h-4 w-4 text-status-warning" />
          ) : (
            <Hammer className="h-4 w-4 text-primary" />
          )}
          {canCollapse ? (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls={`build-history-${conversationId}`}
            >
              <span className="text-xs font-medium text-foreground">Build history</span>
              <span className="text-[10px] text-muted-foreground">
                {runs.length} recorded {runs.length === 1 ? "run" : "runs"}
              </span>
              {!expanded && latestRun && (
                <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                  · {latestRun.summary}
                </span>
              )}
              {expanded ? (
                <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="text-xs font-medium text-foreground">Build history</span>
          )}
        </div>
        {hasError ? (
          <p className="px-3 py-2 text-[11px] text-status-warning">
            Build history is unavailable. Restart RemiAI so pending database migrations can run.
          </p>
        ) : runs.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            No saved Build runs yet. Complete a Build-mode task to record its files and checks here.
          </p>
        ) : (
        <div
          id={`build-history-${conversationId}`}
          hidden={canCollapse && !expanded}
          className="divide-y divide-border/30"
        >
          {runs.slice(0, 5).map((run) => {
            const StatusIcon = statusIcon(run.status);
            return (
              <details key={run.id} className="group px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <StatusIcon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      run.status === "completed"
                        ? "text-status-success"
                        : run.status === "failed"
                          ? "text-status-danger"
                          : "text-muted-foreground",
                      run.status === "running" && "animate-spin",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground/85">
                    {run.summary}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {statusLabel(run.status)}
                  </span>
                </summary>
                <div className="mt-2 space-y-2 pl-5 text-[11px] text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 line-clamp-2 text-foreground/75">{run.task}</p>
                    {(run.status === "failed" || run.status === "interrupted" || run.status === "running") && (
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        onClick={() =>
                          dispatchChatInputPrefill(
                            buildBuildContinuationPrompt({
                              task: run.task,
                              status:
                                run.status === "interrupted"
                                  ? "interrupted"
                                  : run.status === "running"
                                    ? "running"
                                    : "failed",
                              error: run.error,
                              checkpointStep: run.checkpoint?.step,
                            }),
                          )
                        }
                        aria-label={run.status === "running" ? "Resume this Build run" : "Continue this Build run"}
                        title="Prefill a continuation request"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {run.status === "running" ? "Resume" : "Continue"}
                      </button>
                    )}
                  </div>
                  {run.resultArtifactId && (
                    <p className="text-[10px] text-primary">
                      Reusable Build result saved
                    </p>
                  )}
                  {run.checkpoint && (
                    <p className="text-[10px] text-muted-foreground">
                      Checkpoint saved at step {run.checkpoint.step} · {run.checkpoint.phase}
                      {run.checkpoint.phase === "repairing" &&
                        ` · attempt ${run.checkpoint.repairAttempt}/2`}
                    </p>
                  )}
                  {run.changedFiles.length > 0 && (
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-medium text-foreground/75">
                        <FileDiff className="h-3 w-3" />
                        Changed files
                      </div>
                      <ul className="space-y-0.5">
                        {run.changedFiles.slice(0, 8).map((file) => (
                          <li key={`${run.id}-${file.path}`} className="space-y-1">
                            <div className="flex gap-2">
                              <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                              <span className="shrink-0 tabular-nums">
                                {file.linesAdded ? `+${file.linesAdded}` : ""}
                                {file.linesRemoved ? ` −${file.linesRemoved}` : ""}
                              </span>
                              {file.openable && (
                                <button
                                  type="button"
                                  className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                  onClick={() => dispatchSessionFilesPresent({ focusPath: file.path })}
                                  aria-label={`Open ${file.path} in Session Files`}
                                  title="Open in Session Files"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Open
                                </button>
                              )}
                            </div>
                            {file.diffPreview && (
                              <details className="rounded border border-border/30 bg-background/50">
                                <summary className="cursor-pointer px-2 py-1 text-[10px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                                  Diff preview
                                </summary>
                                <pre className="max-h-48 overflow-auto border-t border-border/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground/75 whitespace-pre-wrap">
                                  {file.diffPreview}
                                </pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {run.checks.length > 0 && (
                    <div>
                      <div className="mb-1 font-medium text-foreground/75">Checks</div>
                      <ul className="space-y-0.5">
                        {run.checks.map((check, index) => (
                          <li key={`${run.id}-check-${index}`} className="flex gap-2">
                            <span
                              className={cn(
                                "shrink-0",
                                check.status === "passed"
                                  ? "text-status-success"
                                  : check.status === "failed"
                                    ? "text-status-danger"
                                    : "text-muted-foreground",
                              )}
                            >
                              {check.status === "passed" ? "✓" : check.status === "failed" ? "×" : "·"}
                            </span>
                            {check.kind === "preview" && (
                              <span className="shrink-0 rounded bg-primary/10 px-1 text-[9px] text-primary">
                                Preview
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate font-mono">{check.command}</span>
                            <span className="shrink-0">{check.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div className="mb-1 font-medium text-foreground/75">Definition of done</div>
                    <ul className="space-y-0.5">
                      {run.definitionOfDone.map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
