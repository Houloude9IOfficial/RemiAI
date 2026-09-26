import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

async function main() {
  const temporaryData = await fs.mkdtemp(path.join(os.tmpdir(), "remiai-project-upgrade-"));
  process.env.REMI_DATA_DIR = temporaryData;
  let failed = false;
  try {
    const migrationsFolder = path.join(temporaryData, "old-migrations");
    await fs.cp(path.join(process.cwd(), "db/migrations"), migrationsFolder, { recursive: true });
    await fs.rm(path.join(migrationsFolder, "0054_projects.sql"));
    const journalPath = path.join(migrationsFolder, "meta/_journal.json");
    const journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry: { tag: string }) => entry.tag !== "0054_projects");
    await fs.writeFile(journalPath, JSON.stringify(journal));

    const { db, initializeApp } = await import("@/db");
    migrate(db, { migrationsFolder });
    const sqlite = new Database(path.join(temporaryData, "remiai.sqlite"));
    sqlite.exec(`CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      instructions TEXT DEFAULT '' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`);
    sqlite.prepare("INSERT INTO projects (name, description, instructions) VALUES (?, ?, ?)").run(
      "Legacy project", "Preserved description", "Preserved instructions",
    );
    sqlite.close();

    await initializeApp();
    const { GET: getProjects } = await import("@/app/api/projects/route");
    const { GET: getChats } = await import("@/app/api/conversations/route");
    const projectResponse = await getProjects();
    const chatResponse = await getChats(new Request("http://localhost/api/conversations?limit=40&unlinked=1"));
    assert.equal(projectResponse.status, 200);
    assert.equal(chatResponse.status, 200);
    const [project] = await projectResponse.json();
    assert.equal(project.name, "Legacy project");
    assert.equal(project.brief, "Preserved description");
    assert.equal(project.instructions, "Preserved instructions");
    assert.equal(project.notes, "");
    assert.equal(project.pinned, false);
    assert.deepEqual((await chatResponse.json()).conversations, []);
    console.log("Legacy project upgrade checks: PASS");
  } catch (error) {
    failed = true;
    console.error(error);
  } finally {
    await fs.rm(temporaryData, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  }
}

void main();
