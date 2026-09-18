"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
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

export function TodoProgressBar({
  conversationId,
  mode = "chat",
}: {
  conversationId: number;
  mode?: "chat" | "instant" | "goal" | "plan" | "build";
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ["todo-progress", conversationId],
    queryFn: () => fetchTodos(conversationId),
    refetchInterval: 3_000, // Poll every 3s for live updates
  });
  const isFinished = Boolean(data && data.total > 0 && data.completed === data.total);

  // Keep a finished bar visible briefly so the user sees the completed state,
  // then let AnimatePresence remove it instead of unmounting abruptly.
  useEffect(() => {
    if (!isFinished) return;
    const timer = window.setTimeout(() => setDismissed(true), 1_400);
    return () => window.clearTimeout(timer);
  }, [isFinished]);

  // Don't show anything if dismissed or no items.
  if (dismissed || !data || data.total === 0) {
    return null;
  }

  const { items, total, completed, inProgress, failed, skipped } = data;
  const completedWidth = `${Math.min(100, (completed / total) * 100)}%`;
  const inProgressWidth = `${Math.min(100 - (completed / total) * 100, (inProgress / total) * 100)}%`;
  const failedWidth = `${Math.min(100 - (completed + inProgress) / total * 100, (failed / total) * 100)}%`;
  const skippedWidth = `${Math.min(100 - (completed + inProgress + failed) / total * 100, (skipped / total) * 100)}%`;

  return (
    <AnimatePresence initial={false}>
      {mode !== "goal" && (
        <motion.div
          key="todo-progress"
          initial={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 8, marginBottom: 4 }}
          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="mx-4 overflow-hidden"
        >
          <div className="rounded-lg border border-border/40 bg-muted/30 backdrop-blur shadow-sm">
        {/* Compact bar */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />

          {/* Thin progress bar */}
          <div className="relative h-1.5 max-w-48 flex-1 overflow-hidden rounded-full bg-muted">
            {completed > 0 && (
              <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: completedWidth }} />
            )}
            {inProgress > 0 && (
              <div
                className="absolute inset-y-0 rounded-full bg-blue-500 transition-[left,width] duration-500"
                style={{ left: completedWidth, width: inProgressWidth }}
              >
                <span className="absolute inset-0 animate-pulse rounded-full bg-white/25" />
              </div>
            )}
            {failed > 0 && (
              <div
                className="absolute inset-y-0 rounded-full bg-destructive transition-[left,width] duration-500"
                style={{ left: `calc(${completedWidth} + ${inProgressWidth})`, width: failedWidth }}
              />
            )}
            {skipped > 0 && (
              <div
                className="absolute inset-y-0 rounded-full bg-amber-500 transition-[left,width] duration-500"
                style={{ left: `calc(${completedWidth} + ${inProgressWidth} + ${failedWidth})`, width: skippedWidth }}
              />
            )}
          </div>

          {/* Status text */}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
            <span className="font-semibold text-foreground">{completed}</span>
            <span className="text-muted-foreground/60">/{total}</span>
            {isFinished ? (
              <span className="ml-1 text-emerald-600 dark:text-emerald-400">· finished</span>
            ) : inProgress > 0 ? (
              <span className="ml-1 text-blue-600 dark:text-blue-400">· {inProgress} active</span>
            ) : null}
          </span>

          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted transition-colors"
            title={expanded ? "Hide details" : "Show details"}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
