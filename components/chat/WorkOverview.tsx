"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ClipboardList, Eye, FileText, Folder, Loader2, Play, RotateCcw, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { Textarea } from "@/components/ui/textarea";
import { directoriesApi } from "@/lib/api/directories";

type Run = { id: number; goal: string; targetType: "canvas" | "directory"; targetPath: string; canvasName: string | null; successCriteria: string; phase: string; planPath: string | null; planRevision: number; overview: string; changedFiles: Array<{ path?: string; linesAdded?: number; linesRemoved?: number }>; checks: Array<{ name?: string; status?: string }> };
type Intake = { goal: string; targetType: "directory" | "canvas"; targetLabel: string; successCriteria: string; technicalBrief: string };
type PlanFile = { content: string; isTruncated?: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
  return data as T;
}

export function WorkOverview({ conversationId, onBeginPlanning, onBeginBuild, onClose }: { conversationId: number; onBeginPlanning?: (intake: Intake) => void; onBeginBuild?: (run: Run, source: "approval" | "repair") => void; onClose?: () => void }) {
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState("");
  const [targetType, setTargetType] = useState<"directory" | "canvas">("directory");
  const [directoryId, setDirectoryId] = useState(0);
  const [relativePath, setRelativePath] = useState("");
  const [canvasName, setCanvasName] = useState("");
  const [criteria, setCriteria] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeLeaving, setIntakeLeaving] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [workCollapsed, setWorkCollapsed] = useState(false);
  const automaticallyRepairedRunIds = useRef(new Set<number>());
  const { data } = useQuery({ queryKey: ["work-run", conversationId], queryFn: () => api<{ run: Run | null }>(`/api/conversations/${conversationId}/work-runs`) });
  const { data: directories = [] } = useQuery({ queryKey: ["directories"], queryFn: directoriesApi.list });
  const run = data?.run;
  const planQuery = useQuery({
    queryKey: ["work-plan", conversationId, run?.planPath],
    queryFn: () => api<PlanFile>(`/api/chat/${conversationId}/session-files/content?path=${encodeURIComponent(run!.planPath!)}`),
    enabled: planOpen && Boolean(run?.planPath),
  });
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["work-run", conversationId] }), [conversationId, queryClient]);

  useEffect(() => {
    const events = new EventSource(`/api/conversations/${conversationId}/work-runs/events`);
    events.onmessage = () => { void refresh(); };
    return () => events.close();
  }, [conversationId, refresh]);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/api/conversations/${conversationId}/work-runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, successCriteria: criteria, technicalBrief: brief ? { notes: brief } : {}, target: targetType === "canvas" ? { type: "canvas", canvasName } : { type: "directory", directoryId, relativePath } }) });
      setIntakeLeaving(true);
      onBeginPlanning?.({ goal, targetType, targetLabel: targetType === "canvas" ? `Canvas: ${canvasName}` : `Selected writable directory${relativePath ? ` / ${relativePath}` : ""}`, successCriteria: criteria, technicalBrief: brief });
      await new Promise((resolve) => setTimeout(resolve, 220)); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start Work."); setIntakeLeaving(false); }
    finally { setBusy(false); }
  };
  const action = async (actionName: string) => {
    if (!run) return;
    setBusy(true); setError(null);
    try {
      const result = await api<{ run: Run }>(`/api/conversations/${conversationId}/work-runs/${run.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) });
      // Phase changes alone do not create an AI SDK request. Start the
      // approved Work turn explicitly so planning, writing, and testing show
      // up as live chat activity immediately after approval.
      if (actionName === "approve" || actionName === "continue") onBeginBuild?.(result.run, actionName === "continue" ? "repair" : "approval");
      await refresh();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update Work."); }
    finally { setBusy(false); }
  };

  // A Work turn that ends with failed/missing checks gets one automatic
  // verification-and-repair continuation. The set avoids a silent infinite
  // retry loop: a second unresolved result remains visible for the user.
  useEffect(() => {
    if (!run || run.phase !== "needs_attention" || busy || automaticallyRepairedRunIds.current.has(run.id)) return;
    automaticallyRepairedRunIds.current.add(run.id);
    void action("continue");
  }, [run, busy]);

  if (!run) return <AnimatePresence>{!intakeLeaving && <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-background/92 px-4 py-8 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="w-full max-w-2xl rounded-2xl border bg-card p-5" initial={{ y: -96, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -96, opacity: 0, scale: 0.98 }} transition={{ type: "spring", stiffness: 340, damping: 30 }}><div className="mb-4 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /><h2 className="font-semibold">Start guided Work</h2></div><button type="button" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="Close Work and return to Chat" title="Close Work"><X className="h-4 w-4" /></button></div><p className="mb-4 text-sm text-muted-foreground">Define the outcome and destination first. Planning starts without changing your files.</p><div className="grid gap-3"><Textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Goal. What should be delivered?" autoFocus /><div className="flex gap-4 text-sm"><label className="flex items-center gap-1"><input type="radio" checked={targetType === "directory"} onChange={() => setTargetType("directory")} />Directory</label><label className="flex items-center gap-1"><input type="radio" checked={targetType === "canvas"} onChange={() => setTargetType("canvas")} />Canvas</label></div>{targetType === "directory" ? <><select className="h-9 rounded-md border bg-background px-2" value={directoryId} onChange={(event) => setDirectoryId(Number(event.target.value))}><option value={0}>Choose writable directory</option>{directories.filter((directory) => directory.canWrite).map((directory) => <option key={directory.id} value={directory.id}>{directory.label}</option>)}</select><Input value={relativePath} onChange={(event) => setRelativePath(event.target.value)} placeholder="Optional subdirectory" /></> : <Input value={canvasName} onChange={(event) => setCanvasName(event.target.value)} placeholder="Canvas name" />}<Textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="Success criteria (optional)" /><button type="button" className="w-fit text-xs text-muted-foreground underline" onClick={() => setBriefOpen((open) => !open)}>Technical brief (optional)</button>{briefOpen && <Textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Stack, audience, constraints, existing-project notes" />}{error && <p className="text-sm text-destructive">{error}</p>}<Button disabled={busy || !goal.trim() || (targetType === "directory" ? !directoryId : !canvasName.trim())} onClick={create}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Begin planning</Button></div></motion.section></motion.div>}</AnimatePresence>;

  const target = run.targetType === "canvas" ? `Canvas: ${run.canvasName}` : `Directory${run.targetPath ? ` / ${run.targetPath}` : ""}`;
  const awaitingApproval = run.phase === "awaiting_approval";
  const hasEvidence = run.changedFiles.length > 0 || run.checks.length > 0;
  const passedChecks = run.checks.filter((check) => check.status === "passed").length;
  return <>
    <section className="mx-auto my-4 w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className={workCollapsed ? "px-5 py-4" : "border-b bg-muted/20 px-5 py-4"}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Folder className="h-4 w-4 text-primary" /><span>Guided Work</span><span className="text-border">/</span><span className="capitalize text-foreground">{run.phase.replaceAll("_", " ")}</span></div><h2 className="mt-2 truncate text-lg font-semibold">{run.goal}</h2><p className="mt-1 text-sm text-muted-foreground">{target} <span className="px-1">·</span> Plan Revision {run.planRevision || "—"}</p></div><div className="flex shrink-0 items-center gap-1">{["completed", "needs_attention", "cancelled"].includes(run.phase) && <CheckCircle2 className="h-5 w-5 text-status-success" />}<button type="button" onClick={() => setWorkCollapsed((collapsed) => !collapsed)} aria-expanded={!workCollapsed} aria-label={workCollapsed ? "Expand Work details" : "Collapse Work details"} title={workCollapsed ? "Expand Work" : "Collapse Work"} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronDown className={`h-4 w-4 transition-transform ${workCollapsed ? "" : "rotate-180"}`} /></button></div></div></div>
      {!workCollapsed && <div className="space-y-3 p-5">
        {run.planPath && <button type="button" onClick={() => setPlanOpen(true)} className="group flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{awaitingApproval ? "Plan ready to review" : run.phase === "completed" ? "Completed plan" : "Plan approved"}</span><span className="block truncate text-xs text-muted-foreground">{awaitingApproval ? "Open the complete Markdown plan before approving" : "Open the Markdown plan used for this Work run"}</span></span><span className="flex items-center gap-1 text-xs font-medium text-primary">Preview <Eye className="h-3.5 w-3.5" /></span></button>}
        {awaitingApproval && <div className="flex flex-wrap items-center gap-2"><Button disabled={busy} onClick={() => action("approve")}><Play className="mr-1.5 h-4 w-4" />Approve & build</Button><Button variant="outline" disabled={busy} onClick={() => action("revise")}><RotateCcw className="mr-1.5 h-4 w-4" />Request changes</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => action("cancel")} className="text-muted-foreground"><XCircle className="mr-1.5 h-3.5 w-3.5" />Cancel</Button></div>}
        {hasEvidence && <div className="rounded-xl border bg-muted/20"><button type="button" onClick={() => setDetailsOpen((open) => !open)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/40"><span className="min-w-0 flex-1"><span className="font-medium text-foreground">Build details</span><span className="ml-2 text-muted-foreground">{run.changedFiles.length} file{run.changedFiles.length === 1 ? "" : "s"} · {passedChecks}/{run.checks.length} checks passed</span></span><ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`} /></button>{detailsOpen && <div className="space-y-3 border-t px-3 py-3 text-xs">{run.changedFiles.length > 0 && <div><p className="font-medium">Changed files</p>{run.changedFiles.slice(0, 8).map((file, index) => <p key={`${file.path}-${index}`} className="mt-1 text-muted-foreground">{file.path ?? "Unknown file"}{file.linesAdded != null ? ` +${file.linesAdded}` : ""}{file.linesRemoved != null ? ` −${file.linesRemoved}` : ""}</p>)}</div>}{run.checks.length > 0 && <div><p className="font-medium">Checks</p>{run.checks.slice(0, 8).map((check, index) => <p key={`${check.name}-${index}`} className="mt-1 text-muted-foreground">{check.status === "passed" ? "✓" : "!"} {check.name ?? "Verification"}</p>)}</div>}</div>}</div>}
        {["completed", "needs_attention"].includes(run.phase) && <Button size="sm" variant="outline" disabled={busy} onClick={() => action("continue")}><RotateCcw className="mr-1 h-3.5 w-3.5" />Continue / Fix</Button>}
        {!awaitingApproval && !["completed", "cancelled"].includes(run.phase) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => action("cancel")}><XCircle className="mr-1 h-3.5 w-3.5" />Cancel Work</Button>}
        {error && <p className="text-sm text-destructive">{error}</p>}{run.overview && <p className="text-sm text-muted-foreground">{run.overview}</p>}
      </div>}
    </section>
    <Dialog open={planOpen} onOpenChange={setPlanOpen}><DialogContent className="max-h-[90vh] w-[min(92vw,72rem)] max-w-[72rem] overflow-y-auto p-0 sm:max-w-[72rem]" showCloseButton><DialogHeader className="sticky top-0 z-10 border-b bg-popover px-8 py-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><FileText className="h-4 w-4 text-primary" />Plan <span>·</span> Revision {run.planRevision}</div><DialogTitle className="pt-1 text-2xl">{run.goal}</DialogTitle><DialogDescription>Review the proposed approach before you approve implementation.</DialogDescription></DialogHeader><div className="px-8 py-7">{planQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading plan…</div>}{planQuery.isError && <p className="text-sm text-destructive">Could not load the plan. Please try again.</p>}{planQuery.data && <><MarkdownRenderer content={planQuery.data.content} className="text-base" />{planQuery.data.isTruncated && <p className="mt-4 text-xs text-muted-foreground">This preview is truncated.</p>}</>}</div></DialogContent></Dialog>
  </>;
}
