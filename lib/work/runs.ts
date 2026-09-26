import { eq } from "drizzle-orm";
import { getRuntimeDb, getRuntimeSqlite } from "@/db";
import { directories } from "@/db/schema";
import { writeSessionFile } from "@/lib/session-files/storage";
import { publishWorkRunEvent } from "@/lib/work/events";

export type WorkPhase = "planning" | "awaiting_approval" | "building" | "testing" | "completed" | "needs_attention" | "cancelled";
export type WorkTarget =
  | { type: "canvas"; canvasName: string }
  | { type: "directory"; directoryId: number; relativePath?: string };
export type WorkRunRecord = { id: number; conversationId: number; goal: string; targetType: "canvas" | "directory"; directoryId: number | null; targetPath: string; canvasName: string | null; successCriteria: string; technicalBrief: Record<string, string>; phase: WorkPhase; planPath: string | null; planRevision: number; changedFiles: Array<Record<string, unknown>>; checks: Array<Record<string, unknown>>; overview: string; createdAt: string; updatedAt: string; approvedAt: string | null; completedAt: string | null };

function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function toRun(row: Record<string, unknown> | undefined): WorkRunRecord | undefined { if (!row) return undefined; return { ...row, targetType: row.targetType as WorkRunRecord["targetType"], phase: row.phase as WorkPhase, directoryId: row.directoryId as number | null, canvasName: row.canvasName as string | null, planPath: row.planPath as string | null, approvedAt: row.approvedAt as string | null, completedAt: row.completedAt as string | null, technicalBrief: parseJson(row.technicalBrief, {}), changedFiles: parseJson(row.changedFiles, []), checks: parseJson(row.checks, []) } as unknown as WorkRunRecord; }
const runColumns = "id, conversation_id AS conversationId, goal, target_type AS targetType, directory_id AS directoryId, target_path AS targetPath, canvas_name AS canvasName, success_criteria AS successCriteria, technical_brief AS technicalBrief, phase, plan_path AS planPath, plan_revision AS planRevision, changed_files AS changedFiles, checks, overview, created_at AS createdAt, updated_at AS updatedAt, approved_at AS approvedAt, completed_at AS completedAt";

function safeRelativePath(value: string | undefined): string {
  const normalized = (value ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized.split("/").some((part) => part === "..")) throw new Error("Target subdirectory cannot escape its writable root.");
  return normalized;
}

export async function createWorkRun(input: {
  conversationId: number; goal: string; target: WorkTarget; successCriteria?: string;
  technicalBrief?: Record<string, string>;
}) {
  const db = getRuntimeDb(); const sqlite = getRuntimeSqlite();
  const now = new Date().toISOString();
  let directoryId: number | null = null;
  let targetPath = "";
  let canvasName: string | null = null;
  if (input.target.type === "directory") {
    const directory = await db.select().from(directories).where(eq(directories.id, input.target.directoryId)).get();
    if (!directory?.canWrite) throw new Error("Choose a configured writable directory for Work mode.");
    directoryId = directory.id;
    targetPath = safeRelativePath(input.target.relativePath);
  } else {
    canvasName = input.target.canvasName.trim().slice(0, 120);
    if (!canvasName) throw new Error("Canvas name is required.");
  }
  const result = sqlite.prepare("INSERT INTO work_runs (conversation_id, goal, target_type, directory_id, target_path, canvas_name, success_criteria, technical_brief, phase, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?)").run(input.conversationId, input.goal.trim(), input.target.type, directoryId, targetPath, canvasName, input.successCriteria?.trim() ?? "", JSON.stringify(input.technicalBrief ?? {}), now, now);
  const run = toRun(sqlite.prepare(`SELECT ${runColumns} FROM work_runs WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown>);
  if (!run) throw new Error("Work run was not created.");
  publishWorkRunEvent({ conversationId: input.conversationId, runId: run.id, phase: run.phase, updatedAt: run.updatedAt });
  return run;
}

export async function getWorkRun(conversationId: number, runId: number) {
  return toRun(getRuntimeSqlite().prepare(`SELECT ${runColumns} FROM work_runs WHERE id = ? AND conversation_id = ?`).get(runId, conversationId) as Record<string, unknown>);
}

export async function getActiveWorkRun(conversationId: number) {
  return toRun(getRuntimeSqlite().prepare(`SELECT ${runColumns} FROM work_runs WHERE conversation_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1`).get(conversationId) as Record<string, unknown>);
}

export async function submitWorkPlan(conversationId: number, runId: number, markdown: string) {
  const sqlite = getRuntimeSqlite();
  const run = await getWorkRun(conversationId, runId);
  if (!run || run.phase !== "planning") throw new Error("A Work plan can only be submitted while the run is planning.");
  const revision = run.planRevision + 1;
  const planPath = `plans/work-${run.id}-v${revision}.md`;
  await writeSessionFile(conversationId, planPath, markdown, "overwrite");
  const updatedAt = new Date().toISOString(); sqlite.prepare("UPDATE work_runs SET plan_path = ?, plan_revision = ?, phase = 'awaiting_approval', updated_at = ? WHERE id = ?").run(planPath, revision, updatedAt, run.id);
  const updated = await getWorkRun(conversationId, run.id); if (!updated) throw new Error("Work run disappeared while saving its plan.");
  publishWorkRunEvent({ conversationId, runId: updated.id, phase: updated.phase, updatedAt: updated.updatedAt });
  return updated;
}

export async function setWorkPhase(conversationId: number, runId: number, phase: WorkPhase, overview?: string) {
  const sqlite = getRuntimeSqlite();
  const run = await getWorkRun(conversationId, runId);
  if (!run) throw new Error("Work run not found.");
  const now = new Date().toISOString();
  sqlite.prepare("UPDATE work_runs SET phase = ?, overview = ?, updated_at = ?, approved_at = ?, completed_at = ? WHERE id = ?").run(phase, overview ?? run.overview, now, phase === "building" ? now : run.approvedAt, ["completed", "cancelled", "needs_attention"].includes(phase) ? now : run.completedAt, runId);
  const updated = await getWorkRun(conversationId, runId); if (!updated) throw new Error("Work run disappeared while updating it.");
  publishWorkRunEvent({ conversationId, runId: updated.id, phase: updated.phase, updatedAt: updated.updatedAt });
  return updated;
}

/** Persist the inspectable build outcome without relying on Drizzle table
 * identities, which can be stale during Turbopack hot reloads. */
export async function finishWorkRun(input: {
  conversationId: number;
  runId: number;
  phase: Extract<WorkPhase, "completed" | "needs_attention">;
  changedFiles: Array<Record<string, unknown>>;
  checks: Array<Record<string, unknown>>;
  overview: string;
}) {
  const sqlite = getRuntimeSqlite();
  const now = new Date().toISOString();
  const result = sqlite.prepare("UPDATE work_runs SET phase = ?, changed_files = ?, checks = ?, overview = ?, updated_at = ?, completed_at = ? WHERE id = ? AND conversation_id = ?")
    .run(input.phase, JSON.stringify(input.changedFiles), JSON.stringify(input.checks), input.overview, now, now, input.runId, input.conversationId);
  if (result.changes !== 1) throw new Error("Work run not found while recording its result.");
  const updated = await getWorkRun(input.conversationId, input.runId);
  if (!updated) throw new Error("Work run disappeared while recording its result.");
  publishWorkRunEvent({ conversationId: input.conversationId, runId: updated.id, phase: updated.phase, updatedAt: updated.updatedAt });
  return updated;
}

export function workTargetLabel(run: NonNullable<Awaited<ReturnType<typeof getWorkRun>>>) {
  return run.targetType === "canvas" ? `Canvas “${run.canvasName}” (created after approval)` : run.targetPath || "writable root";
}

export function workTargetAllowsPath(run: NonNullable<Awaited<ReturnType<typeof getWorkRun>>>, rootId: unknown, relativePath: unknown) {
  if (run.targetType !== "directory" || Number(rootId) !== run.directoryId || typeof relativePath !== "string") return false;
  const candidate = safeRelativePath(relativePath);
  return !run.targetPath || candidate === run.targetPath || candidate.startsWith(`${run.targetPath}/`);
}
