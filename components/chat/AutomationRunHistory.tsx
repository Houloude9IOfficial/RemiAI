"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Octagon, Play, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AutomationRun = {
  id: number;
  conversationId: number;
  kind: string;
  name: string;
  task: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  checkpoint: Record<string, unknown> | null;
  result: string | null;
  error: string | null;
  control: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const ACTIVE_STATUSES = new Set(["queued", "planning", "executing", "verifying", "repairing", "waiting"]);

function statusClass(status: string): string {
  if (status === "completed") return "text-emerald-600 dark:text-emerald-400";
  if (status === "failed") return "text-destructive";
  if (status === "cancelled") return "text-muted-foreground";
  return "text-blue-600 dark:text-blue-400";
}

async function controlRun(id: number, action: "stop" | "retry" | "steer", instruction?: string) {
  const response = await fetch(`/api/runs/${id}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, instruction }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Run control failed");
  return data;
}

export function AutomationRunHistory({ conversationId }: { conversationId: number }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["automation-runs", conversationId],
    queryFn: async () => {
      const response = await fetch(`/api/runs?conversationId=${conversationId}&limit=30`);
      if (!response.ok) throw new Error("Failed to load automation runs");
      return response.json() as Promise<{ runs: AutomationRun[]; count: number }>;
    },
    refetchInterval: 5_000,
  });

  const runs = data?.runs ?? [];
  const active = runs.filter((run) => ACTIVE_STATUSES.has(run.status));
  const latest = runs[0];
  const controlMutation = useMutation({
    mutationFn: ({ id, action, instruction }: { id: number; action: "stop" | "retry" | "steer"; instruction?: string }) =>
      controlRun(id, action, instruction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-runs", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", conversationId] });
    },
  });
  const stopAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/runs/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop_all", conversationId }),
      });
      if (!response.ok) throw new Error("Stop all failed");
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-runs", conversationId] }),
  });

  if (isLoading || runs.length === 0) return null;

  return (
    <section className="border-b border-border/50 bg-muted/10 px-4 py-2 md:px-6" aria-label="Automation run history">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="font-medium">Automation runs</span>
          <Badge variant="outline" className="text-[10px]">{runs.length}</Badge>
          {active.length > 0 && <span className="text-blue-600 dark:text-blue-400">{active.length} active</span>}
          {latest && <span className={cn("truncate text-muted-foreground", statusClass(latest.status))}>{latest.name} · {latest.status}</span>}
        </button>
        {active.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
            onClick={() => stopAllMutation.mutate()}
            disabled={stopAllMutation.isPending}
            title="Stop all active automation runs in this conversation"
          >
            <Octagon className="h-3 w-3" />
            Stop all
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pl-5">
          {runs.map((run) => {
            const isActive = ACTIVE_STATUSES.has(run.status);
            const canRetry = ["failed", "partially_completed", "cancelled"].includes(run.status);
            const checkpointPhase = run.checkpoint?.phase;
            return (
              <div key={run.id} className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  {run.status === "executing" || run.status === "repairing" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  ) : run.status === "failed" ? (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  ) : <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />}
                  <span className="text-[11px] font-medium">{run.name}</span>
                  <span className={cn("text-[10px] capitalize", statusClass(run.status))}>{run.status.replaceAll("_", " ")}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">attempt {run.attempt + 1}/{run.maxAttempts}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{run.task}</p>
                {typeof checkpointPhase === "string" && <p className="mt-1 text-[10px] text-muted-foreground">Checkpoint: {checkpointPhase}</p>}
                {run.error && <p className="mt-1 line-clamp-2 text-[10px] text-destructive">{run.error}</p>}
                {run.result && run.status === "completed" && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[10px] text-muted-foreground">{run.result}</p>}
                {(isActive || canRetry) && (
                  <div className="mt-1.5 flex items-center gap-1">
                    {isActive && (
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-destructive" onClick={() => controlMutation.mutate({ id: run.id, action: "stop" })}>
                        <Octagon className="h-3 w-3" /> Stop
                      </Button>
                    )}
                    {canRetry && (
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px]" onClick={() => controlMutation.mutate({ id: run.id, action: "retry" })}>
                        <Play className="h-3 w-3" /> Retry
                      </Button>
                    )}
                    {isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-[10px]"
                        onClick={() => {
                          const instruction = window.prompt("How should the active run change direction?");
                          if (instruction?.trim()) controlMutation.mutate({ id: run.id, action: "steer", instruction });
                        }}
                      >
                        <SlidersHorizontal className="h-3 w-3" /> Steer
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
