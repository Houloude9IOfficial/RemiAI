import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  buildPartsFromSteps,
  buildRunSummary,
  checksFromSteps,
  saveBuildRun,
  summarizeChangedFiles,
  updateBuildRunCheckpoint,
} from "../lib/build/runs";
import { buildBuildContinuationPrompt } from "../lib/chat/build-continuation";
import {
  advanceBuildRepairState,
  MAX_BUILD_REPAIR_ATTEMPTS,
} from "../lib/chat/build-repair";
import { buildBoundedLineDiff } from "../lib/build/diff";

async function main() {
  const steps = [
    {
      toolResults: [
        {
          toolName: "edit_file",
          input: { relativePath: "src\\index.ts" },
          output: {
            path: "src\\index.ts",
            bytesChanged: 20,
            linesAdded: 2,
            linesRemoved: 1,
          },
        },
        {
          toolName: "bash_execute",
          input: { command: "npm test" },
          output: { exitCode: 0, timedOut: false },
        },
      ],
    },
    {
      toolResults: [
        {
          toolName: "bash_execute",
          input: { command: "npm run build" },
          output: { exitCode: 1, timedOut: false },
        },
      ],
    },
  ];

  const parts = buildPartsFromSteps(steps);
  const checks = checksFromSteps(steps);
  const files = summarizeChangedFiles(parts);

  assert.equal(checks.length, 2);
  assert.equal(checks[0].status, "passed");
  assert.equal(checks[1].status, "failed");
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/index.ts");
  assert.equal(files[0].kind, "edit");
  assert.equal(
    buildRunSummary(files, checks, "failed"),
    "Build run needs attention: 1 file changed; 1 passed, 1 failed.",
  );

  const preview = buildBoundedLineDiff("title\nold line\nfooter", "title\nnew line\nfooter");
  assert.match(preview ?? "", /- old line/);
  assert.match(preview ?? "", /\+ new line/);
  assert.equal(buildBoundedLineDiff("same", "same"), undefined);

  const sessionFiles = summarizeChangedFiles([
    ...parts,
    {
      type: "tool-session_file_edit",
      input: { path: "reports/result.md" },
      output: {
        relativePath: "reports/result.md",
        linesAdded: 3,
        linesRemoved: 1,
        diffPreview: preview,
      },
    },
  ]);
  const reopened = sessionFiles.find((file) => file.path === "reports/result.md");
  assert.equal(reopened?.openable, true);
  assert.match(reopened?.diffPreview ?? "", /new line/);

  const longPreview = buildBoundedLineDiff("old\n".repeat(100), "new\n".repeat(100), {
    maxLines: 5,
    maxChars: 120,
  });
  assert.match(longPreview ?? "", /truncated/);

  const continuation = buildBuildContinuationPrompt({
    task: "Fix the page",
    status: "failed",
    error: "npm test failed",
    checkpointStep: 3,
  });
  assert.match(continuation, /Continue the previous Build task/);
  assert.match(continuation, /npm test failed/);
  assert.match(continuation, /checkpoint at step 3/);

  const resumePrompt = buildBuildContinuationPrompt({
    task: "Finish the page",
    status: "running",
    checkpointStep: 4,
  });
  assert.match(resumePrompt, /left in progress/);

  const passedState = advanceBuildRepairState(
    { attempt: 0, lastFailureSignature: "" },
    checks.slice(0, 1),
  );
  assert.equal(passedState.hasFailure, false);
  const firstRepair = advanceBuildRepairState(
    { attempt: 0, lastFailureSignature: "" },
    [checks[1]],
  );
  assert.equal(firstRepair.attempt, 1);
  assert.equal(firstRepair.phase, "repairing");
  const repeatedRepair = advanceBuildRepairState(
    {
      attempt: firstRepair.attempt,
      lastFailureSignature: firstRepair.lastFailureSignature,
    },
    [checks[1]],
  );
  assert.equal(repeatedRepair.attempt, 1);
  const secondRepair = advanceBuildRepairState(
    {
      attempt: firstRepair.attempt,
      lastFailureSignature: firstRepair.lastFailureSignature,
    },
    [checks[1], { ...checks[1], command: "npm run build --retry" }],
  );
  assert.equal(secondRepair.attempt, MAX_BUILD_REPAIR_ATTEMPTS);

  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE build_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      source_run_id TEXT,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      definition_of_done TEXT NOT NULL DEFAULT '[]',
      changed_files TEXT NOT NULL DEFAULT '[]',
      checks TEXT NOT NULL DEFAULT '[]',
      checkpoint TEXT,
      result_artifact_id INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  sqlite.prepare("INSERT INTO conversations (id) VALUES (1), (2)").run();
  const testDb = drizzle(sqlite, { schema });

  const first = await saveBuildRun(testDb, {
    conversationId: 1,
    sourceRunId: "run-1",
    task: "Fix the application",
    status: "failed",
    definitionOfDone: ["Run tests"],
    changedFiles: files,
    checks,
    summary: "Needs attention",
    error: "Build failed",
  });
  assert.equal(first.conversationId, 1);
  assert.equal(first.status, "failed");
  assert.deepEqual(first.changedFiles, files);
  assert.deepEqual(first.checks, checks);

  await updateBuildRunCheckpoint(testDb, first.id, {
    step: 2,
    phase: "verifying",
    repairAttempt: 0,
    changedFiles: files,
    checks,
    updatedAt: new Date().toISOString(),
  });
  const checkpointed = (await testDb.select().from(schema.buildRuns).all()).find(
    (run) => run.id === first.id,
  );
  assert.equal(checkpointed?.status, "running");
  assert.equal((checkpointed?.checkpoint as { step?: number } | null)?.step, 2);

  const second = await saveBuildRun(testDb, {
    conversationId: 2,
    task: "Separate chat run",
    status: "completed",
    definitionOfDone: [],
    changedFiles: [],
    checks: [],
    summary: "Completed",
  });
  assert.notEqual(second.conversationId, first.conversationId);
  assert.equal((await testDb.select().from(schema.buildRuns).all()).length, 2);

  console.log("\n✅ All Build run tests passed.");
}

main().catch((error) => {
  console.error("\n❌ Build run test failed:", error);
  process.exit(1);
});
