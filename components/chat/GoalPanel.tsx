"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Check, Circle, CircleAlert, CircleDashed, Minus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

function GoalChecklist({ data }: { data: TodosResponse }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
      <p className="text-xs tabular-nums text-muted-foreground">{data.completed} of {data.total} completed</p>
      <ul className="mt-3 space-y-3">
        {data.items.map(({ id, task, status, note }) => {
          const { Icon, label } = taskStates[status as keyof typeof taskStates] ?? taskStates.pending;
          return (
            <li key={id} className="flex min-w-0 items-start gap-2.5 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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

function DockedGoal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return (
    <motion.aside
      aria-label="Goal"
      inert={!present}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 288, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
      className="hidden min-h-0 shrink-0 overflow-hidden border-l border-border bg-background lg:flex"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex min-h-0 w-72 shrink-0 flex-col">{children}</div>
    </motion.aside>
  );
}

export function GoalPanel({ open, desktop, data, onClose, returnFocus }: {
  open: boolean;
  desktop: boolean;
  data: TodosResponse | undefined;
  onClose: () => void;
  returnFocus: () => HTMLButtonElement | null;
}) {
  return (
    <>
      <AnimatePresence initial={false}>
        {open && desktop && data && data.total > 0 && (
          <DockedGoal onClose={onClose}>
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <h2 className="text-sm font-semibold">Goal</h2>
              <button type="button" aria-label="Close goal" onClick={onClose}
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <GoalChecklist data={data} />
          </DockedGoal>
        )}
      </AnimatePresence>
      {!desktop && (
        <Dialog open={open && Boolean(data?.total)} onOpenChange={(next) => { if (!next) onClose(); }}>
          <DialogContent
            finalFocus={returnFocus}
            className="inset-y-0 right-0 left-auto flex h-dvh w-[min(85vw,20rem)] max-w-none translate-none flex-col gap-0 rounded-none p-0 sm:max-w-none motion-reduce:animate-none! data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-right-4 data-closed:slide-out-to-right-4"
          >
            <DialogTitle className="flex h-12 shrink-0 items-center border-b border-border px-4 text-sm">Goal</DialogTitle>
            {data && <GoalChecklist data={data} />}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
