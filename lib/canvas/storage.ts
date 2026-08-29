import fs from "node:fs/promises";
import path from "node:path";
import {
  getSessionDir,
  listSessionFiles,
  resolveSessionPath,
  type SessionFileEntry,
} from "@/lib/session-files/storage";

// ---------------------------------------------------------------------------
// Canvas storage — a named, self-contained multi-file web project.
//
// A canvas lives inside the conversation's session sandbox under:
//   data/session-files/{conversationId}/canvas/{slug}/
//
// It is just a folder of ordinary sandbox files (index.html + style.css +
// script.js + assets), so it inherits everything session files already give
// us for free:
//   - per-conversation containment & symlink protection
//   - MIME-aware raw serving (/api/chat/:id/session-files/...[...path])
//   - the real-time SSE change stream (the canvas panel refreshes live)
//   - backup / ZIP export / upload primitives
//
// A small `canvas.json` manifest at the project root records the user-facing
// name, description, and the *entry* file used for the live preview. There is
// intentionally NO new DB table — the manifest plus the sandbox's own file
// listing is the source of truth.
// ---------------------------------------------------------------------------

/** Folder name under the sandbox root that holds all canvases. */
export const CANVAS_ROOT = "canvas";

/** Manifest filename inside a canvas folder. */
export const CANVAS_MANIFEST = "canvas.json";

/** Default entry file for a canvas live preview. */
export const DEFAULT_ENTRY = "index.html";

export interface CanvasManifest {
  name: string;
  description: string;
  entryFile: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasInfo extends CanvasManifest {
  /** URL-safe identifier = the sandbox folder name under `canvas/`. */
  slug: string;
  /** Absolute path to the canvas folder on disk. */
  dir: string;
  /** Files in the project (excluding the manifest), newest-first. */
  files: SessionFileEntry[];
  /** URL used to render the interactive live preview. */
  previewUrl: string;
  /** All files live under `canvas/{slug}/`; this is that prefix (forward slashes). */
  prefix: string;
}

/** MIME types that are safe to edit inline in the canvas editor. */
const TEXT_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "cjs", "jsx", "ts", "tsx",
  "json", "md", "markdown", "txt", "svg", "xml", "yaml", "yml", "csv",
]);

/** Is this filename editable as text in the canvas panel? */
export function isCanvasTextFile(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return TEXT_EXTENSIONS.has(ext);
}

/** Turn a display name into a safe, unique folder slug. */
export function slugify(name: string): string {
  const slug = String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "canvas";
}

/** Ensure a given path stays inside `canvas/{slug}/` (defense-in-depth). */
export function normalizeCanvasPath(slug: string, relPath: string): string {
  const cleaned = String(relPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `${CANVAS_ROOT}/${slug}`;
  if (
    cleaned === "" ||
    cleaned === prefix ||
    cleaned.startsWith(`${prefix}/`)
  ) {
    return cleaned;
  }
  // Paths that point outside the canvas project (e.g. absolute, or a bare
  // filename) get scoped into it so the AI never writes outside the project.
  return `${prefix}/${cleaned.replace(/^.*\//, "") || DEFAULT_ENTRY}`;
}

/** Absolute path to a canvas folder for a conversation. */
export function getCanvasDir(conversationId: number, slug: string): string {
  return path.join(getSessionDir(conversationId), CANVAS_ROOT, slug);
}

function parseManifest(raw: string | null): Partial<CanvasManifest> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasManifest>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function writeManifest(conversationId: number, slug: string, m: CanvasManifest) {
  const target = await resolveSessionPath(
    conversationId,
    `${CANVAS_ROOT}/${slug}/${CANVAS_MANIFEST}`,
  );
  await fs.writeFile(target, JSON.stringify(m, null, 2), "utf-8");
}

/** Read + validate a canvas manifest, falling back to safe defaults. */
export async function readCanvasInfo(
  conversationId: number,
  slug: string,
): Promise<CanvasInfo | null> {
  const dir = getCanvasDir(conversationId, slug);
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  const manifestPath = `${CANVAS_ROOT}/${slug}/${CANVAS_MANIFEST}`;
  let raw = "";
  try {
    const buf = await fs.readFile(await resolveSessionPath(conversationId, manifestPath));
    raw = buf.toString("utf-8");
  } catch {
    // No manifest yet — treat the folder as an unnamed canvas.
  }
  const m = parseManifest(raw);
  const entryFile = m.entryFile || DEFAULT_ENTRY;
  const now = new Date().toISOString();
  return {
    slug,
    name: m.name || slug,
    description: m.description || "",
    entryFile,
    createdAt: m.createdAt || now,
    updatedAt: m.updatedAt || now,
    dir,
    prefix: `${CANVAS_ROOT}/${slug}`,
    previewUrl: buildCanvasPreviewUrl(conversationId, slug, entryFile),
    files: [],
  };
}

/** Build the URL the live-preview iframe loads for a canvas entry file. */
export function buildCanvasPreviewUrl(
  conversationId: number,
  slug: string,
  entryFile: string,
): string {
  // Served by the existing sandbox wildcard route so relative css/js/assets
  // resolve naturally next to the entry file, with correct MIME types.
  const segments = [`${CANVAS_ROOT}/${slug}`, entryFile]
    .join("/")
    .split("/")
    .map((s) => encodeURIComponent(s));
  return `/api/chat/${conversationId}/session-files/${segments.join("/")}`;
}

async function filesForCanvas(
  conversationId: number,
  info: CanvasInfo,
): Promise<SessionFileEntry[]> {
  const all = await listSessionFiles(conversationId, info.prefix);
  const files = all
    // Omit the manifest from the visible file list (it's internal metadata).
    .filter((e) => e.isFile && e.name !== CANVAS_MANIFEST)
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
  return files;
}

/** List every canvas project in a conversation. */
export async function listCanvases(conversationId: number): Promise<CanvasInfo[]> {
  const sandboxEntries = await listSessionFiles(conversationId, CANVAS_ROOT);
  const prefix = `${CANVAS_ROOT}/`;
  const slugs = sandboxEntries
    .filter(
      (e) =>
        e.isDirectory &&
        e.path.startsWith(prefix) &&
        !e.path.slice(prefix.length).includes("/"),
    )
    .map((e) => e.path.slice(prefix.length));

  const canvases: CanvasInfo[] = [];
  for (const slug of slugs) {
    const info = await readCanvasInfo(conversationId, slug);
    if (info) {
      info.files = await filesForCanvas(conversationId, info);
      canvases.push(info);
    }
  }
  return canvases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Resolve a canvas by slug OR by display name (case-insensitive). */
export async function getCanvas(
  conversationId: number,
  slugOrName: string,
): Promise<CanvasInfo | null> {
  const ref = String(slugOrName ?? "").trim();
  if (!ref) return null;
  // Direct slug hit first (the sandbox folder name).
  const bySlug = await readCanvasInfo(conversationId, slugify(ref));
  if (bySlug && (await fileExists(bySlug.dir))) {
    bySlug.files = await filesForCanvas(conversationId, bySlug);
    return bySlug;
  }
  // Fall back to matching the manifest's display name.
  const all = await listCanvases(conversationId);
  return (
    all.find((c) => c.name.toLowerCase() === ref.toLowerCase()) ??
    all.find((c) => c.slug === slugify(ref)) ??
    null
  );
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory() || st.isFile();
  } catch {
    return false;
  }
}

export interface CreateCanvasInput {
  name: string;
  description?: string;
  title?: string;
  entryFile?: string;
}

/**
 * Create (or "ensure") a canvas project: `canvas/{slug}/` with a manifest and
 * a starter entry file when one doesn't exist yet. If a canvas with this name
 * already exists it is returned as-is (the AI then refines the existing files).
 */
export async function createCanvas(
  conversationId: number,
  input: CreateCanvasInput,
): Promise<CanvasInfo> {
  const name = String(input.name ?? input.title ?? "Untitled canvas").trim() || "Untitled canvas";
  const slug = slugify(name);
  const entryFile = (input.entryFile || DEFAULT_ENTRY).replace(/^\/+/, "");
  const dir = getCanvasDir(conversationId, slug);

  // Determine whether this canvas already exists by the PRESENCE OF A
  // MANIFEST — not by the dir existing (creating the dir below would make
  // readCanvasInfo return info for a brand-new canvas and skip the starter
  // entry file).
  let brandNew = false;
  try {
    await fs.access(
      // Intentionally blank catch: access() resolves if the manifest exists,
      // rejects (falsy) if it doesn't — that's the brand-new signal.
      await resolveSessionPath(conversationId, `${CANVAS_ROOT}/${slug}/${CANVAS_MANIFEST}`),
    );
  } catch {
    brandNew = true;
  }
  await fs.mkdir(dir, { recursive: true });

  const existing = brandNew ? null : await readCanvasInfo(conversationId, slug);
  const now = new Date().toISOString();
  const manifest: CanvasManifest = {
    name,
    description: String(input.description ?? existing?.description ?? "").trim(),
    entryFile,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeManifest(conversationId, slug, manifest);

  // Write a tiny starter entry file only when the canvas is brand-new and the
  // intended entry doesn't exist yet, so `canvas_create` alone leaves the user
  // with something to preview while the AI fills in the real content.
  if (!existing) {
    const entryPath = await resolveSessionPath(conversationId, `${CANVAS_ROOT}/${slug}/${entryFile}`);
    const entryExists = await fileExists(entryPath);
    if (!entryExists && entryFile.endsWith(".html")) {
      await fs.writeFile(
        entryPath,
        `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name.replace(/[<>&"]/g, "")}</title>\n  <link rel="stylesheet" href="./style.css" />\n</head>\n<body>\n  <main id="app"></main>\n  <script src="./script.js"></script>\n</body>\n</html>\n`,
        "utf-8",
      );
    }
  }

  const info = await readCanvasInfo(conversationId, slug);
  info!.files = await filesForCanvas(conversationId, info!);
  return info!;
}