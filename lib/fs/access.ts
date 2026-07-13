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
    throw new FilesystemError(
      `Root directory ${id} not found. Make sure to pass the numeric id (e.g. rootId=1) — the AI must send the number, not a string like rootId="1". On macOS, temp/screenshot files under /var/folders/... are NOT inside any configured root — either add that directory in Settings > Directories, or copy/move the file into an existing root.`,
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

// When an image is larger than this threshold, we resize it server-side with
// sharp to create a small thumbnail data URL the model can still "see".
const DATA_URL_THRESHOLD = 128 * 1024; // 128 KB

// Max dimension for the resized thumbnail sent to the model.
const THUMBNAIL_MAX_WIDTH = 800; // pixels

export type MediaResult = {
  type: "image" | "video" | "unknown";
  filename: string;
  mimeType: string;
  size: number;
  /** Server URL for the UI to fetch and display the media. */
  url: string;
  /**
   * Base64 data URL — always present for images.
   * Small images (≤ 128 KB) are inlined at full resolution.
   * Larger images are resized to max {THUMBNAIL_MAX_WIDTH}px wide via sharp
   * so the data URL stays small enough for the model to process.
   * Videos never include a data URL.
   */
  dataUrl?: string;
};

/**
 * Read a media file and return metadata + a server URL (for the UI) and
 * always a base64 data URL for images (resized server-side if needed so
 * the model can "see" the content regardless of original file size).
 */
export async function readMedia(
  root: PermittedRoot,
  relativePath: string,
): Promise<MediaResult> {
  assertCanRead(root);
  const targetPath = await resolvePath(root, relativePath);

  const stats = await fs.stat(targetPath);
  if (!stats.isFile()) {
    throw new FilesystemError(
      `"${relativePath}" is not a file`,
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
      `"${relativePath}" is not a recognised media file (unsupported extension "${ext}")`,
      "UNSUPPORTED_MEDIA",
    );
  }

  // Reject files exceeding the hard limit
  if (stats.size > MAX_MEDIA_SIZE) {
    throw new FilesystemError(
      `Media file "${relativePath}" is ${(stats.size / 1024 / 1024).toFixed(1)} MB — exceeds the 20 MB limit`,
      "FILE_TOO_LARGE",
    );
  }

  const filename = path.basename(targetPath);
  const type: "image" | "video" = isImage ? "image" : "video";

  // Build a server URL that the UI can fetch for the full-resolution file
  const url = await buildMediaUrl(root, relativePath, filename);

  if (isImage) {
    // --- Image path: always produce a dataUrl (resize if needed) ---
    const dataUrl = await createImageDataUrl(targetPath, mimeType, stats.size);
    return { type, filename, mimeType, size: stats.size, url, dataUrl };
  }

  // --- Video path: no dataUrl (videos are too large even resized) ---
  return { type, filename, mimeType, size: stats.size, url };
}

/**
 * Create a base64 data URL for an image file.
 *
 * - Images ≤ 128 KB: inlined at their original resolution (fast, lossless).
 * - Images > 128 KB: resized to max {THUMBNAIL_MAX_WIDTH}px wide via sharp,
 *   encoded as JPEG quality 80. This keeps the data URL small (~50–100 KB)
 *   while preserving enough detail for the model to recognise content.
 */
async function createImageDataUrl(
  filePath: string,
  mimeType: string,
  fileSize: number,
): Promise<string> {
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
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    // If sharp fails (e.g. unsupported format like SVG), only inline the
    // original file if it's small enough — otherwise return empty.
    if (fileSize <= DATA_URL_THRESHOLD) {
      try {
        const buffer = await fs.readFile(filePath);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      } catch {
        // read error — fall through to empty
      }
    }
    return `data:${mimeType};base64,`; // empty data URL as last resort
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
 * Write content to a file. Creates parent directories if they don't exist.
 * When `mode` is "append", appends to the existing file (or creates if absent).
 */
export async function writeFile(
  root: PermittedRoot,
  relativePath: string,
  content: string,
  mode?: "overwrite" | "append" | null,
): Promise<{ wrote: number; path: string }> {
  assertCanWrite(root);
  const targetPath = await resolvePath(root, relativePath);

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const flag = mode === "append" ? "a" : "w";
  await fs.writeFile(targetPath, content, { encoding: "utf-8", flag });

  return { wrote: Buffer.byteLength(content, "utf-8"), path: targetPath };
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
