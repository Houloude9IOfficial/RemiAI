import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Fuse from "fuse.js";
import { db } from "@/db";
import { directories } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermittedRoot = {
  id: number;
  path: string;
  label: string;
  canRead: boolean;
  canWrite: boolean;
};

export type FileEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
};

export type ReadResult = {
  content: string;
  totalBytes: number;
  offset: number;
  limit: number;
  isTruncated: boolean;
};

export type SearchMatch = {
  file: string;
  line: number;
  content: string;
};

export class FilesystemError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "FilesystemError";
  }
}

// ---------------------------------------------------------------------------
// Root lookups
// ---------------------------------------------------------------------------

/**
 * Return all configured directories from the DB.
 */
export async function getPermittedRoots(): Promise<PermittedRoot[]> {
  const rows = await db.select().from(directories).all();
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    label: r.label,
    canRead: r.canRead,
    canWrite: r.canWrite,
  }));
}

/**
 * Look up a single root by its DB id. Throws if not found.
 *
 * The `id` parameter is typed as `number` but may arrive as a string
 * when the AI model serializes numbers as strings in tool call JSON.
 * Both `z.coerce.number()` (Zod-level) and `Number()` (runtime guard)
 * handle this so the lookup always works cross-platform.
 */
export async function getRootById(id: number): Promise<PermittedRoot> {
  // Runtime coercion: AI models sometimes send rootId as a string ("1")
  // even when the schema says number. Number() handles both.
  const numericId = Number(id);
  const roots = await getPermittedRoots();
  const root = roots.find((r) => r.id === numericId);
  if (!root) {
    const available =
      roots.length > 0
        ? roots
            .map(
              (r) =>
                `${r.id} (${r.label}, ${r.canWrite ? "writable" : "read-only"})`,
            )
            .join(", ")
        : "none configured";
    throw new FilesystemError(
      `Root directory ${id} not found. Available roots: ${available}. Make sure to pass one of the numeric ids above (e.g. rootId=1) — the AI must send the number, not a string like rootId="1". Only roots marked "writable" support write_file. On macOS, temp/screenshot files under /var/folders/... are NOT inside any configured root — either add that directory in Settings > Directories, or copy/move the file into an existing root.`,
      "NOT_FOUND",
    );
  }
  return root;
}

// ---------------------------------------------------------------------------
// Path resolution & containment
// ---------------------------------------------------------------------------

/**
 * Canonicalize a relative path within a root directory.
 *
 * 1. If `relativePath` is empty or undefined, return the root itself.
 * 2. Resolve `root + relativePath` through `realpath` to catch `..`, `.`,
 *    and symlink escapes.
 * 3. For paths that don't exist yet (writes to new files), resolve the parent
 *    directory first, then re-append the basename.
 * 4. Verify the resolved path is contained within the root (bounded by path
 *    separator so `Documents-evil` cannot escape `Documents`).
 *
 * Returns the resolved canonical path.
 */
export async function resolvePath(
  root: PermittedRoot,
  relativePath?: string | null,
): Promise<string> {
  if (!relativePath) return root.path;

  // Strip leading separators — we want a true relative join
  const cleaned = relativePath.replace(/^[/\\]+/, "");
  const candidate = path.resolve(root.path, cleaned);

  // Ensure the candidate starts with root (before resolving symlinks)
  if (!isWithinRoot(candidate, root.path)) {
    throw new FilesystemError(
      `Path "${relativePath}" is outside the permitted root. On macOS, temp/screenshot files under /var/folders/... are NOT inside any configured root — either add that directory in Settings > Directories, or copy/move the file into an existing root.`,
      "ACCESS_DENIED",
    );
  }

  let resolved: string;
  try {
    resolved = await fs.realpath(candidate);
  } catch (err: any) {
    // realpath fails if the path doesn't exist -> this could be a new file.
    // Resolve the parent to check containment, then re-append basename.
    if (err.code === "ENOENT") {
      const parentDir = path.dirname(candidate);
      try {
        const resolvedParent = await fs.realpath(parentDir);
        if (!isWithinRoot(resolvedParent, root.path)) {
          throw new FilesystemError(
            `Parent of "${relativePath}" is outside the permitted root`,
            "ACCESS_DENIED",
          );
        }
        // Return the resolved parent + original basename
        return path.join(resolvedParent, path.basename(candidate));
      } catch (innerErr) {
        if (innerErr instanceof FilesystemError) throw innerErr;
        throw new FilesystemError(
          `Parent directory does not exist: ${parentDir}`,
          "NOT_FOUND",
        );
      }
    }
    throw new FilesystemError(
      `Cannot resolve path: ${err.message ?? String(err)}`,
      "RESOLVE_ERROR",
    );
  }

  // Final containment check for existing paths
  if (!isWithinRoot(resolved, root.path)) {
    throw new FilesystemError(
      `Resolved path "${relativePath}" is outside the permitted root (symlink escape?). On macOS, /var is symlinked to /private/var, so paths like /var/folders/... resolve to /private/var/folders/... Make sure your configured root uses the real path.`,
      "ACCESS_DENIED",
    );
  }

  return resolved;
}

/**
 * Bounded prefix check: `target === root || target.startsWith(root + sep)`.
 * This prevents `Documents-evil` falsely matching root `Documents`.
 */
function isWithinRoot(target: string, root: string): boolean {
  const normalizedTarget = path.normalize(target);
  const normalizedRoot = path.normalize(root);
  if (normalizedTarget === normalizedRoot) return true;
  // Use path.sep for containment check (\ on Windows, / on macOS/Linux)
  const withSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  return normalizedTarget.startsWith(withSep);
}

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

function assertCanRead(root: PermittedRoot): void {
  if (!root.canRead) {
    throw new FilesystemError(
      `Read access denied for "${root.label}"`,
      "READ_DENIED",
    );
  }
}

function assertCanWrite(root: PermittedRoot): void {
  if (!root.canWrite) {
    throw new FilesystemError(
      `Write access denied for "${root.label}"`,
      "WRITE_DENIED",
    );
  }
}

// ---------------------------------------------------------------------------
// Filesystem operations
// ---------------------------------------------------------------------------

/**
 * List files and directories inside a root (or subdirectory).
 */
export async function listDirectory(
  root: PermittedRoot,
  relativePath?: string | null,
): Promise<FileEntry[]> {
  assertCanRead(root);
  const targetPath = await resolvePath(root, relativePath);

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    try {
      const stat = await fs.stat(path.join(targetPath, entry.name));
      results.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink(),
        size: stat.size,
      });
    } catch {
      // Skip entries we can't stat (permission issues, broken symlinks, etc.)
      results.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink(),
        size: 0,
      });
    }
  }

  // Sort: directories first, then by name
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

/**
 * Read a file's text content, with optional pagination via offset/limit.
 */
export async function readFile(
  root: PermittedRoot,
  relativePath: string,
  offset?: number | null,
  limit?: number | null,
): Promise<ReadResult> {
  assertCanRead(root);
  const targetPath = await resolvePath(root, relativePath);

  const stats = await fs.stat(targetPath);
  if (!stats.isFile()) {
    throw new FilesystemError(`"${relativePath}" is not a file`, "NOT_A_FILE");
  }

  const effectiveOffset = offset ?? 0;
  const effectiveLimit = limit ?? stats.size;

  // Guard against zero/negative reads
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
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, effectiveOffset);
    const content = buffer.toString("utf-8", 0, bytesRead);
    return {
      content,
      totalBytes: stats.size,
      offset: effectiveOffset,
      limit: effectiveLimit,
      isTruncated: bytesRead < bytesRemaining,
    };
  } finally {
    await fd.close();
  }
}

/**
 * Search for text content inside files within a root directory using Fuse.js.
 *
 * First attempts with a strict threshold for high-precision matches.
 * If zero results are found, retries with a looser threshold for fuzzy matches.
 * This ensures the search never silently fails — it always expands the search
 * before returning empty.
 *
 * Uses ripgrep for the initial file discovery (fast), then Fuse.js for
 * intelligent fuzzy matching on content.
 */
export async function searchFiles(
  root: PermittedRoot,
  query: string,
  pattern?: string | null,
): Promise<SearchMatch[]> {
  assertCanRead(root);

  // Empty query guard — Fuse.js returns ALL documents for empty queries
  if (!query.trim()) return [];

  const hasPattern = pattern !== null && pattern !== undefined;
  const globPattern = hasPattern ? pattern : "**";

  // Discover files using ripgrep (fast file listing) or Node glob fallback
  const filePaths = await discoverFiles(root, globPattern);
  if (filePaths.length === 0) return [];

  // Read all file contents
  const documents: { file: string; content: string }[] = [];
  for (const fp of filePaths) {
    try {
      const content = await fs.readFile(path.join(root.path, fp), "utf-8");
      documents.push({ file: fp, content });
    } catch {
      // Skip unreadable files (binary, permissions, etc.)
    }
  }

  if (documents.length === 0) return [];

  // Two-tier Fuse search: strict first, loose fallback
  const results = fuseSearch(documents, query, { strict: true });
  if (results.length > 0) return results;

  return fuseSearch(documents, query, { strict: false });
}

/**
 * Collect all file paths recursively in a root directory matching a glob.
 * Uses ripgrep for speed, falls back to Node glob.
 * All returned paths use forward slashes (/) for cross-platform consistency.
 */
async function discoverFiles(
  root: PermittedRoot,
  globPattern: string,
): Promise<string[]> {
  // Try ripgrep --files for fast recursive file listing
  try {
    // `--no-ignore` intentionally omitted: respects `.gitignore` so that
    // `node_modules`, `.cache`, `.git` and similar are excluded by default.
    // The user can add explicit directories if they need those searched.
    const rgArgs = ["--files", "--glob", globPattern, root.path];
    const rgResult = spawnSync("rg", rgArgs, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10_000,
      windowsHide: true,
    });

    if (rgResult.status === 0 && rgResult.stdout) {
      return rgResult.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(normalizePath);
    }
  } catch {
    // rg not available — fall through
  }

  // Node glob fallback
  const nodeGlob = await importGlob();
  const files: string[] = [];
  for await (const fp of nodeGlob(globPattern, { cwd: root.path, nodir: true })) {
    files.push(normalizePath(fp));
  }
  return files.sort();
}

/**
 * Normalize a file path to always use forward slashes (/).
 * This ensures cross-platform consistency: macOS/Linux use / natively,
 * Windows uses \ internally, but AI models and tool outputs should always
 * use / so that paths work the same everywhere.
 */
function normalizePath(fp: string): string {
  return fp.replace(/\\/g, "/");
}

/**
 * Run a Fuse.js fuzzy search over the collected documents.
 *
 * When `strict` is true, uses a high-precision threshold (0.3) and requires
 * a minimum match length of 3 characters. When false, uses a looser
 * threshold (0.6) and 1-character minimum.
 */
function fuseSearch(
  documents: { file: string; content: string }[],
  query: string,
  opts: { strict: boolean },
): SearchMatch[] {
  const threshold = opts.strict ? 0.3 : 0.6;
  const minMatchCharLength = opts.strict ? 3 : 1;

  const fuse = new Fuse(documents, {
    keys: ["content", "file"],
    threshold,
    minMatchCharLength,
    includeMatches: true,
    includeScore: true,
    findAllMatches: true,
    ignoreLocation: true,
  });

  const fuseResults = fuse.search(query);

  const matches: SearchMatch[] = [];
  for (const result of fuseResults) {
    const { file, content } = result.item;

    if (!result.matches) continue;

    // Extract line-level matches from Fuse match indices
    for (const match of result.matches) {
      if (match.key !== "content" || !match.indices) continue;

      for (const [start, end] of match.indices) {
        const line = lineNumberAt(content, start);
        const lineContent = extractLine(content, line);
        matches.push({
          file,
          line,
          content: lineContent,
        });
      }
    }
  }

  // Deduplicate same (file, line) pairs
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.file}:${m.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Count newlines to find which line a byte offset falls on.
 */
function lineNumberAt(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

/**
 * Extract a single line (0-indexed) from content.
 */
function extractLine(content: string, line: number): string {
  const lines = content.split("\n");
  const idx = line - 1;
  if (idx >= 0 && idx < lines.length) return lines[idx].trim();
  return "";
}

/**
 * Match files by glob pattern inside a root directory.
 * All returned paths use forward slashes (/) for cross-platform consistency.
 */
export async function globFiles(
  root: PermittedRoot,
  globPattern: string,
): Promise<string[]> {
  assertCanRead(root);
  const nodeGlob = await importGlob();
  const results: string[] = [];

  for await (const filePath of nodeGlob(globPattern, { cwd: root.path })) {
    results.push(normalizePath(filePath));
  }

  return results.sort();
}

// ---------------------------------------------------------------------------
// Media file support
// ---------------------------------------------------------------------------

/**
 * Recognised MIME types for media files.
 */
const MEDIA_EXTENSIONS = new Map<string, string>([
  // Images
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  // Videos
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".avi", "video/x-msvideo"],
  [".mkv", "video/x-matroska"],
]);

const MAX_MEDIA_SIZE = 20 * 1024 * 1024; // 20 MB hard limit for any media file

// Images up to this size are inlined at full resolution (as base64 in the dataUrl).
// Larger images are resized via sharp to a thumbnail for the AI to examine.
const DATA_URL_THRESHOLD = 512 * 1024; // 512 KB

// Max dimension for the resized thumbnail sent to the model.
// Higher values (1200+) help the AI read text in screenshots.
const THUMBNAIL_MAX_WIDTH = 1200; // pixels

export type MediaResult = {
  type: "image" | "video" | "unknown";
  filename: string;
  mimeType: string;
  size: number;
  /** Server URL for the UI to fetch and display the media. */
  url: string;
  /**
   * Base64 data URL — always present for images (except in rare fallback
   * cases where sharp is unavailable AND the image is very large).
   * Small images (≤ 512 KB) are inlined at full resolution.
   * Larger images are resized to max {THUMBNAIL_MAX_WIDTH}px wide via sharp
   * so the data URL stays compact enough for the model to process.
   * Videos never include a data URL.
   */
  dataUrl?: string;
};

/**
 * Read a media file and return metadata + a server URL (for the UI) and
 * always a base64 data URL for images (resized server-side if needed so
 * the model can "see" the content regardless of original file size).
 */
// Fallback threshold: if sharp fails and the image exceeds this size, skip the
// dataUrl entirely rather than inlining a multi-megabyte base64 string.
const FALLBACK_INLINE_MAX = 2 * 1024 * 1024; // 2 MB

export async function readMedia(
  root: PermittedRoot,
  relativePath: string,
): Promise<MediaResult> {
  assertCanRead(root);
  const targetPath = await resolvePath(root, relativePath);
  return readMediaFromPath(targetPath, root, relativePath);
}

/**
 * Upload base directory — matches app/api/chat/upload/route.ts
 */
export const UPLOAD_BASE = path.join(process.cwd(), "data", "uploads");

/**
 * Regex to match uploaded file URLs: /api/chat/uploads/{conversationId}/{filename}
 */
export const UPLOAD_URL_RE = /^\/api\/chat\/uploads\/(\d+)\/(.+)$/;

/**
 * Result of parsing a chat upload URL.
 */
export type UploadUrlResult = {
  conversationId: string;
  filename: string;
  resolvedPath: string;
};

/**
 * Parse and validate a chat upload URL.
 *
 * Accepts URLs like `/api/chat/uploads/123/uuid_filename.pdf` or
 * `http://localhost:3000/api/chat/uploads/123/uuid_filename.pdf` and
 * resolves the file path on disk with path-traversal protection.
 *
 * Does NOT check that the file exists — only validates and resolves the path.
 */
export async function resolveUploadUrl(uploadUrl: string): Promise<UploadUrlResult> {
  // Normalize: strip protocol + hostname if present (e.g. http://localhost:3000)
  const normalized = uploadUrl.replace(/^https?:\/\/[^\/]+/i, "");

  const match = normalized.match(UPLOAD_URL_RE);
  if (!match) {
    throw new FilesystemError(
      `Invalid upload URL: "${uploadUrl}". Expected format: /api/chat/uploads/{conversationId}/{filename}`,
      "INVALID_URL",
    );
  }

  const conversationId = match[1];
  const filename = decodeURIComponent(match[2]);

  // Security: prevent path traversal
  if (filename.includes("..") || filename.startsWith("/")) {
    throw new FilesystemError(
      "Access denied — invalid filename",
      "ACCESS_DENIED",
    );
  }

  const filePath = path.join(UPLOAD_BASE, conversationId, filename);

  // Verify the resolved path is still within the upload directory
  const resolvedPath = path.resolve(filePath);
  const normalizedBase = path.resolve(UPLOAD_BASE, conversationId);
  if (!resolvedPath.startsWith(normalizedBase + path.sep)) {
    throw new FilesystemError(
      "Access denied — path outside upload directory",
      "ACCESS_DENIED",
    );
  }

  return { conversationId, filename, resolvedPath };
}

/**
 * Read a media file from a chat upload URL.
 *
 * Accepts URLs like `/api/chat/uploads/123/uuid_filename.png` and reads the
 * file directly from `data/uploads/{conversationId}/{filename}` on disk.
 *
 * This allows the AI to use `read_media` on user-uploaded files even though
 * they aren't in a configured directory root.
 */
export async function readMediaFromUrl(uploadUrl: string): Promise<MediaResult> {
  const { filename, resolvedPath } = await resolveUploadUrl(uploadUrl);

  // Read media from the resolved file path, using the original upload URL
  // (not the virtual root's buildMediaUrl which would produce a broken /api/media/0/... URL)
  const stats = await fs.stat(resolvedPath);
  if (!stats.isFile()) {
    throw new FilesystemError(
      `Uploaded file not found: "${filename}"`,
      "NOT_FOUND",
    );
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = MEDIA_EXTENSIONS.get(ext) ?? "application/octet-stream";

  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new FilesystemError(
      `"${filename}" is not a recognised media file (unsupported extension "${ext}")`,
      "UNSUPPORTED_MEDIA",
    );
  }

  if (stats.size > MAX_MEDIA_SIZE) {
    throw new FilesystemError(
      `Media file "${filename}" is ${(stats.size / 1024 / 1024).toFixed(1)} MB — exceeds the 20 MB limit`,
      "FILE_TOO_LARGE",
    );
  }

  const type: "image" | "video" = isImage ? "image" : "video";

  if (isImage) {
    const dataUrl = await createImageDataUrl(resolvedPath, mimeType, stats.size);
    return { type, filename, mimeType, size: stats.size, url: uploadUrl, dataUrl };
  }

  return { type, filename, mimeType, size: stats.size, url: uploadUrl };
}

/**
 * Internal: read media from a resolved file path.
 * Used by both readMedia (root + relativePath) and readMediaFromUrl (URL).
 */
async function readMediaFromPath(
  targetPath: string,
  root: PermittedRoot,
  displayPath: string,
): Promise<MediaResult> {
  const stats = await fs.stat(targetPath);
  if (!stats.isFile()) {
    throw new FilesystemError(
      `"${displayPath}" is not a file`,
      "NOT_A_FILE",
    );
  }

  const ext = path.extname(targetPath).toLowerCase();
  const mimeType = MEDIA_EXTENSIONS.get(ext) ?? "application/octet-stream";

  // Determine the broad type category
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new FilesystemError(
      `"${displayPath}" is not a recognised media file (unsupported extension "${ext}")`,
      "UNSUPPORTED_MEDIA",
    );
  }

  // Reject files exceeding the hard limit
  if (stats.size > MAX_MEDIA_SIZE) {
    throw new FilesystemError(
      `Media file "${displayPath}" is ${(stats.size / 1024 / 1024).toFixed(1)} MB — exceeds the 20 MB limit`,
      "FILE_TOO_LARGE",
    );
  }

  const filename = path.basename(targetPath);
  const type: "image" | "video" = isImage ? "image" : "video";

  // Build a server URL that the UI can fetch for the full-resolution file
  const url = await buildMediaUrl(root, displayPath, filename);

  if (isImage) {
    const dataUrl = await createImageDataUrl(targetPath, mimeType, stats.size);
    return { type, filename, mimeType, size: stats.size, url, dataUrl };
  }

  return { type, filename, mimeType, size: stats.size, url };
}

/**
 * Create a base64 data URL for an image file.
 *
 * - Images ≤ 512 KB: inlined at their original resolution (fast, lossless).
 * - Images > 512 KB: resized to max {THUMBNAIL_MAX_WIDTH}px wide via sharp,
 *   encoded as JPEG quality 85. This keeps the data URL compact (~80-200 KB)
 *   while preserving enough detail for the model to read text and recognise content.
 * - Fallback: if sharp is unavailable or fails, attempts a direct inline instead
 *   of returning an empty data URL the AI can't use.
 */
async function createImageDataUrl(
  filePath: string,
  mimeType: string,
  fileSize: number,
): Promise<string | undefined> {
  // Small images: inline the original buffer directly
  if (fileSize <= DATA_URL_THRESHOLD) {
    const buffer = await fs.readFile(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  // Large images: resize via sharp to keep the data URL compact
  try {
    const sharp = await importSharp();
    const resized = await sharp(filePath)
      .resize({
        width: THUMBNAIL_MAX_WIDTH,
        withoutEnlargement: true, // never upscale
        fit: "inside",            // maintain aspect ratio
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    // If sharp fails (e.g. unsupported format like SVG, memory pressure),
    // try to inline the original directly — but only if it's reasonably small
    // to avoid blowing up the model's context window with a huge base64 string.
    if (fileSize <= FALLBACK_INLINE_MAX) {
      try {
        const buffer = await fs.readFile(filePath);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      } catch {
        // read error — fall through to undefined
      }
    }
    // File too large to safely inline, or read error — return no dataUrl.
    // The caller will still have `url` + metadata for the UI to display.
    return undefined;
  }
}

/**
 * Dynamically import sharp. Sharp is a native module that may not be
 * available in all environments (e.g. some serverless runtimes). This
 * lazy import keeps the rest of the module importable even if sharp
 * isn't installed, and defers loading to when it's actually needed.
 */
/**
 * Dynamically load sharp (a native CJS module). With esModuleInterop,
 * dynamic `import("sharp")` wraps it as `{ default: sharpFn }`.
 * Return type is explicitly the calling signature so the caller can
 * invoke it as `sharp(filePath)`.
 */
async function importSharp(): Promise<
  (input?: string | Buffer) => any
> {
  const mod = await import("sharp");
  const fn = (mod as any).default ?? mod;
  return fn as (input?: string | Buffer) => any;
}

/**
 * Build the server URL path used to serve this media file.
 * Converts Windows backslashes to forward slashes so the URL is valid.
 */
async function buildMediaUrl(
  root: PermittedRoot,
  relativePath: string,
  _filename: string,
): Promise<string> {
  // Normalize Windows backslashes to forward slashes
  const normalized = normalizePath(relativePath);
  // URL-encode each path segment so special characters are safe
  const encodedSegments = normalized
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  // The API route will take /api/media/<rootId>/<relativePath>
  return `/api/media/${root.id}/${encodedSegments}`;
}

/**
 * Rename or move a file or directory within a permitted root. Requires write
 * permission on the root. Works for both files and directories. If the
 * destination is on a different filesystem (cross-device), this will fail
 * with a clear error message — in that case, use copy + delete instead.
 *
 * Returns the old and new resolved paths on success.
 */
export async function renameItem(
  root: PermittedRoot,
  sourceRelativePath: string,
  destRelativePath: string,
): Promise<{ oldPath: string; newPath: string }> {
  assertCanWrite(root);

  // Resolve source path (must exist on disk)
  const sourcePath = await resolvePath(root, sourceRelativePath);

  // Verify source exists
  try {
    await fs.stat(sourcePath);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FilesystemError(
        `Source "${sourceRelativePath}" does not exist`,
        "NOT_FOUND",
      );
    }
    throw err;
  }

  // Manually resolve destination path — resolvePath requires the parent
  // directory to exist, but we want to support renaming into new
  // non-existent subdirectories. We do a containment check on the raw
  // candidate path instead.
  const destCleaned = destRelativePath.replace(/^[/\\]+/, "");
  const destCandidate = path.resolve(root.path, destCleaned);
  if (!isWithinRoot(destCandidate, root.path)) {
    throw new FilesystemError(
      `Destination "${destRelativePath}" is outside the permitted root`,
      "ACCESS_DENIED",
    );
  }

  // Create parent directory of destination if it doesn't exist
  await fs.mkdir(path.dirname(destCandidate), { recursive: true });

  try {
    await fs.rename(sourcePath, destCandidate);
  } catch (err: any) {
    if (err.code === "EXDEV") {
      throw new FilesystemError(
        `Cannot rename across filesystem boundaries. Use write_file (copy) + delete_directory to move "${sourceRelativePath}" to "${destRelativePath}" instead.`,
        "CROSS_DEVICE",
      );
    }
    if (err.code === "ENOTEMPTY" || err.code === "EEXIST") {
      throw new FilesystemError(
        `Destination "${destRelativePath}" already exists`,
        "DESTINATION_EXISTS",
      );
    }
    throw err;
  }

  return { oldPath: sourcePath, newPath: destCandidate };
}

/**
 * Create a new directory (and any missing parent directories) at the specified
 * path within a permitted root. Requires write permission on the root.
 */
export async function createDirectory(
  root: PermittedRoot,
  relativePath: string,
): Promise<{ path: string }> {
  assertCanWrite(root);
  const targetPath = await resolvePath(root, relativePath);
  await fs.mkdir(targetPath, { recursive: true });
  return { path: targetPath };
}

/**
 * Permanently delete a directory and ALL of its contents (files,
 * subdirectories, everything) within a permitted root. Requires write
 * permission on the root. The target must be an existing directory.
 * This action CANNOT be undone — use with extreme care.
 */
export async function deleteDirectory(
  root: PermittedRoot,
  relativePath: string,
): Promise<{ path: string; deleted: boolean }> {
  assertCanWrite(root);
  const targetPath = await resolvePath(root, relativePath);

  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FilesystemError(
        `Directory "${relativePath}" does not exist`,
        "NOT_FOUND",
      );
    }
    throw err;
  }
  if (!stats.isDirectory()) {
    throw new FilesystemError(
      `"${relativePath}" is not a directory`,
      "NOT_A_DIRECTORY",
    );
  }

  await fs.rm(targetPath, { recursive: true, force: false });
  return { path: targetPath, deleted: true };
}

export type WriteFileResult = {
  wrote: number;
  path: string;
  relativePath: string;
  mode: "overwrite" | "append";
  created: boolean;
  linesWritten: number;
  /** Line-count delta (mixed precision — not a true hunk diff). */
  linesAdded: number;
  linesRemoved: number;
};

/**
 * Write content to a file. Creates parent directories if they don't exist.
 * When `mode` is "append", appends to the existing file (or creates if absent).
 */
export async function writeFile(
  root: PermittedRoot,
  relativePath: string,
  content: string,
  mode?: "overwrite" | "append" | null,
): Promise<WriteFileResult> {
  assertCanWrite(root);
  const targetPath = await resolvePath(root, relativePath);
  const writeMode = mode === "append" ? "append" : "overwrite";
  const normalizedRel = normalizePath(relativePath);

  // Snapshot prior line count for mixed-precision +/- summary
  let previousLines: number | null = null;
  let created = true;
  try {
    const existing = await fs.readFile(targetPath, "utf-8");
    previousLines = existing.split("\n").length;
    created = false;
  } catch {
    // File does not exist yet — treat as create
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const flag = writeMode === "append" ? "a" : "w";
  await fs.writeFile(targetPath, content, { encoding: "utf-8", flag });

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
  };
}

// ---------------------------------------------------------------------------
// Dynamic import helper for node:fs/promises glob
// (not in @types/node@20, but available in Node.js 22+)
// ---------------------------------------------------------------------------

async function importGlob(): Promise<
  (pattern: string, options?: { cwd?: string; nodir?: boolean }) => AsyncIterable<string>
> {
  const mod = await import("node:fs/promises");
  return (mod as any).glob;
}
