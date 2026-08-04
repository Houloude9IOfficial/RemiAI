import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

// ---------------------------------------------------------------------------
// Session file sandbox storage
//
// Each conversation gets its own sandbox directory:
//   data/session-files/{conversationId}/
//
// The AI can create, read, list, and delete files inside this sandbox using
// the `session_file_*` tools. The user can view them in a side panel and
// download everything as a .zip archive.
// ---------------------------------------------------------------------------

/** Base directory for all session file sandboxes. */
export const SESSION_FILES_BASE = path.join(
  process.cwd(),
  "data",
  "session-files",
);

/** Absolute path to a conversation's sandbox directory. */
export function getSessionDir(conversationId: number): string {
  return path.join(SESSION_FILES_BASE, String(conversationId));
}

export type SessionFileEntry = {
  /** Relative path from the sandbox root, always using forward slashes. */
  path: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  /** Last modified time as ISO string. */
  mtime: string;
};

export class SessionFilesError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SessionFilesError";
  }
}

// ---------------------------------------------------------------------------
// Path resolution & containment
// ---------------------------------------------------------------------------

/** Normalize a relative path to forward slashes and strip leading separators. */
export function normalizeSessionPath(relativePath: string): string {
  let cleaned = relativePath.replace(/\\/g, "/");
  cleaned = cleaned.replace(/^\/+/, "");
  // Collapse duplicate slashes and reject traversal attempts
  const segments = cleaned.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segments.some((s) => s === "..")) {
    throw new SessionFilesError(
      `Invalid path "${relativePath}" — path traversal is not allowed`,
      "ACCESS_DENIED",
    );
  }
  return segments.join("/");
}

/**
 * Resolve a relative path inside a conversation's sandbox, with a hard
 * containment check so nothing can escape the sandbox directory.
 *
 * Defense-in-depth: existing paths are resolved through `realpath` so a
 * symlink inside the sandbox cannot be followed out of it (mirrors the
 * behavior of the main filesystem layer in lib/fs/access.ts). For paths
 * that don't exist yet (new files), the parent directory is resolved the
 * same way before the basename is re-appended.
 */
export async function resolveSessionPath(
  conversationId: number,
  relativePath: string,
): Promise<string> {
  const normalized = normalizeSessionPath(relativePath);
  const sandbox = getSessionDir(conversationId);
  const rootResolved = path.resolve(sandbox);
  const rootBoundary = rootResolved + path.sep;
  const candidate = path.resolve(sandbox, normalized);

  // Basic lexical containment check before following any symlinks
  if (candidate !== rootResolved && !candidate.startsWith(rootBoundary)) {
    throw new SessionFilesError(
      `Path "${relativePath}" is outside the session sandbox`,
      "ACCESS_DENIED",
    );
  }

  const isInside = (p: string) =>
    p === rootResolved || p.startsWith(rootBoundary);

  try {
    const resolved = await fs.realpath(candidate);
    if (!isInside(resolved)) {
      throw new SessionFilesError(
        `Path "${relativePath}" resolves outside the session sandbox (symlink escape?)`,
        "ACCESS_DENIED",
      );
    }
    return resolved;
  } catch (err) {
    if (err instanceof SessionFilesError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;

    // Path doesn't exist yet (new file). Resolve the parent instead, then
    // re-append the basename — this catches symlinked parent directories.
    const parentDir = path.dirname(candidate);
    try {
      const resolvedParent = await fs.realpath(parentDir);
      if (!isInside(resolvedParent)) {
        throw new SessionFilesError(
          `Parent of "${relativePath}" resolves outside the session sandbox`,
          "ACCESS_DENIED",
        );
      }
      return path.join(resolvedParent, path.basename(candidate));
    } catch (innerErr) {
      if (innerErr instanceof SessionFilesError) throw innerErr;
      // Parent chain doesn't exist yet either (deep nested new file) —
      // the lexical check above already guarantees containment, and
      // mkdir -p will create real (non-symlinked) directories.
      return candidate;
    }
  }
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * Recursively list all files & directories inside a conversation sandbox.
 * Returns a flat array sorted with directories first, then alphabetically.
 */
export async function listSessionFiles(
  conversationId: number,
  relativePath?: string | null,
): Promise<SessionFileEntry[]> {
  const sandbox = getSessionDir(conversationId);
  const startDir = relativePath
    ? await resolveSessionPath(conversationId, relativePath)
    : sandbox;

  let stats;
  try {
    stats = await fs.stat(startDir);
  } catch {
    return [];
  }
  if (!stats.isDirectory()) {
    throw new SessionFilesError(
      `"${relativePath ?? "/"}" is not a directory`,
      "NOT_A_DIRECTORY",
    );
  }

  const entries: SessionFileEntry[] = [];
  const base = path.resolve(sandbox) + path.sep;

  async function walk(dir: string) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      const rel = path.resolve(full).replace(base, "").replace(/\\/g, "/");
      try {
        const st = await fs.stat(full);
        const isDir = st.isDirectory();
        entries.push({
          path: rel,
          name: dirent.name,
          isDirectory: isDir,
          isFile: !isDir,
          size: isDir ? 0 : st.size,
          mtime: st.mtime.toISOString(),
        });
        if (isDir) await walk(full);
      } catch {
        // Skip unreadable entries
      }
    }
  }

  await walk(startDir);
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Read / write / delete
// ---------------------------------------------------------------------------

export type SessionReadResult = {
  content: string;
  totalBytes: number;
  offset: number;
  limit: number;
  isTruncated: boolean;
};

const DEFAULT_READ_LIMIT = 100_000; // 100 KB — matches the filesystem tool
const MAX_READ_LIMIT = 1_000_000; // 1 MB hard cap for a single AI read

export async function readSessionFile(
  conversationId: number,
  relativePath: string,
  offset?: number | null,
  limit?: number | null,
): Promise<SessionReadResult> {
  const targetPath = await resolveSessionPath(conversationId, relativePath);

  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new SessionFilesError(
        `File not found in session sandbox: "${relativePath}"`,
        "NOT_FOUND",
      );
    }
    throw err;
  }
  if (!stats.isFile()) {
    throw new SessionFilesError(
      `"${relativePath}" is not a file`,
      "NOT_A_FILE",
    );
  }

  const effectiveOffset = Math.max(0, offset ?? 0);
  const effectiveLimit = Math.min(
    MAX_READ_LIMIT,
    Math.max(1, limit ?? DEFAULT_READ_LIMIT),
  );

  const bytesRemaining = Math.max(0, stats.size - effectiveOffset);
  if (bytesRemaining === 0) {
    return {
      content: "",
      totalBytes: stats.size,
      offset: effectiveOffset,
      limit: effectiveLimit,
      isTruncated: false,
    };
  }

  const readLength = Math.min(effectiveLimit, bytesRemaining);
  const buffer = Buffer.alloc(readLength);
  const fd = await fs.open(targetPath, "r");
  try {
    const { bytesRead } = await fd.read(
      buffer,
      0,
      buffer.length,
      effectiveOffset,
    );
    return {
      content: buffer.toString("utf-8", 0, bytesRead),
      totalBytes: stats.size,
      offset: effectiveOffset,
      limit: effectiveLimit,
      isTruncated: bytesRead < bytesRemaining,
    };
  } finally {
    await fd.close();
  }
}

export async function writeSessionFile(
  conversationId: number,
  relativePath: string,
  content: string,
  mode?: "overwrite" | "append" | null,
): Promise<{ wrote: number; path: string }> {
  const targetPath = await resolveSessionPath(conversationId, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const flag = mode === "append" ? "a" : "w";
  await fs.writeFile(targetPath, content, { encoding: "utf-8", flag });
  return { wrote: Buffer.byteLength(content, "utf-8"), path: targetPath };
}

/**
 * Delete a file (or directory recursively). Only allowed inside the sandbox.
 */
export async function deleteSessionFile(
  conversationId: number,
  relativePath: string,
): Promise<{ path: string; deleted: boolean }> {
  const targetPath = await resolveSessionPath(conversationId, relativePath);

  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (err) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new SessionFilesError(
        `File not found in session sandbox: "${relativePath}"`,
        "NOT_FOUND",
      );
    }
    throw err;
  }
  await fs.rm(targetPath, { recursive: stats.isDirectory(), force: false });
  return { path: targetPath, deleted: true };
}

// ---------------------------------------------------------------------------
// Uploads (user-provided files, e.g. images/assets)
// ---------------------------------------------------------------------------

export const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB

/** Sanitize an uploaded filename to a safe basename. */
export function sanitizeUploadName(filename: string): string {
  const base = path.basename(String(filename ?? "").replace(/\\/g, "/"));
  const cleaned = base.replace(/[^\w.\- ]+/g, "").trim();
  return cleaned || "upload.bin";
}

/**
 * Store a user-uploaded file into the sandbox root.
 * Rejects files that exceed {@link MAX_UPLOAD_SIZE}.
 */
export async function uploadSessionFile(
  conversationId: number,
  filename: string,
  data: Buffer,
): Promise<SessionFileEntry> {
  if (data.byteLength > MAX_UPLOAD_SIZE) {
    throw new SessionFilesError(
      `Uploaded file "${filename}" is ${(data.byteLength / 1024 / 1024).toFixed(1)} MB — exceeds the 25 MB limit`,
      "FILE_TOO_LARGE",
    );
  }
  const safeName = sanitizeUploadName(filename);
  const targetPath = await resolveSessionPath(conversationId, safeName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, data);
  const st = await fs.stat(targetPath);
  return {
    path: safeName,
    name: safeName,
    isDirectory: false,
    isFile: true,
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// ZIP archive
// ---------------------------------------------------------------------------

/**
 * Bundle the entire sandbox into a .zip archive (in-memory Buffer).
 * Directory structure is preserved using forward slashes.
 */
export async function zipSessionFiles(
  conversationId: number,
): Promise<Buffer> {
  const sandbox = getSessionDir(conversationId);
  const files: Record<string, Uint8Array> = {};

  async function walk(dir: string) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      const rel = path
        .relative(sandbox, full)
        .replace(/\\/g, "/");
      const st = await fs.stat(full);
      if (st.isDirectory()) {
        // Preserve empty directories with a trailing slash entry
        files[rel + "/"] = new Uint8Array(0);
        await walk(full);
      } else {
        const buf = await fs.readFile(full);
        files[rel] = new Uint8Array(buf);
      }
    }
  }

  let exists = true;
  try {
    await fs.access(sandbox);
  } catch {
    exists = false;
  }

  if (exists) {
    await walk(sandbox);
  }

  const zipped = zipSync(files, { level: 6 });
  return Buffer.from(zipped);
}

// ---------------------------------------------------------------------------
// Conversation cleanup
// ---------------------------------------------------------------------------

/** Remove the entire sandbox directory for a conversation. */
export async function deleteConversationSessionFiles(
  conversationId: number,
): Promise<void> {
  await fs.rm(getSessionDir(conversationId), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// MIME type inference (for serving raw files to the viewer)
// ---------------------------------------------------------------------------

const MIME_BY_EXT: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".jsx": "text/jsx; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/tsx; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".scss": "text/x-scss; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/jsonl; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

/** Look up a MIME type for a filename. Defaults to octet-stream. */
export function getMimeType(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}


