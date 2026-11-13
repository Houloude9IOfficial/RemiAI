"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  FileDiff,
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

export function BuildRunHistory({ conversationId, open, onContinue }: {
  conversationId: number;
  open: boolean;
  onContinue: () => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["build-runs", conversationId],
    queryFn: async ({ signal }): Promise<BuildRunsResponse> => {
      const response = await fetch(`/api/conversations/${conversationId}/build-runs`, { signal });
      if (!response.ok) throw new Error("Failed to load Build history");
      return response.json();
    },
    enabled: open,
    refetchInterval: open ? 5_000 : false,
    staleTime: 2_000,
  });

  const runs = data?.runs ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">Loading Build history…</p>
      ) : isError && !data ? (
        <p role="status" className="text-sm text-status-warning">Build history is unavailable.</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Build runs yet.</p>
      ) : (
        <>
          <p className="text-xs tabular-nums text-muted-foreground">
            {runs.length} recorded {runs.length === 1 ? "run" : "runs"}
          </p>
          <div className="mt-2 divide-y divide-border">
            {runs.slice(0, 5).map((run) => {
              const StatusIcon = statusIcon(run.status);
              return (
                <details key={run.id} className="group/run py-2">
                  <summary className="flex min-h-8 cursor-pointer list-none items-start gap-2 rounded-sm py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <StatusIcon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        run.status === "completed"
                          ? "text-status-success"
                          : run.status === "failed"
                            ? "text-status-danger"
                            : "text-muted-foreground",
                        run.status === "running" && "motion-safe:animate-[spin_4s_linear_infinite]",
                      )}
                    />
                    <span className="min-w-0 flex-1 break-words">
                      {run.summary}
                      <span className="block text-xs text-muted-foreground">{statusLabel(run.status)}</span>
                    </span>
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open/run:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <div className="mt-2 space-y-2 pl-6 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="min-w-0 flex-1 break-words text-foreground/75">{run.task}</p>
                      {(run.status === "failed" || run.status === "interrupted" || run.status === "running") && (
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          onClick={() => {
                            onContinue();
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
                            );
                          }}
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
                                <span className="min-w-0 flex-1 break-all font-mono">{file.path}</span>
                                <span className="shrink-0 tabular-nums">
                                  {file.linesAdded ? `+${file.linesAdded}` : ""}
                                  {file.linesRemoved ? ` −${file.linesRemoved}` : ""}
                                </span>
                                {file.openable && (
                                  <button
                                    type="button"
                                    className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                    onClick={() => dispatchSessionFilesPresent({ focusPath: file.path, manualConversationId: conversationId })}
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
                              <span className="min-w-0 flex-1 break-all font-mono">{check.command}</span>
                              <span className="max-w-[45%] shrink-0 break-words">{check.detail}</span>
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
        </>
      )}
    </div>
  );
}
