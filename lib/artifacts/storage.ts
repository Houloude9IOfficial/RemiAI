import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts } from "@/db/schema";
import type { BuildChangedFile, BuildCheckpoint, BuildRunStatus } from "@/lib/build/runs";
import type { BuildVerificationCheck } from "@/lib/chat/build-verification";

export type ArtifactStatus = "completed" | "partial" | "failed";

export type SessionFileArtifactInput = {
  conversationId: number;
  sourceRunId?: string;
  path: string;
  name: string;
  size: number | null;
  status?: ArtifactStatus;
  message?: string | null;
};

/**
 * Save the durable metadata for a session-file deliverable. File bytes remain
 * in the conversation's session sandbox and are covered by the existing file
 * backup; this row makes the output discoverable after a chat reload.
 *
 * Presenting the same path again advances its artifact version instead of
 * creating duplicate rows, while a moved/renamed path becomes a new artifact.
 */
export async function saveSessionFileArtifact(
  database: typeof db,
  input: SessionFileArtifactInput,
) {
  const now = new Date().toISOString();
  const existing = await database
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.conversationId, input.conversationId),
        eq(artifacts.type, "file"),
        eq(artifacts.sessionPath, input.path),
      ),
    )
    .orderBy(desc(artifacts.updatedAt))
    .get();

  if (existing) {
    return await database
      .update(artifacts)
      .set({
        sourceRunId: input.sourceRunId ?? existing.sourceRunId,
        title: input.message?.trim() || input.name,
        legacyPath: input.path,
        status: input.status ?? "completed",
        fileSize: input.size ?? 0,
        version: existing.version + 1,
        metadata: input.message ? { message: input.message } : existing.metadata,
        updatedAt: now,
      })
      .where(eq(artifacts.id, existing.id))
      .returning()
      .get();
  }

  return await database
    .insert(artifacts)
    .values({
      conversationId: input.conversationId,
      sourceRunId: input.sourceRunId ?? null,
      type: "file",
      title: input.message?.trim() || input.name,
      legacyPath: input.path,
      status: input.status ?? "completed",
      sessionPath: input.path,
      fileSize: input.size ?? 0,
      version: 1,
      metadata: input.message ? { message: input.message } : {},
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export async function recordSessionFileArtifact(
  input: SessionFileArtifactInput,
) {
  return saveSessionFileArtifact(db, input);
}

export type BuildResultArtifactInput = {
  conversationId: number;
  sourceRunId: string;
  task: string;
  status: BuildRunStatus;
  summary: string;
  definitionOfDone: string[];
  changedFiles: BuildChangedFile[];
  checks: BuildVerificationCheck[];
  checkpoint?: BuildCheckpoint | null;
};

function buildArtifactStatus(status: BuildRunStatus): ArtifactStatus {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "partial";
}

/** Save a reusable, metadata-only result for a finalized Build run. */
export async function saveBuildResultArtifact(
  database: typeof db,
  input: BuildResultArtifactInput,
) {
  const now = new Date().toISOString();
  const title = `Build result: ${input.task.trim().slice(0, 120) || "Untitled task"}`;
  const metadata = {
    artifactKind: "build-result",
    task: input.task.slice(0, 2_000),
    status: input.status,
    summary: input.summary,
    definitionOfDone: input.definitionOfDone,
    changedFiles: input.changedFiles.slice(0, 100),
    checks: input.checks.slice(0, 100),
    checkpoint: input.checkpoint ?? null,
  } satisfies Record<string, unknown>;
  const existing = await database
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.conversationId, input.conversationId),
        eq(artifacts.type, "code"),
        eq(artifacts.sourceRunId, input.sourceRunId),
      ),
    )
    .get();

  if (existing) {
    return database
      .update(artifacts)
      .set({
        title,
        legacyPath: "",
        status: buildArtifactStatus(input.status),
        sessionPath: null,
        fileSize: 0,
        metadata,
        updatedAt: now,
      })
      .where(eq(artifacts.id, existing.id))
      .returning()
      .get();
  }

  return database
    .insert(artifacts)
    .values({
      conversationId: input.conversationId,
      sourceRunId: input.sourceRunId,
      type: "code",
      title,
      legacyPath: "",
      status: buildArtifactStatus(input.status),
      sessionPath: null,
      fileSize: 0,
      version: 1,
      metadata,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export async function listConversationArtifacts(conversationId: number) {
  return db
    .select()
    .from(artifacts)
    .where(eq(artifacts.conversationId, conversationId))
    .orderBy(desc(artifacts.updatedAt), desc(artifacts.id))
    .all();
}
