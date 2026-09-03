import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Canvas storage lifecycle test.
 *
 * Canvas files live inside a conversation's session-file sandbox, whose root
 * (SESSION_FILES_DIR) is derived from REMI_DATA_DIR at module load. Dynamic
 * import lets this test point the sandbox at a throwaway temp dir before the
 * module's consts are evaluated (static top-level imports would be hoisted
 * and evaluate against the default ./data).
 */

let tmpRoot = `${os.tmpdir()}/remi-canvas-test-${Date.now()}`;
fs.mkdirSync(tmpRoot, { recursive: true });
// macOS /var is a symlink to /private/var; the default os.tmpdir() path would
// trip the sandbox's realpath containment check (lexical vs resolved differ).
// Realpath the root first so descendants resolve to the same path.
tmpRoot = fs.realpathSync(tmpRoot);
process.env["REMI_DATA_DIR"] = tmpRoot;

async function main() {
  const {
    slugify,
    normalizeCanvasPath,
    getCanvasDir,
    readCanvasInfo,
    createCanvas,
    listCanvases,
    getCanvas,
    buildCanvasPreviewUrl,
    isCanvasTextFile,
    CANVAS_MANIFEST,
    DEFAULT_ENTRY,
  } = await import("../lib/canvas/storage");

  const conversationId = 42;

  // ── basics ────────────────────────────────────────────────────────
  assert.equal(slugify("My Cool App!"), "my-cool-app");
  assert.equal(slugify(""), "canvas");
  assert.equal(isCanvasTextFile("index.html"), true);
  assert.equal(isCanvasTextFile("logo.png"), false);

  // normalizeCanvasPath keeps paths inside the project.
  assert.equal(normalizeCanvasPath("my-cool-app", "style.css"), "canvas/my-cool-app/style.css");
  assert.equal(normalizeCanvasPath("my-cool-app", "/../etc/passwd"), "canvas/my-cool-app/passwd");

  // ── create → read → list → get ───────────────────────────────────
  const created = await createCanvas(conversationId, {
    name: "Guided Meditation",
    description: "a little tracker",
  });
  assert.equal(created.slug, "guided-meditation");
  assert.equal(created.entryFile, DEFAULT_ENTRY);
  assert.equal(created.name, "Guided Meditation");

  // Starter entry file exists.
  const dir = getCanvasDir(conversationId, created.slug);
  const entry = path.join(dir, DEFAULT_ENTRY);
  const entryText = await fsp.readFile(entry, "utf-8");
  assert.match(entryText, /<html/i);
  assert.ok((await fsp.stat(path.join(dir, CANVAS_MANIFEST))).isFile());

  // readCanvasInfo reproduces what create wrote.
  const reread = await readCanvasInfo(conversationId, created.slug);
  assert.ok(reread);
  assert.equal(reread!.name, "Guided Meditation");
  assert.equal(reread!.description, "a little tracker");
  assert.equal(reread!.entryFile, "index.html");

  // listCanvases / getCanvas resolve it.
  const listed = await listCanvases(conversationId);
  assert.ok(listed.some((c) => c.slug === "guided-meditation"));
  const bySlug = await getCanvas(conversationId, "guided-meditation");
  assert.equal(bySlug?.slug, "guided-meditation");

  // Creating the same name returns the existing canvas, not a duplicate.
  const again = await createCanvas(conversationId, { name: "Guided Meditation" });
  assert.equal(again.slug, "guided-meditation");
  const listedAfter = await listCanvases(conversationId);
  const matches = listedAfter.filter((c) => c.slug === "guided-meditation");
  assert.equal(matches.length, 1);

  // ── preview URL ──────────────────────────────────────────────────
  const url = buildCanvasPreviewUrl(conversationId, created.slug, created.entryFile);
  assert.equal(
    url,
    `/api/chat/${conversationId}/session-files/canvas/guided-meditation/index.html`,
  );

  // ── canonical per-file URLs in the canvas tool serialisation ─────
  // Canvas/session tool results must give the model canonical session-file
  // URLs (read_file/web_fetch only accept /api/chat/{id}/session-files/{path})
  // — a bare path like "canvas/movie-db/style.css" is NOT a valid URL.
  const { buildCanvasTools } = await import("../lib/canvas/tools");
  const canvasTools = buildCanvasTools({ conversationId }) as unknown as Record<
    string,
    { execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >;
  const opened = (await canvasTools.canvas_open!.execute({
    slug: "guided-meditation",
  })) as unknown as { files: Array<{ path: string; url: string | null }> };
  const openedEntry = opened.files.find((f) => f.path.endsWith("/index.html"));
  assert.ok(openedEntry, "canvas_open file listing includes index.html");
  assert.equal(
    openedEntry!.url,
    `/api/chat/${conversationId}/session-files/canvas/guided-meditation/index.html`,
    "canvas file entries carry the canonical session-file URL",
  );
  const createdResult = (await canvasTools.canvas_create!.execute({
    name: "Guided Meditation",
  })) as unknown as { files: Array<{ path: string; url: string | null }> };
  const createdEntry = createdResult.files.find((f) => f.path.endsWith("/index.html"));
  assert.ok(createdEntry?.url?.startsWith(`/api/chat/${conversationId}/session-files/canvas/`));

  // session_file_write / session_file_edit results include the canonical URL.
  const { buildSessionFileTools } = await import("../lib/session-files/tools");
  const sessionTools = buildSessionFileTools(conversationId) as unknown as Record<
    string,
    { execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >;
  const writeResult = (await sessionTools.session_file_write!.execute({
    path: "canvas/guided-meditation/style.css",
    content: "body { background: #123; }",
  })) as unknown as { path: string; url: string };
  assert.equal(
    writeResult.url,
    `/api/chat/${conversationId}/session-files/canvas/guided-meditation/style.css`,
    "session_file_write returns the canonical URL",
  );
  const editResult = (await sessionTools.session_file_edit!.execute({
    path: "canvas/guided-meditation/style.css",
    old_str: "#123",
    new_str: "#456",
  })) as unknown as { path: string; url: string };
  assert.equal(
    editResult.url,
    `/api/chat/${conversationId}/session-files/canvas/guided-meditation/style.css`,
    "session_file_edit returns the canonical URL",
  );

  // ── bare relativePath reads resolve inside the session sandbox ───
  // The model often passes the bare path it sees in canvas listings
  // (e.g. "canvas/movie-db/style.css") as `relativePath` WITHOUT rootId.
  // read_file/read_media/read_document must accept that form and resolve
  // it against the conversation's sandbox instead of failing validation.
  const { readFileTool } = await import("../lib/fs/tools");
  const readFileResult = (await readFileTool.execute({
    relativePath: "canvas/guided-meditation/style.css",
    _conversationId: conversationId,
  })) as { content: string };
  assert.equal(
    readFileResult.content,
    "body { background: #456; }",
    "read_file resolves a bare session relativePath against the sandbox",
  );

  // Schema must accept { relativePath } alone (no rootId, no url).
  const schemaCheck = readFileTool.parameters.safeParse({
    relativePath: "canvas/guided-meditation/style.css",
  });
  assert.equal(
    schemaCheck.success,
    true,
    "read_file schema accepts a bare session relativePath",
  );

  // ── cleanup ──────────────────────────────────────────────────────
  await fsp.rm(tmpRoot, { recursive: true, force: true });

  console.log("\n✅ All canvas storage tests passed.");
}

main().catch((error) => {
  console.error("\n❌ Canvas test failed:", error);
  process.exit(1);
});