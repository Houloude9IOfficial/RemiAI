import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  extractSourceCandidates,
  sanitizeSourceUrl,
  recordCitedClaims,
  saveSource,
} from "../lib/research/source-storage";

async function main() {
  assert.equal(
    sanitizeSourceUrl("https://example.com/report?apiKey=secret&x=1#section"),
    "https://example.com/report?x=1",
  );

  const candidates = extractSourceCandidates(
    "brave_web_search",
    { query: "RemiAI" },
    {
      results: [
        {
          title: "RemiAI",
          url: "https://example.com/remiai",
          description: "A useful result",
        },
        {
          title: "Duplicate",
          url: "https://example.com/remiai#part-two",
        },
      ],
    },
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].publisher, null);
  assert.equal(candidates[0].url, "https://example.com/remiai");

  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      source_run_id TEXT,
      tool_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'web',
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      publisher TEXT NOT NULL DEFAULT '',
      retrieved_at TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      quality_score INTEGER NOT NULL DEFAULT 0,
      freshness_status TEXT NOT NULL DEFAULT 'unknown',
      extraction_status TEXT NOT NULL DEFAULT 'unavailable',
      status TEXT NOT NULL DEFAULT 'partial',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE source_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      source_run_id TEXT,
      claim_text TEXT NOT NULL,
      source_ids TEXT NOT NULL DEFAULT '[]',
      support_status TEXT NOT NULL DEFAULT 'unsupported',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  sqlite.prepare("INSERT INTO conversations (id) VALUES (1), (2)").run();
  const testDb = drizzle(sqlite, { schema });

  const first = await saveSource(testDb, {
    conversationId: 1,
    sourceRunId: "run-1",
    toolName: "web_fetch",
    candidate: {
      url: "https://example.com/report?token=hidden",
      title: "Report",
      content: "retrieved content",
      sourceType: "web",
      extractionStatus: "complete",
      status: "available",
    },
  });
  assert.equal(first?.conversationId, 1);
  assert.equal(first?.url, "https://example.com/report");
  assert.equal(first?.contentHash.length, 64);

  const updated = await saveSource(testDb, {
    conversationId: 1,
    sourceRunId: "run-2",
    toolName: "web_fetch",
    candidate: {
      url: "https://example.com/report",
      title: "Updated report",
      content: "new content",
      sourceType: "web",
      extractionStatus: "partial",
      status: "partial",
    },
  });
  assert.equal(updated?.id, first?.id);
  assert.equal(updated?.title, "Updated report");
  assert.equal(updated?.sourceRunId, "run-2");

  const otherConversation = await saveSource(testDb, {
    conversationId: 2,
    toolName: "web_fetch",
    candidate: { url: "https://example.com/report", title: "Other chat" },
  });
  assert.notEqual(otherConversation?.id, first?.id);
  assert.equal((await testDb.select().from(schema.sources).all()).length, 2);

  const cited = await saveSource(testDb, {
    conversationId: 1,
    sourceRunId: "run-4",
    toolName: "web_fetch",
    candidate: {
      url: "https://other.example/evidence",
      title: "Evidence",
      content: "verified evidence",
      sourceType: "web",
      extractionStatus: "complete",
      status: "available",
    },
  });
  const claims = await recordCitedClaims({
    database: testDb,
    conversationId: 1,
    sourceRunId: "run-4",
    answerText: "The evidence supports this conclusion [Evidence](https://other.example/evidence).",
  });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].supportStatus, "supported");
  const claimRow = (await testDb.select().from(schema.sourceClaims).all())[0];
  assert.deepEqual(claimRow.sourceIds, [cited?.id]);

  console.log("\n✅ All research source tests passed.");
}

main().catch((error) => {
  console.error("\n❌ Research source test failed:", error);
  process.exit(1);
});
