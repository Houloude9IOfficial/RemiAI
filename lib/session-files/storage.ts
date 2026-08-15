import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import {
  readMediaFromResolvedPath,
  type MediaResult,
} from "@/lib/fs/access";
import { SESSION_FILES_DIR } from "@/lib/paths";
import { emitSessionFilesChanged } from "./events";

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
export const SESSION_FILES_BASE = SESSION_FILES_DIR;

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

export type WriteSessionFileResult = {
  wrote: number;
  path: string;
  relativePath: string;
  mode: "overwrite" | "append";
  created: boolean;
  linesWritten: number;
  /** Line-count delta (mixed precision — not a true hunk diff). */
  linesAdded: number;
  linesRemoved: number;
  createdDirectories: string[];
};

export async function writeSessionFile(
  conversationId: number,
  relativePath: string,
  content: string,
  mode?: "overwrite" | "append" | null,
): Promise<WriteSessionFileResult> {
  const targetPath = await resolveSessionPath(conversationId, relativePath);
  const writeMode = mode === "append" ? "append" : "overwrite";
  const normalizedRel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");

  let previousLines: number | null = null;
  let created = true;
  try {
    const existing = await fs.readFile(targetPath, "utf-8");
    previousLines = existing.split("\n").length;
    created = false;
  } catch {
    // File does not exist yet
  }

  const parentPath = path.dirname(targetPath);
  const firstCreatedDirectory = await fs.mkdir(parentPath, { recursive: true });
  const createdDirectories: string[] = [];
  if (firstCreatedDirectory) {
    const sandbox = getSessionDir(conversationId);
    const first = normalizeSessionPath(path.relative(sandbox, firstCreatedDirectory));
    const parent = normalizeSessionPath(path.relative(sandbox, parentPath));
    if (first) createdDirectories.push(first);
    if (parent && parent !== first) createdDirectories.push(parent);
  }
  const flag = writeMode === "append" ? "a" : "w";
  await fs.writeFile(targetPath, content, { encoding: "utf-8", flag });
  emitSessionFilesChanged(conversationId, {
    operation: "write",
    path: normalizedRel,
  });

  const linesWritten = content.length === 0 ? 0 : content.split("\n").length;
  let linesAdded = 0;
  let linesRemoved = 0;
  if (writeMode === "append") {
    linesAdded = linesWritten;
  } else if (created || previousLines === null) {
    linesAdded = linesWritten;
  } else {
    linesAdded = Math.max(0, linesWritten - previousLines);
    linesRemoved = Math.max(0, previousLines - linesWritten);
  }

  return {
    wrote: Buffer.byteLength(content, "utf-8"),
    path: targetPath,
    relativePath: normalizedRel,
    mode: writeMode,
    created,
    linesWritten,
    linesAdded,
    linesRemoved,
    createdDirectories,
  };
}

export type EditSessionFileResult = {
  path: string;
  relativePath: string;
  bytesChanged: number;
  linesAdded: number;
  linesRemoved: number;
};

/** Replace a uniquely matched string in a sandbox file. */
export async function editSessionFile(
  conversationId: number,
  relativePath: string,
  oldStr: string,
  newStr: string,
): Promise<EditSessionFileResult | { error: string; matches: number; content: string }> {
  if (!oldStr) return { error: "old_str must not be empty.", matches: 0, content: "" };
  const targetPath = await resolveSessionPath(conversationId, relativePath);
  const content = await fs.readFile(targetPath, "utf-8");
  let matches = 0;
  let start = 0;
  while (true) {
    const found = content.indexOf(oldStr, start);
    if (found === -1) break;
    matches++;
    start = found + oldStr.length;
  }
  if (matches !== 1) {
    return {
      error: matches === 0 ? "old_str was not found exactly in the file." : "old_str matched more than once; include more surrounding context.",
      matches,
      content,
    };
  }
  await fs.writeFile(targetPath, content.replace(oldStr, newStr), "utf-8");
  emitSessionFilesChanged(conversationId, {
    operation: "edit",
    path: normalizeSessionPath(relativePath),
  });
  return {
    path: targetPath,
    relativePath: normalizeSessionPath(relativePath),
    bytesChanged: Math.abs(Buffer.byteLength(newStr, "utf-8") - Buffer.byteLength(oldStr, "utf-8")),
    linesAdded: Math.max(0, newStr.split("\n").length - oldStr.split("\n").length),
    linesRemoved: Math.max(0, oldStr.split("\n").length - newStr.split("\n").length),
  };
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
  emitSessionFilesChanged(conversationId, {
    operation: "delete",
    path: normalizeSessionPath(relativePath),
  });
  return { path: targetPath, deleted: true };
}

/**
 * Create a folder (recursively) inside the sandbox. Returns the entry for
 * the created folder.
 */
export async function createSessionFolder(
  conversationId: number,
  relativePath: string,
): Promise<SessionFileEntry> {
  const normalized = normalizeSessionPath(relativePath);
  const targetPath = await resolveSessionPath(conversationId, normalized);
  await fs.mkdir(targetPath, { recursive: true });
  const st = await fs.stat(targetPath);
  emitSessionFilesChanged(conversationId, {
    operation: "mkdir",
    path: normalized,
  });
  return {
    path: normalized,
    name: path.basename(targetPath),
    isDirectory: true,
    isFile: false,
    size: 0,
    mtime: st.mtime.toISOString(),
  };
}

/**
 * Rename or move a file/folder within the sandbox. The destination's parent
 * directories are created automatically. Fails if the destination already
 * exists or if a folder is moved into its own subtree.
 */
export async function moveSessionFile(
  conversationId: number,
  from: string,
  to: string,
): Promise<SessionFileEntry> {
  const fromNormalized = normalizeSessionPath(from);
  const toNormalized = normalizeSessionPath(to);

  // Moving a folder into its own subtree (lexical check, cheap & clear error)
  if (toNormalized.startsWith(`${fromNormalized}/`)) {
    throw new SessionFilesError(
      `Cannot move "${fromNormalized}" into its own subfolder "${toNormalized}"`,
      "INVALID_MOVE",
    );
  }

  const fromPath = await resolveSessionPath(conversationId, fromNormalized);
  const toPath = await resolveSessionPath(conversationId, toNormalized);

  if (fromPath === toPath) {
    // No-op rename onto itself — return the current entry
    const st = await fs.stat(fromPath);
    return {
      path: toNormalized,
      name: path.basename(fromPath),
      isDirectory: st.isDirectory(),
      isFile: !st.isDirectory(),
      size: st.isDirectory() ? 0 : st.size,
      mtime: st.mtime.toISOString(),
    };
  }

  // Source must exist
  try {
    await fs.lstat(fromPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SessionFilesError(
        `File not found in session sandbox: "${fromNormalized}"`,
        "NOT_FOUND",
      );
    }
    throw err;
  }

  // Destination must not already exist
  try {
    await fs.lstat(toPath);
    throw new SessionFilesError(
      `A file or folder already exists at "${toNormalized}"`,
      "ALREADY_EXISTS",
    );
  } catch (err) {
    if (err instanceof SessionFilesError) throw err;
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  try {
    await fs.mkdir(path.dirname(toPath), { recursive: true });
  } catch (err) {
    if (["EEXIST", "ENOTDIR"].includes((err as NodeJS.ErrnoException).code ?? "")) {
      throw new SessionFilesError(
        `Cannot move "${fromNormalized}" to "${toNormalized}" — a component of the destination path is a file`,
        "INVALID_MOVE",
      );
    }
    throw err;
  }
  try {
    await fs.rename(fromPath, toPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EINVAL") {
      throw new SessionFilesError(
        `Cannot move "${fromNormalized}" into "${toNormalized}"`,
        "INVALID_MOVE",
      );
    }
    throw err;
  }

  const st = await fs.stat(toPath);
  emitSessionFilesChanged(conversationId, {
    operation: "move",
    path: toNormalized,
  });
  return {
    path: toNormalized,
    name: path.basename(toPath),
    isDirectory: st.isDirectory(),
    isFile: !st.isDirectory(),
    size: st.isDirectory() ? 0 : st.size,
    mtime: st.mtime.toISOString(),
  };
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
 * Store a user-uploaded file into the sandbox (root or a subfolder via
 * {@link dir}). Rejects files that exceed {@link MAX_UPLOAD_SIZE}.
 */
export async function uploadSessionFile(
  conversationId: number,
  filename: string,
  data: Buffer,
  dir?: string | null,
): Promise<SessionFileEntry> {
  if (data.byteLength > MAX_UPLOAD_SIZE) {
    throw new SessionFilesError(
      `Uploaded file "${filename}" is ${(data.byteLength / 1024 / 1024).toFixed(1)} MB — exceeds the 25 MB limit`,
      "FILE_TOO_LARGE",
    );
  }
  const safeName = sanitizeUploadName(filename);
  const safeDir = dir ? normalizeSessionPath(dir) : "";
  const relTarget = safeDir ? `${safeDir}/${safeName}` : safeName;
  const targetPath = await resolveSessionPath(conversationId, relTarget);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, data);
  emitSessionFilesChanged(conversationId, {
    operation: "upload",
    path: relTarget,
  });
  const st = await fs.stat(targetPath);
  return {
    path: relTarget,
    name: safeName,
    isDirectory: false,
    isFile: true,
    size: st.size,
    mtime: st.mtime.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// URLs & media
// ---------------------------------------------------------------------------

/**
 * Build the canonical URL for a file inside the conversation's sandbox.
 * These URLs are served by the /api/chat/:id/session-files/[...path] route
 * and can be embedded in chat messages (e.g. `![diagram](/api/chat/5/session-files/assets/diagram.png)`)
 * or passed to URL-based tools (read_file, read_media, web_fetch).
 */
export function buildSessionFileUrl(
  conversationId: number,
  relativePath: string,
): string {
  const normalized = normalizeSessionPath(relativePath);
  const encoded = normalized
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `/api/chat/${conversationId}/session-files/${encoded}`;
}

/**
 * Read an image/video from the session sandbox so the AI can examine it.
 * Returns metadata + the canonical server URL, plus a base64 dataUrl for
 * images so the model can "see" the actual content.
 */
export async function readSessionFileMedia(
  conversationId: number,
  relativePath: string,
): Promise<MediaResult> {
  const targetPath = await resolveSessionPath(conversationId, relativePath);
  const url = buildSessionFileUrl(conversationId, relativePath);
  return readMediaFromResolvedPath(targetPath, relativePath, url);
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
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  // Videos
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".ogv": "video/ogg",
  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
};

/** Look up a MIME type for a filename. Defaults to octet-stream. */
export function getMimeType(filename: string): string {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

