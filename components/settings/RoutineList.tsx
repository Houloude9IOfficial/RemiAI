"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogTrigger,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Trash2,
  Plus,
  Pencil,
  History,
  Terminal,
  Loader2,
  Clock,
} from "lucide-react";
import { routinesApi, type Routine, type RoutineLog } from "@/lib/api/routines";

// ---------------------------------------------------------------------------
// Routine Logs Dialog
// ---------------------------------------------------------------------------

function RoutineLogsDialog({ routine }: { routine: Routine }) {
  const [open, setOpen] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["routine-logs", routine.id],
    queryFn: () => routinesApi.logs(routine.id),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="View run history"
      >
        <History className="h-3.5 w-3.5" />
        History
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Run History — {routine.name}</DialogTitle>
        <DialogDescription>
          Recent execution logs for this routine.
          {routine.schedule && (
            <span className="ml-1">
              Scheduled: <code className="text-xs">{routine.schedule}</code>
            </span>
          )}
        </DialogDescription>
        <div className="mt-2 max-h-96 overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No runs yet. Run the routine to see results here.
            </p>
          ) : (
            logs.map((log) => (
              <Card key={log.id} className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <Badge
                    variant={
                      log.status === "completed"
                        ? "default"
                        : log.status === "running"
                          ? "secondary"
                          : "destructive"
                    }
                    className="text-xs"
                  >
                    {log.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {log.startedAt
                      ? new Date(log.startedAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
                {log.output && (
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-xs font-mono">
                    {log.output}
                  </pre>
                )}
                {log.error && (
                  <p className="mt-1 text-xs text-destructive">{log.error}</p>
                )}
              </Card>
            ))
          )}
        </div>
        <div className="mt-2 flex justify-end">
          <DialogClose
            render={<Button variant="ghost" size="sm" />}
          >
            Close
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Routine Form Dialog (Create / Edit)
// ---------------------------------------------------------------------------

function RoutineFormDialog({
  routine,
  trigger,
}: {
  routine?: Routine;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!routine;

  const [name, setName] = useState(routine?.name ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [code, setCode] = useState(routine?.code ?? "");
  const [schedule, setSchedule] = useState(routine?.schedule ?? "");

  const createMutation = useMutation({
    mutationFn: () =>
      routinesApi.create({
        name: name.trim(),
        description: description.trim(),
        code,
        schedule: schedule.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      toast.success(`Routine "${name}" created`);
      setOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      routinesApi.update(routine!.id, {
        name: name.trim(),
        description: description.trim(),
        code,
        schedule: schedule.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      toast.success(`Routine "${name}" updated`);
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setCode("");
    setSchedule("");
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={false} render={<span>{trigger}</span>} />
      <DialogContent className="max-w-2xl">
        <DialogTitle>{isEdit ? "Edit Routine" : "Create Routine"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Modify the routine's code, schedule, or metadata."
            : "Create a reusable JavaScript routine that the AI can run anytime."}
        </DialogDescription>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="routine-name">Name</Label>
            <Input
              id="routine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="check_uptime"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Unique kebab-case identifier (e.g. check_uptime, deploy_staging)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="routine-desc">Description</Label>
            <Input
              id="routine-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Check if my service is up and running"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="routine-code">
              JavaScript Code
            </Label>
            <Textarea
              id="routine-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder='const res = await fetch("https://api.example.com/health");\nconst data = await res.json();\nconsole.log("Status:", data.status);'
              className="min-h-[200px] font-mono text-sm"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Use console.log() for output. Top-level await is supported.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="routine-schedule">
              Schedule (cron expression)
            </Label>
            <Input
              id="routine-schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="*/15 * * * *"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Examples:{" "}
              <code className="text-xs">*/15 * * * *</code> (every 15 min),{" "}
              <code className="text-xs">0 * * * *</code> (every hour),{" "}
              <code className="text-xs">0 9 * * 1-5</code> (weekdays at 9 AM)
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose
            render={<Button variant="ghost" size="sm" />}
          >
            Cancel
          </DialogClose>
          <Button
            size="sm"
            disabled={!name.trim() || !code.trim() || isPending}
            onClick={() => (isEdit ? updateMutation.mutate() : createMutation.mutate())}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Routine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Routine Card
// ---------------------------------------------------------------------------

function RoutineCard({
  routine,
  onRun,
  onToggle,
  onDelete,
  isRunning,
}: {
  routine: Routine;
  onRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isRunning: boolean;
}) {
  const lastRunStr = routine.lastRun
    ? new Date(routine.lastRun).toLocaleString()
    : "Never";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium text-sm truncate">{routine.name}</h3>
            {routine.schedule && (
              <Badge variant="outline" className="text-xs shrink-0">
                <Clock className="h-3 w-3 mr-1" />
                {routine.schedule}
              </Badge>
            )}
          </div>
          {routine.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {routine.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Last run: {lastRunStr}
            </span>
            {routine.lastStatus && (
              <Badge
                variant={
                  routine.lastStatus === "completed"
                    ? "default"
                    : routine.lastStatus === "running"
                      ? "secondary"
                      : "destructive"
                }
                className="text-[10px]"
              >
                {routine.lastStatus}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {routine.code.length} chars
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onRun}
            disabled={isRunning}
            title="Run now"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>

          <RoutineFormDialog
            routine={routine}
            trigger={
              <Button size="icon-sm" variant="ghost" title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            }
          />

          <RoutineLogsDialog routine={routine} />

          <div className="flex items-center gap-1 pl-1 border-l">
            <Switch
              checked={routine.enabled}
              onCheckedChange={onToggle}
              aria-label="Toggle routine"
            />
          </div>

          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Routine List Component
// ---------------------------------------------------------------------------

export function RoutineList() {
  const queryClient = useQueryClient();
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());

  const { data: routines = [], isLoading } = useQuery({
    queryKey: ["routines"],
    queryFn: routinesApi.list,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      routinesApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => routinesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      toast.success("Routine deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runMutation = useMutation({
    mutationFn: (id: number) => routinesApi.run(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["routines"] });
      queryClient.invalidateQueries({ queryKey: ["routine-logs"] });
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(result.logId);
        return next;
      });

      if (result.exitCode === 0) {
        toast.success(`Routine "${result.routineName}" completed`);
      } else {
        toast.error(
          `Routine "${result.routineName}" failed (exit code: ${result.exitCode})`,
        );
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleRun = (routine: Routine) => {
    setRunningIds((prev) => new Set(prev).add(routine.id));
    runMutation.mutate(routine.id);
  };

  const handleToggle = (routine: Routine) => {
    toggleMutation.mutate({ id: routine.id, enabled: !routine.enabled });
  };

  const handleDelete = (routine: Routine) => {
    if (confirm(`Delete routine "${routine.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(routine.id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {routines.length > 0
            ? `${routines.length} routine${routines.length === 1 ? "" : "s"} in library`
            : "No routines yet. The AI can create routines during chat, or you can create one manually."}
        </p>
        <RoutineFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Routine
            </Button>
          }
        />
      </div>

      {routines.length === 0 ? (
        <Card className="p-8 text-center">
          <Terminal className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="text-sm font-medium">No Routines Yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Routines are reusable JavaScript scripts that the AI can create and
            run anytime. You can also set up scheduled routines with cron
            expressions.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Try asking the AI:{" "}
            <em className="text-foreground">
              &ldquo;Create a routine to check my service uptime every 15
              minutes&rdquo;
            </em>
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onRun={() => handleRun(routine)}
              onToggle={() => handleToggle(routine)}
              onDelete={() => handleDelete(routine)}
              isRunning={runningIds.has(routine.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
