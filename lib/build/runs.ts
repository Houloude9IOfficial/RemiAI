import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buildRuns } from "@/db/schema";
import {
  summarizeBuildChecks,
  type BuildVerificationCheck,
} from "@/lib/chat/build-verification";

export type BuildRunStatus = "running" | "completed" | "failed" | "interrupted";

export type BuildCheckpoint = {
  step: number;
  phase: "executing" | "verifying" | "repairing";
  repairAttempt: number;
  changedFiles: BuildChangedFile[];
  checks: BuildVerificationCheck[];
  updatedAt: string;
};

export type BuildChangedFile = {
  path: string;
  kind: "create" | "edit" | "delete" | "rename";
  linesAdded?: number;
  linesRemoved?: number;
  bytes?: number;
  /** True only for files in this conversation's session sandbox. */
  openable?: boolean;
  /** Bounded textual preview; only emitted by session-file tools. */
  diffPreview?: string;
};

export type BuildRunInput = {
  conversationId: number;
  sourceRunId?: string;
  task: string;
  status: BuildRunStatus;
  definitionOfDone: string[];
  changedFiles: BuildChangedFile[];
  checks: BuildVerificationCheck[];
  summary: string;
  error?: string | null;
  checkpoint?: BuildCheckpoint | null;
  resultArtifactId?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolName(value: unknown): string {
  if (typeof value !== "string") return "";
  const lower = value.toLowerCase();
  return lower.includes("__") ? lower.split("__").slice(1).join("__") : lower;
}

function normalizePath(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.replace(/\\/g, "/").trim()
    : null;
}

/** Convert AI SDK step results into the UI-part shape shared by check parsing. */
export function buildPartsFromSteps(steps: unknown[]): unknown[] {
  const parts: unknown[] = [];
  for (const rawStep of steps) {
    const step = asRecord(rawStep);
    const results = step?.toolResults;
    if (!Array.isArray(results)) continue;
    for (const rawResult of results) {
      const result = asRecord(rawResult);
      if (!result) continue;
      const name = toolName(result.toolName);
      if (!name) continue;
      parts.push({
        type: `tool-${name}`,
        state: "output-available",
        input: result.input,
        output: result.output,
      });
    }
  }
  return parts;
}

/** Extract only safe file metadata; contents and command output are excluded. */
export function summarizeChangedFiles(parts: unknown[]): BuildChangedFile[] {
  const files: BuildChangedFile[] = [];
  const seen = new Set<string>();

  for (const rawPart of parts) {
    const part = asRecord(rawPart);
    if (!part) continue;
    const name = toolName(
      part.toolName ??
        (typeof part.type === "string" ? part.type.replace(/^tool-/, "") : ""),
    );
    if (
      ![
        "write_file",
        "edit_file",
        "session_file_write",
        "session_file_edit",
        "create_directory",
        "delete_directory",
        "session_file_delete",
        "rename_item",
        "session_file_move",
      ].includes(name)
    ) {
      continue;
    }

    const input = asRecord(part.input);
    const output = asRecord(part.output);
    const path = normalizePath(
      output?.path ??
        output?.relativePath ??
        output?.newPath ??
        input?.relativePath ??
        input?.path ??
        input?.destRelativePath ??
        input?.to,
    );
    if (!path || seen.has(path)) continue;
    seen.add(path);

    const isDelete = name === "delete_directory" || name === "session_file_delete";
    const isRename = name === "rename_item" || name === "session_file_move";
    const kind = isDelete ? "delete" : isRename ? "rename" : output?.created === true ? "create" : "edit";
    const linesAdded = typeof output?.linesAdded === "number" ? output.linesAdded : undefined;
    const linesRemoved = typeof output?.linesRemoved === "number" ? output.linesRemoved : undefined;
    const bytes =
      typeof output?.bytesChanged === "number"
        ? output.bytesChanged
        : typeof output?.wrote === "number"
          ? output.wrote
          : undefined;
    const openable = name.startsWith("session_file_");
    const diffPreview =
      openable && typeof output?.diffPreview === "string"
        ? output.diffPreview.slice(0, 4_000)
        : undefined;

    files.push({
      path,
      kind,
      linesAdded,
      linesRemoved,
      bytes,
      openable,
      ...(diffPreview ? { diffPreview } : {}),
    });
  }

  return files;
}

export function buildRunSummary(
  changedFiles: BuildChangedFile[],
  checks: BuildVerificationCheck[],
  status: BuildRunStatus,
): string {
  const passed = checks.filter((check) => check.status === "passed").length;
  const failed = checks.filter((check) => check.status === "failed").length;
  const incomplete = checks.filter((check) => check.status === "incomplete").length;
  const fileLabel = `${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} changed`;
  const checkLabel = checks.length === 0
    ? "no execution checks recorded"
    : `${passed} passed${failed ? `, ${failed} failed` : ""}${incomplete ? `, ${incomplete} incomplete` : ""}`;
  const statusLabel =
    status === "completed"
      ? "Build run completed"
      : status === "interrupted"
        ? "Build run interrupted"
        : status === "running"
          ? "Build run in progress"
          : "Build run needs attention";
  return `${statusLabel}: ${fileLabel}; ${checkLabel}.`;
}

export async function saveBuildRun(database: typeof db, input: BuildRunInput) {
  const now = new Date().toISOString();
  return database
    .insert(buildRuns)
    .values({
      conversationId: input.conversationId,
      sourceRunId: input.sourceRunId ?? null,
      task: input.task.slice(0, 2_000),
      status: input.status,
      definitionOfDone: input.definitionOfDone,
      changedFiles: input.changedFiles,
      checks: input.checks,
      checkpoint: input.checkpoint ?? null,
      resultArtifactId: input.resultArtifactId ?? null,
      summary: input.summary,
      error: input.error ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: input.status === "running" ? null : now,
    })
    .returning()
    .get();
}

export async function recordBuildRun(input: BuildRunInput) {
  return saveBuildRun(db, input);
}

export async function updateBuildRunCheckpoint(
  database: typeof db,
  id: number,
  checkpoint: BuildCheckpoint,
) {
  return database
    .update(buildRuns)
    .set({
      status: "running",
      changedFiles: checkpoint.changedFiles,
      checks: checkpoint.checks,
      checkpoint,
      summary: buildRunSummary(checkpoint.changedFiles, checkpoint.checks, "running"),
      updatedAt: checkpoint.updatedAt,
    })
    .where(eq(buildRuns.id, id))
    .run();
}

export async function finishBuildRun(
  database: typeof db,
  id: number,
  input: Pick<BuildRunInput, "status" | "changedFiles" | "checks" | "summary" | "error" | "checkpoint" | "resultArtifactId">,
) {
  const now = new Date().toISOString();
  return database
    .update(buildRuns)
    .set({
      status: input.status,
      changedFiles: input.changedFiles,
      checks: input.checks,
      checkpoint: input.checkpoint ?? null,
      resultArtifactId: input.resultArtifactId ?? null,
      summary: input.summary,
      error: input.error ?? null,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(buildRuns.id, id))
    .run();
}

export async function listConversationBuildRuns(conversationId: number) {
  return db
    .select()
    .from(buildRuns)
    .where(eq(buildRuns.conversationId, conversationId))
    .orderBy(desc(buildRuns.createdAt), desc(buildRuns.id))
    .all();
}

export function checksFromSteps(steps: unknown[]): BuildVerificationCheck[] {
  return summarizeBuildChecks(buildPartsFromSteps(steps));
}
