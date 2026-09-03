"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pause,
  Bot,
  Search,
  Terminal,
  FileText,
  Sparkles,
  MessageSquare,
  Layers,
  Timer,
} from "lucide-react";
import CenteredLayout from "@/components/layout/CenteredLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { cn } from "@/lib/utils";
import { createElement, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────

type AgentTaskWithConversation = {
  id: number;
  conversationId: number;
  conversationTitle: string;
  parentTaskId: number | null;
  chainDepth: number;
  agentType: string;
  task: string;
  status: string;
  progress: string | null;
  result: string | null;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  completedAt: string | null;
  children?: AgentTaskWithConversation[];
};

type TasksResponse = {
  tasks: AgentTaskWithConversation[];
  tree: AgentTaskWithConversation[];
  count: number;
};

// ─── Icons per agent type ─────────────────────────────────────────────

const AGENT_ICONS: Record<string, typeof Bot> = {
  researcher: Search,
  coder: Terminal,
  analyst: FileText,
  summarizer: FileText,
  custom: Sparkles,
};

function getAgentIcon(type: string) {
  return AGENT_ICONS[type] ?? Bot;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return CheckCircle2;
    case "running": return Loader2;
    case "queued": return Pause;
    case "failed": return XCircle;
    default: return AlertCircle;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed": return "text-emerald-600 dark:text-emerald-400";
    case "running": return "text-blue-600 dark:text-blue-400";
    case "queued": return "text-amber-600 dark:text-amber-400";
    case "failed": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case "completed": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "running": return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "queued": return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "failed": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// ─── Tree Node Component ─────────────────────────────────────────────

function TaskTreeNode({
  task,
  depth = 0,
}: {
  task: AgentTaskWithConversation;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showResult, setShowResult] = useState(false);
  const hasChildren = task.children && task.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50",
          depth > 0 && "ml-6 border-l-2 border-border/30 pl-4",
        )}
      >
        {/* Expand/collapse for children */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "mt-0.5 shrink-0 transition-transform",
            !hasChildren && "invisible",
          )}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        {/* Status Icon */}
        <div className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          getStatusBg(task.status),
        )}>
          {createElement(getStatusIcon(task.status), {
            className: cn(
              "h-3.5 w-3.5",
              task.status === "running" && "animate-spin",
            ),
          })}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Header row */}
          <div className="flex items-center gap-2">
            {createElement(getAgentIcon(task.agentType), {
              className: "h-3.5 w-3.5 text-muted-foreground shrink-0",
            })}
            <span className="truncate text-xs font-semibold capitalize">
              {task.agentType}
            </span>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", getStatusColor(task.status))}
            >
              {task.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
              <Timer className="inline h-3 w-3 mr-0.5" />
              {formatDate(task.createdAt)}
            </span>
          </div>

          {/* Task description */}
          <p className="text-xs text-foreground/80 leading-relaxed line-clamp-2">
            {task.task}
          </p>

          {/* Progress (for running tasks) */}
          {task.status === "running" && task.progress && (
            <div className="mt-1 rounded bg-blue-500/5 border border-blue-500/10 px-2 py-1">
              <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-relaxed line-clamp-3 font-mono">
                {task.progress}
              </p>
            </div>
          )}

          {/* Error (for failed tasks) */}
          {task.status === "failed" && task.error && (
            <div className="mt-1 rounded bg-destructive/5 border border-destructive/20 px-2 py-1">
              <p className="text-[10px] text-destructive leading-relaxed line-clamp-2">
                {task.error}
              </p>
            </div>
          )}

          {/* Result (toggleable) */}
          {task.status === "completed" && task.result && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowResult(!showResult)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showResult ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {showResult ? "Hide result" : "Show result"}
              </button>
              {showResult && (
                <pre className="mt-1 rounded bg-emerald-500/5 border border-emerald-500/10 p-2 text-[10px] font-mono leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {task.result}
                </pre>
              )}
            </div>
          )}

          {/* Meta footer */}
          <div className="flex items-center gap-3 mt-0.5">
            <Link
              href={`/chat/${task.conversationId}`}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageSquare className="h-3 w-3" />
              <span className="truncate max-w-32">{task.conversationTitle}</span>
            </Link>
            {task.chainDepth > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Layers className="h-3 w-3" />
                Depth {task.chainDepth}
              </span>
            )}
            {(task.inputTokens > 0 || task.outputTokens > 0) && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatTokens(task.inputTokens)} in / {formatTokens(task.outputTokens)} out
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {task.children!.map((child) => (
            <TaskTreeNode key={child.id} task={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary Stats Card ──────────────────────────────────────────────

function StatsCards({ tasks }: { tasks: AgentTaskWithConversation[] }) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const queued = tasks.filter((t) => t.status === "queued").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const statCards = [
    { label: "Total", value: total, color: "text-foreground" },
    { label: "Completed", value: completed, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Running", value: running, color: "text-blue-600 dark:text-blue-400" },
    { label: "Queued", value: queued, color: "text-amber-600 dark:text-amber-400" },
    { label: "Failed", value: failed, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex flex-col items-center justify-center py-4">
            <span className={cn("text-2xl font-bold", stat.color)}>{stat.value}</span>
            <span className="text-xs text-muted-foreground mt-0.5">{stat.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Status Summary Bar ─────────────────────────────────────────────

function StatusSummaryBar({ tasks }: { tasks: AgentTaskWithConversation[] }) {
  const total = tasks.length || 1;
  const counts = {
    completed: tasks.filter((t) => t.status === "completed").length,
    running: tasks.filter((t) => t.status === "running").length,
    queued: tasks.filter((t) => t.status === "queued").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  };

  const segments = [
    { label: "Completed", count: counts.completed, color: "bg-emerald-500" },
    { label: "Running", count: counts.running, color: "bg-blue-500" },
    { label: "Queued", count: counts.queued, color: "bg-amber-500" },
    { label: "Failed", count: counts.failed, color: "bg-destructive" },
  ];

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((seg) =>
        seg.count > 0 ? (
          <div
            key={seg.label}
            className={seg.color}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${seg.label}: ${seg.count}`}
          />
        ) : null,
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

async function fetchTasks(): Promise<TasksResponse> {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error("Failed to fetch agent tasks");
  return res.json();
}

export default function AgentTasksPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-tasks"],
    queryFn: fetchTasks,
    refetchInterval: 5_000, // Poll every 5s for live updates
  });

  return (
    <CenteredLayout>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Agent Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View all spawned agent tasks.
          </p>
        </div>

        {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-8 w-full rounded-full" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )}

        {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">
              Error loading agent tasks: {error.message}
            </p>
          </CardContent>
        </Card>
      )}

        {data && (
        <>
          {/* Stats */}
          <StatsCards tasks={data.tasks} />
          <StatusSummaryBar tasks={data.tasks} />

          {/* Content based on whether there are tasks */}
          {data.count === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No agent tasks yet. Spawn an agent using the{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                    spawn_agent
                  </code>{" "}
                  tool to see it here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3">
                <CardTitle className="text-sm font-medium">
                  Agent Tree
                </CardTitle>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {data.tasks.length} total / {data.tree.length} root
                </span>
              </CardHeader>
              <div className="overflow-y-auto max-h-[65vh] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
                <div className="p-1 space-y-0.5">
                  {data.tree.map((task) => (
                    <TaskTreeNode key={task.id} task={task} depth={0} />
                  ))}
                </div>
              </div>
            </Card>
          )}
        </>
        )}
      </div>
    </CenteredLayout>
  );
}
