import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/db";
import { fileIndex, directories } from "@/db/schema";
import { eq, and, sql, like, desc } from "drizzle-orm";
import { getPermittedRoots, getRootById } from "./access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IndexedFileEntry = {
  id: number;
  directoryId: number;
  relativePath: string;
  fileSize: number;
  modifiedAt: number;
  contentHash: string;
  updatedAt: string;
};

export type FileChangeEntry = {
  directoryId: number;
  directoryLabel: string;
  relativePath: string;
  changeType: "added" | "modified" | "deleted";
  fileSize: number;
  changedAt: string;
};

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Maximum file size to hash (50 MB). Larger files use size+mtime as fingerprint. */
const MAX_HASH_SIZE = 50 * 1024 * 1024;

/** Maximum batch size for parallel file indexing. */
const INDEX_CONCURRENCY = 50;

/**
 * Compute an MD5 hash of a file's contents using streaming reads.
 * Skips hashing for files larger than 50 MB and returns a size-based
 * fingerprint instead (to avoid OOM on large files like videos, logs).
 */
export async function hashFile(filePath: string): Promise<string> {
  const stat = await fsp.stat(filePath);
  if (stat.size > MAX_HASH_SIZE) {
    // For large files, use size + mtime as a content fingerprint.
    return `size:${stat.size}:mtime:${Math.floor(stat.mtimeMs)}`;
  }
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

/**
 * Index a single file by computing its metadata and content hash,
 * then upserting into the file_index table.
 *
 * Handles the race condition where a file is deleted between stat and read
 * by catching ENOENT and removing from index gracefully.
 */
export async function indexFile(
  directoryId: number,
  relativePath: string,
  absolutePath: string,
): Promise<IndexedFileEntry | null> {
  let stats;
  try {
    stats = await fsp.stat(absolutePath);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // File was deleted between event and processing
      await removeFromIndex(directoryId, relativePath);
      return null;
    }
    throw err;
  }

  // Compute quick metadata-based check — skip if nothing changed
  const existing = await db
    .select()
    .from(fileIndex)
    .where(
      and(
        eq(fileIndex.directoryId, directoryId),
        eq(fileIndex.relativePath, relativePath),
      ),
    )
    .get();

  // Quick check: if size and mtime match, skip re-hashing
  const mtimeMs = Math.floor(stats.mtimeMs);
  if (
    existing &&
    existing.fileSize === stats.size &&
    existing.modifiedAt === mtimeMs
  ) {
    return existing;
  }

  // Compute hash for content change detection
  let contentHash: string;
  try {
    contentHash = await hashFile(absolutePath);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // File was deleted before we could hash it
      await removeFromIndex(directoryId, relativePath);
      return null;
    }
    throw err;
  }

  // If hash matches existing, just update modified time
  if (existing && existing.contentHash === contentHash) {
    const updated = await db
      .update(fileIndex)
      .set({
        fileSize: stats.size,
        modifiedAt: mtimeMs,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(fileIndex.id, existing.id))
      .returning()
      .get();
    return updated!;
  }

  // Upsert: insert or update
  const row = await db
    .insert(fileIndex)
    .values({
      directoryId,
      relativePath,
      fileSize: stats.size,
      modifiedAt: mtimeMs,
      contentHash,
    })
    .onConflictDoUpdate({
      target: [fileIndex.directoryId, fileIndex.relativePath],
      set: {
        fileSize: stats.size,
        modifiedAt: mtimeMs,
        contentHash,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    })
    .returning()
    .get();

  return row;
}

/**
 * Re-index all files recursively within a directory root.
 * Skips common ignored directories (node_modules, .git, .cache, etc.).
 * Returns the count of files indexed.
 */
export async function indexDirectory(directoryId: number): Promise<number> {
  const root = await getRootById(directoryId);
  const IGNORED_DIRS = new Set([
    "node_modules",
    ".git",
    ".cache",
    ".next",
    ".turbo",
    "coverage",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".DS_Store",
  ]);

  let count = 0;

  async function walk(dirPath: string, relPath: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fsp.readdir(dirPath);
    } catch {
      return; // Skip unreadable directories
    }

    // Batch process: first collect files, then recurse into dirs
    const fileTasks: (() => Promise<void>)[] = [];
    const dirEntries: string[] = [];

    for (const name of entries) {
      if (IGNORED_DIRS.has(name)) continue;
      const fullPath = path.join(dirPath, name);
      const relative = relPath ? `${relPath}/${name}` : name;

      try {
        const st = await fsp.stat(fullPath);
        if (st.isDirectory()) {
          dirEntries.push(fullPath);
        } else if (st.isFile()) {
          fileTasks.push(async () => {
            const result = await indexFile(directoryId, relative, fullPath);
            if (result) count++;
          });
        }
      } catch {
        // Skip entries we can't stat
      }
    }

    // Index files in parallel with concurrency limit
    await runConcurrent(fileTasks, INDEX_CONCURRENCY);

    // Recurse into directories
    for (const dirFullPath of dirEntries) {
      const dirName = path.basename(dirFullPath);
      const dirRelPath = relPath ? `${relPath}/${dirName}` : dirName;
      await walk(dirFullPath, dirRelPath);
    }
  }

  await walk(root.path, "");
  return count;
}

/**
 * Run an array of async functions concurrently with a maximum parallelism limit.
 */
async function runConcurrent(
  tasks: (() => Promise<void>)[],
  concurrency: number,
): Promise<void> {
  let index = 0;
  const results: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      try {
        await tasks[i]();
      } catch (err) {
        console.error("[file-index] Index task failed:", err);
        // Continue processing remaining tasks
      }
    }
  }

  const workers = Math.min(concurrency, tasks.length);
  for (let i = 0; i < workers; i++) {
    results.push(worker());
  }
  await Promise.all(results);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get recently changed files across all watched directories.
 * Returns changes sorted by most recent first, limited to `limit` entries.
 */
export async function queryRecentChanges(
  limit: number = 20,
): Promise<FileChangeEntry[]> {
  const roots = await getPermittedRoots();
  const watchedIds = roots.filter((r) => r.canRead).map((r) => r.id);

  if (watchedIds.length === 0) return [];

  // Build the IN clause safely using sql.join with SQL values
  const inClause = sql.join(
    watchedIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const rows = await db
    .select({
      id: fileIndex.id,
      directoryId: fileIndex.directoryId,
      relativePath: fileIndex.relativePath,
      fileSize: fileIndex.fileSize,
      updatedAt: fileIndex.updatedAt,
      directoryLabel: directories.label,
    })
    .from(fileIndex)
    .innerJoin(directories, eq(fileIndex.directoryId, directories.id))
    .where(
      and(
        sql`${fileIndex.directoryId} IN (${inClause})`,
        directories.watchEnabled,
      ),
    )
    .orderBy(desc(fileIndex.updatedAt))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    directoryId: r.directoryId,
    directoryLabel: r.directoryLabel,
    relativePath: r.relativePath,
    changeType: "modified" as const,
    fileSize: r.fileSize,
    changedAt: r.updatedAt,
  }));
}

/**
 * Search the file index by relative path pattern (LIKE query).
 */
export async function queryFileIndex(
  directoryId?: number,
  pathPattern?: string,
  limit: number = 50,
): Promise<IndexedFileEntry[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  if (directoryId !== undefined) {
    conditions.push(eq(fileIndex.directoryId, directoryId));
  }

  let query = db
    .select()
    .from(fileIndex)
    .orderBy(desc(fileIndex.updatedAt))
    .limit(limit);

  if (conditions.length > 0) {
    query = query.where(and(...conditions) as any) as any;
  }

  if (pathPattern) {
    query = query.where(
      like(fileIndex.relativePath, `%${pathPattern}%`),
    ) as any;
  }

  return await query.all();
}

/**
 * Remove a file from the index (e.g., when it's deleted).
 */
export async function removeFromIndex(
  directoryId: number,
  relativePath: string,
): Promise<void> {
  await db
    .delete(fileIndex)
    .where(
      and(
        eq(fileIndex.directoryId, directoryId),
        eq(fileIndex.relativePath, relativePath),
      ),
    );
}

/**
 * Clean up all index entries for a directory (e.g., when a directory is removed).
 */
export async function clearDirectoryIndex(directoryId: number): Promise<void> {
  await db
    .delete(fileIndex)
    .where(eq(fileIndex.directoryId, directoryId));
}
