"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  AlertCircle,
  Trash2,
  Ban,
  MessageSquare,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { scheduledTasksApi, type ScheduledTask } from "@/lib/api/scheduled-tasks";
import Link from "next/link";

// ─── Helpers ─────────────────────────────────────────────────────────────

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return { label: "Pending", variant: "outline" as const, icon: Timer };
    case "processing":
      return { label: "Processing", variant: "secondary" as const, icon: Loader2 };
    case "completed":
      return { label: "Completed", variant: "default" as const, icon: CheckCircle2 };
    case "failed":
      return { label: "Failed", variant: "destructive" as const, icon: XCircle };
    case "cancelled":
      return { label: "Cancelled", variant: "outline" as const, icon: Ban };
    default:
      return { label: status, variant: "outline" as const, icon: AlertCircle };
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const isPast = diffMs < 0;

  // For recent dates, show relative
  const absDiff = Math.abs(diffMs);
  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return isPast ? "Just now" : "Now";
  if (minutes < 60) return isPast ? `${minutes}m ago` : `in ${minutes}m`;
  if (hours < 24) return isPast ? `${hours}h ago` : `in ${hours}h`;
  if (days < 7) return isPast ? `${days}d ago` : `in ${days}d`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTriggerDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Task Card ───────────────────────────────────────────────────────────

function TaskCard({ task }: { task: ScheduledTask }) {
  const queryClient = useQueryClient();
  const badge = getStatusBadge(task.status);
  const StatusIcon = badge.icon;

  const cancelMutation = useMutation({
    mutationFn: () => scheduledTasksApi.cancel(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-tasks"] });
      toast.success("Task cancelled");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isPast = new Date(task.triggerAt) < new Date();
  const isPending = task.status === "pending";

  return (
    <Card className={cn(
      "p-4 transition-all",
      task.status === "completed" && "border-emerald-500/20 bg-emerald-500/[0.01]",
      task.status === "failed" && "border-destructive/20 bg-destructive/[0.01]",
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="flex items-center gap-2">
            {task.schedule ? (
              <RefreshCw className="h-4 w-4 text-sky-500 shrink-0" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatTriggerDate(task.triggerAt)}
            </span>
            {task.schedule && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5"
              >
                <RefreshCw className="h-2.5 w-2.5 mr-0.5" />
                Recurring
              </Badge>
            )}
            <Badge
              variant={badge.variant}
              className={cn(
                "text-[10px] px-1.5 py-0",
                task.status === "completed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
                task.status === "failed" && "bg-destructive/10",
              )}
            >
              <StatusIcon className={cn(
                "h-3 w-3 mr-0.5",
                task.status === "processing" && "animate-spin",
              )} />
              {badge.label}
            </Badge>
          </div>

          {/* Task description */}
          <p className="mt-2 text-sm font-medium leading-relaxed">
            {task.task}
          </p>

          {/* Result (for completed tasks) */}
          {task.status === "completed" && task.result && (
            <div className="mt-2 rounded bg-emerald-500/5 border border-emerald-500/10 p-2">
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap font-mono leading-relaxed">
                {task.result.length > 300
                  ? `${task.result.slice(0, 300)}...`
                  : task.result}
              </p>
            </div>
          )}

          {/* Error (for failed tasks) */}
          {task.status === "failed" && task.error && (
            <div className="mt-2 rounded bg-destructive/5 border border-destructive/20 p-2">
              <p className="text-xs text-destructive">{task.error}</p>
            </div>
          )}

          {/* Time context */}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {isPending && !isPast
                ? `Due ${formatDate(task.triggerAt)}`
                : isPending && isPast
                  ? "Overdue"
                  : task.completedAt
                    ? `Completed ${formatDate(task.completedAt)}`
                    : ""}
            </span>
            {task.schedule && task.lastRunAt && (
              <span className="tabular-nums">
                Last run: {formatDate(task.lastRunAt)}
              </span>
            )}
            {task.schedule && (
              <span className="tabular-nums">
                Next: {formatDate(task.triggerAt)}
              </span>
            )}
          </div>

          {/* Link to conversation */}
          {task.conversationTitle && (
            <Link
              href={`/chat/${task.conversationId}`}
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageSquare className="h-3 w-3" />
              <span className="truncate max-w-40">{task.conversationTitle}</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {task.status === "pending" && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-muted-foreground hover:text-destructive"
              title="Cancel task"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function ScheduledTaskList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scheduled-tasks"],
    queryFn: () => scheduledTasksApi.list({ limit: 100 }),
    refetchInterval: 30_000, // Poll for updates every 30s
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center">
        <XCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
        <p className="text-sm text-destructive">Failed to load scheduled tasks</p>
      </Card>
    );
  }

  const tasks = data?.tasks ?? [];
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;

  // Group tasks by status
  const pendingTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "processing",
  );
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const otherTasks = tasks.filter(
    (t) => t.status === "failed" || t.status === "cancelled",
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm tabular-nums">
            <strong>{pendingCount}</strong> pending
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm tabular-nums">
            <strong>{completedCount}</strong> completed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm tabular-nums">
            <strong>{failedCount}</strong> failed
          </span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-medium">No Scheduled Tasks</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Scheduled tasks let you ask the AI to do something at a future time.
            Just tell the AI to remind you or check something later — it will
            execute the task and send you a notification.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Try asking the AI:{" "}
            <em className="text-foreground">
              &ldquo;Check at midnight if the FIFA World Cup results are out and
              tell me&rdquo;
            </em>
          </p>
        </Card>
      ) : (
        <>
          {/* Pending tasks */}
          {pendingTasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                Upcoming ({pendingTasks.length})
              </h3>
              {pendingTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}

          {/* Completed tasks */}
          {completedTasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                Completed ({completedTasks.length})
              </h3>
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Failed/Cancelled */}
          {otherTasks.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors">
                Other ({otherTasks.length})
              </summary>
              <div className="mt-3 space-y-2">
                {otherTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
