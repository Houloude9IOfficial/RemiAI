"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Circle, CircleAlert, CircleDashed, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodosResponse } from "@/app/api/todos/route";

export function useGoalTasks(conversationId: number) {
  return useQuery({
    queryKey: ["todo-progress", conversationId],
    queryFn: async ({ signal }): Promise<TodosResponse> => {
      const response = await fetch(`/api/todos?conversationId=${conversationId}`, { signal });
      if (!response.ok) throw new Error("Could not load goal tasks.");
      return response.json();
    },
    refetchInterval: 3_000,
  }).data;
}

const taskStates = {
  pending: { Icon: Circle, label: "Pending" },
  in_progress: { Icon: CircleDashed, label: "In progress" },
  completed: { Icon: Check, label: "Completed" },
  failed: { Icon: CircleAlert, label: "Failed" },
  skipped: { Icon: Minus, label: "Skipped" },
};

export function GoalChecklist({ data }: { data: TodosResponse }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
      <p className="text-xs tabular-nums text-muted-foreground">{data.completed} of {data.total} completed</p>
      <ul className="mt-3 space-y-3">
        {data.items.map(({ id, task, status, note }) => {
          const { Icon, label } = taskStates[status as keyof typeof taskStates] ?? taskStates.pending;
          return (
            <li key={id} className="flex min-w-0 items-start gap-2.5 text-sm">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-muted-foreground",
                  status === "in_progress" && "motion-safe:animate-[spin_4s_linear_infinite]",
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 break-words">
                <span className="sr-only">{label}. </span>
                <span className={status === "completed" || status === "skipped" ? "text-muted-foreground" : undefined}>{task}</span>
                {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
