"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  SkipForward,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────

interface TodoItem {
  id: string;
  task: string;
  status: string;
  note: string | null;
}

interface TodoListData {
  type: "todo_list";
  action: "initialized" | "updated" | "viewed";
  items: TodoItem[];
  summary?: string;
  progress?: string;
  changes?: string;
  count?: number;
  message?: string;
}

// ─── Status helpers ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  pending: {
    icon: Clock,
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-muted",
    label: "Pending",
  },
  in_progress: {
    icon: Loader2,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/5 border-blue-500/20",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/5 border-emerald-500/20",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-destructive",
    bg: "bg-destructive/5 border-destructive/20",
    label: "Failed",
  },
  skipped: {
    icon: SkipForward,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/5 border-amber-500/20",
    label: "Skipped",
  },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
}

// ─── Todo Item Row ────────────────────────────────────────────────────

function TodoItemRow({ item, index }: { item: TodoItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = getStatusConfig(item.status);
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border p-3 transition-all duration-200",
        config.bg,
        item.status === "completed" && "opacity-80",
      )}
    >
      {/* Status icon */}
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        <StatusIcon
          className={cn(
            "h-5 w-5",
            config.color,
            item.status === "in_progress" && "animate-spin",
          )}
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-muted-foreground/60">
            #{index + 1}
          </span>
          <span className="text-sm font-medium leading-snug text-foreground">
            {item.task}
          </span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              config.color,
              config.bg,
            )}
          >
            {config.label}
          </span>
        </div>

        {/* Note (if present) */}
        {item.note && (
          <div className="mt-0.5">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <MessageSquare className="h-3 w-3" />
              Note
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="mt-1 text-xs text-muted-foreground/80 leading-relaxed italic">
                  {item.note}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────

function ProgressBar({ items }: { items: TodoItem[] }) {
  const total = items.length || 1;
  const completed = items.filter((i) => i.status === "completed").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const skipped = items.filter((i) => i.status === "skipped").length;
  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-2">
      {/* Segmented progress bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {completed > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        )}
        {inProgress > 0 && (
          <div
            className="bg-blue-500 animate-pulse transition-all duration-500"
            style={{ width: `${(inProgress / total) * 100}%` }}
          />
        )}
        {failed > 0 && (
          <div
            className="bg-destructive transition-all duration-500"
            style={{ width: `${(failed / total) * 100}%` }}
          />
        )}
        {skipped > 0 && (
          <div
            className="bg-amber-500 transition-all duration-500"
            style={{ width: `${(skipped / total) * 100}%` }}
          />
        )}
      </div>

      {/* Status counts */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {completed} done
        </span>
        {inProgress > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {inProgress} in progress
          </span>
        )}
        {failed > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            {failed} failed
          </span>
        )}
        {skipped > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {skipped} skipped
          </span>
        )}
        {pending > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            {pending} pending
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main TodoBoard Component ─────────────────────────────────────────

export function TodoBoard({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;

  const td = data as Record<string, unknown>;
  if (td.type !== "todo_list") return null;

  const todoData = td as unknown as TodoListData;
  const items = todoData.items;

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/10 p-6 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No todo items yet.</p>
      </div>
    );
  }

  const completed = items.filter((i) => i.status === "completed").length;
  const total = items.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border/30 bg-muted/20 px-4 py-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold">Todo List</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {completed}/{total}
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Progress bar */}
        <ProgressBar items={items} />

        {/* Items */}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <TodoItemRow key={item.id} item={item} index={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}
