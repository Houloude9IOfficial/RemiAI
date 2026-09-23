import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
const temporaryData = await fs.mkdtemp(path.join(os.tmpdir(), "remiai-projects-"));
process.env.REMI_DATA_DIR = temporaryData;

let failed = false;
try {
  const { db, initializeApp } = await import("@/db");
  const { conversations, projects } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const projectRoutes = await import("@/app/api/projects/route");
  const projectRoute = await import("@/app/api/projects/[id]/route");
  const reorderRoute = await import("@/app/api/projects/reorder/route");
  const chatRoutes = await import("@/app/api/conversations/route");
  const chatRoute = await import("@/app/api/conversations/[id]/route");
  const fileRoutes = await import("@/app/api/projects/[id]/files/route");
  const { getSessionDir } = await import("@/lib/session-files/storage");
  const { buildProjectContext } = await import("@/lib/projects/context");
  const { buildProjectTools } = await import("@/lib/projects/tools");
  const { readProjectFile, writeProjectFile } = await import("@/lib/projects/storage");
  const { PROJECT_FILES_DIR } = await import("@/lib/paths");
  await initializeApp();

  const json = (data: unknown, method = "POST") => new Request("http://localhost", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const projectResponse = await projectRoutes.POST(json({ name: "Atlas", brief: "Mars mission", instructions: "Use metric units" }));
  assert.equal(projectResponse.status, 201);
  const project = await projectResponse.json();
  const secondProject = await (await projectRoutes.POST(json({ name: "Orion" }))).json();
  assert.equal((await reorderRoute.POST(json({ ids: [secondProject.id, project.id] }))).status, 200);
  assert.equal((await (await projectRoutes.GET()).json())[0].id, secondProject.id);
  assert.equal((await projectRoute.PATCH(json({ notes: "Launch in 2030" }, "PATCH"), { params: Promise.resolve({ id: String(project.id) }) })).status, 200);
  const chatResponse = await chatRoutes.POST(json({ projectId: project.id }));
  assert.equal(chatResponse.status, 201);
  const chat = await chatResponse.json();
  assert.equal(chat.projectId, project.id);
  const unlinkedChat = await (await chatRoutes.POST(json({}))).json();
  const recent = await (await chatRoutes.GET(new Request("http://localhost/api/conversations?limit=20&unlinked=1"))).json();
  assert.deepEqual(recent.conversations.map((item: { id: number }) => item.id), [unlinkedChat.id]);
  assert.equal((await chatRoute.PATCH(json({ projectId: 999999 }, "PATCH"), { params: Promise.resolve({ id: String(chat.id) }) })).status, 404);

  const fileForm = new FormData();
  fileForm.set("file", new File(["Shared draft"], "brief.md", { type: "text/markdown" }));
  assert.equal((await fileRoutes.POST(new Request("http://localhost", { method: "POST", body: fileForm }), { params: Promise.resolve({ id: String(project.id) }) })).status, 201);
  const fileList = await fileRoutes.GET(new Request("http://localhost"), { params: Promise.resolve({ id: String(project.id) }) });
  assert.equal((await fileList.json()).files[0].name, "brief.md");
  await assert.rejects(() => readProjectFile(secondProject.id, "brief.md"));
  await assert.rejects(() => writeProjectFile(project.id, "../escape.txt", Buffer.from("bad")), /traversal/);
  const outside = path.join(temporaryData, "outside.txt");
  await fs.writeFile(outside, "Outside");
  await fs.symlink(outside, path.join(PROJECT_FILES_DIR, String(project.id), "outside-link.txt"));
  await assert.rejects(() => readProjectFile(project.id, "outside-link.txt"), /Symlink/);
  assert.match(await buildProjectContext(project.id, ""), /Mars mission/);
  assert.match(await buildProjectContext(project.id, ""), /Launch in 2030/);
  assert.match(await buildProjectContext(null, `[project:${project.id}]`), /Shared draft|brief.md/);
  assert.equal(await buildProjectContext(null, "No project"), "");

  await fs.mkdir(getSessionDir(chat.id), { recursive: true });
  await fs.writeFile(path.join(getSessionDir(chat.id), "chat-only.txt"), "Keep me");
  const tools = buildProjectTools(chat.id) as Record<string, { execute: (input: Record<string, unknown>) => Promise<unknown> }>;
  assert.deepEqual(await tools.project_file_read.execute({ path: "brief.md" }), { content: "Shared draft", truncated: false });
  await chatRoute.PATCH(json({ memoryEnabled: false }, "PATCH"), { params: Promise.resolve({ id: String(chat.id) }) });
  await assert.rejects(() => tools.project_file_read.execute({ path: "brief.md" }), /Memory enabled/);
  await chatRoute.PATCH(json({ memoryEnabled: true }, "PATCH"), { params: Promise.resolve({ id: String(chat.id) }) });
  const { exportBackup } = await import("@/lib/backup/export");
  const { importBackupFile } = await import("@/lib/backup/import");
  const backup = await exportBackup("test-password", true);
  assert.equal(backup.stats.projectFiles, 1);
  assert.equal((await projectRoute.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: String(project.id) }) })).status, 200);
  const surviving = await db.select().from(conversations).where(eq(conversations.id, chat.id)).get();
  assert.equal(surviving?.projectId, null);
  assert.equal(await fs.readFile(path.join(getSessionDir(chat.id), "chat-only.txt"), "utf8"), "Keep me");
  assert.deepEqual((await db.select({ id: projects.id }).from(projects)).map((row) => row.id), [secondProject.id]);
  await assert.rejects(() => readProjectFile(project.id, "brief.md"));
  const backupPath = path.join(temporaryData, "backup-downloads", `${backup.staged.token}.pending.remi-backup`);
  const restored = await importBackupFile(backupPath, "test-password");
  assert.equal(restored.files.projectFiles, 1);
  assert.equal((await db.select().from(conversations).where(eq(conversations.id, chat.id)).get())?.projectId, project.id);
  assert.equal((await readProjectFile(project.id, "brief.md")).toString("utf8"), "Shared draft");
  console.log("Project integration checks: PASS");
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await fs.rm(temporaryData, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
}

void main();
