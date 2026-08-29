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

  // ── cleanup ──────────────────────────────────────────────────────
  await fsp.rm(tmpRoot, { recursive: true, force: true });

  console.log("\n✅ All canvas storage tests passed.");
}

main().catch((error) => {
  console.error("\n❌ Canvas test failed:", error);
  process.exit(1);
});