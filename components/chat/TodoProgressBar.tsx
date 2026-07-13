"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

type TodoItem = {
  id: string;
  task: string;
  status: string;
  note: string | null;
};

type TodosResponse = {
  items: TodoItem[];
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  skipped: number;
  pending: number;
};

// ─── Fetch helper ─────────────────────────────────────────────────────

async function fetchTodos(conversationId: number): Promise<TodosResponse> {
  const res = await fetch(`/api/todos?conversationId=${conversationId}`);
  if (!res.ok) return { items: [], total: 0, completed: 0, inProgress: 0, failed: 0, skipped: 0, pending: 0 };
  return res.json();
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted-foreground/30",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
  skipped: "bg-amber-500",
};

// ─── Todo Progress Bar Component ─────────────────────────────────────

export function TodoProgressBar({ conversationId }: { conversationId: number }) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["todo-progress", conversationId],
    queryFn: () => fetchTodos(conversationId),
    refetchInterval: 3_000, // Poll every 3s for live updates
  });

  // Don't show anything if dismissed or no items or all completed
  if (dismissed || !data || data.total === 0 || data.completed === data.total) {
    return null;
  }

  const { items, total, completed, inProgress, failed, skipped } = data;

  return (
    <div className="mx-4 mt-2 mb-1 animate-slide-down">
      <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/30 backdrop-blur shadow-sm">
        {/* Compact bar */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />

          {/* Thin progress bar */}
          <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted max-w-48">
            {completed > 0 && (
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(completed / total) * 100}%` }} />
            )}
            {inProgress > 0 && (
              <div className="bg-blue-500 animate-pulse transition-all duration-500" style={{ width: `${(inProgress / total) * 100}%` }} />
            )}
            {failed > 0 && (
              <div className="bg-destructive transition-all duration-500" style={{ width: `${(failed / total) * 100}%` }} />
            )}
            {skipped > 0 && (
              <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(skipped / total) * 100}%` }} />
            )}
          </div>

          {/* Status text */}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
            <span className="font-semibold text-foreground">{completed}</span>
            <span className="text-muted-foreground/60">/{total}</span>
            {inProgress > 0 && (
              <span className="ml-1 text-blue-600 dark:text-blue-400">· {inProgress} active</span>
            )}
          </span>

          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted transition-colors"
            title={expanded ? "Hide details" : "Show details"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>

          {/* Dismiss */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Expanded item list */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-border/30 px-3 py-2 space-y-1">
              {items.map((item) => {
                const dotColor = STATUS_COLORS[item.status] ?? "bg-muted-foreground/30";
                return (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor)} />
                    <span className="flex-1 truncate text-foreground/80">{item.task}</span>
                    <span className="shrink-0 text-[10px] capitalize text-muted-foreground">{item.status.replace("_", " ")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
