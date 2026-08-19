import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  saveBuildResultArtifact,
  saveSessionFileArtifact,
} from "../lib/artifacts/storage";

async function main() {
const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT
  );
  CREATE TABLE artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    source_run_id TEXT,
    path TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'file',
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    session_path TEXT,
    file_size INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
sqlite.prepare("INSERT INTO conversations (id) VALUES (1), (2)").run();

const testDb = drizzle(sqlite, { schema });
const first = await saveSessionFileArtifact(testDb, {
  conversationId: 1,
  sourceRunId: "run-1",
  path: "reports/result.md",
  name: "result.md",
  size: 42,
});
assert.equal(first?.conversationId, 1);
assert.equal(first?.version, 1);
assert.equal(first?.sessionPath, "reports/result.md");
assert.equal(first?.legacyPath, "reports/result.md");

const updated = await saveSessionFileArtifact(testDb, {
  conversationId: 1,
  sourceRunId: "run-2",
  path: "reports/result.md",
  name: "result.md",
  size: 84,
  message: "Updated report",
});
assert.equal(updated?.id, first?.id);
assert.equal(updated?.version, 2);
assert.equal(updated?.fileSize, 84);
assert.equal(updated?.title, "Updated report");
assert.equal(updated?.sourceRunId, "run-2");

const otherConversation = await saveSessionFileArtifact(testDb, {
  conversationId: 2,
  sourceRunId: "run-3",
  path: "reports/result.md",
  name: "result.md",
  size: 10,
});
assert.notEqual(otherConversation?.id, first?.id);
assert.equal(otherConversation?.conversationId, 2);

const buildResult = await saveBuildResultArtifact(testDb, {
  conversationId: 1,
  sourceRunId: "build-run-1",
  task: "Build the page",
  status: "completed",
  summary: "Build run completed",
  definitionOfDone: ["Run checks"],
  changedFiles: [{ path: "src/index.ts", kind: "edit", linesAdded: 2 }],
  checks: [{
    toolName: "bash_execute",
    command: "npm test",
    status: "passed",
    detail: "Exit 0",
  }],
});
assert.equal(buildResult?.type, "code");
assert.equal(buildResult?.status, "completed");
assert.equal((buildResult?.metadata as { artifactKind?: string }).artifactKind, "build-result");

const updatedBuildResult = await saveBuildResultArtifact(testDb, {
  conversationId: 1,
  sourceRunId: "build-run-1",
  task: "Build the page",
  status: "failed",
  summary: "Build run needs attention",
  definitionOfDone: ["Run checks"],
  changedFiles: [],
  checks: [],
});
assert.equal(updatedBuildResult?.id, buildResult?.id);
assert.equal(updatedBuildResult?.status, "failed");

const rows = await testDb.select().from(schema.artifacts).all();
assert.equal(rows.length, 3);
assert.deepEqual(
  rows.map((row) => row.conversationId).sort((a, b) => a - b),
  [1, 1, 2],
);

console.log("\n✅ All artifact tests passed.");
}

main().catch((error) => {
  console.error("\n❌ Artifact test failed:", error);
  process.exit(1);
});
