/**
 * Server-side validation tests for the ChatGPT-style chat request flow.
 *
 * The client now sends only a small message delta to /api/chat; the server
 * reconstructs the full conversation from the `messages` table. These tests
 * exercise that reconstruction against a real drizzle + better-sqlite3 stack
 * (in-memory, so the dev database is never touched):
 *
 *   - delta merging appends new user messages and persists them,
 *   - already-persisted messages are deduped (safety tail / regenerate),
 *   - assistant-role deltas are used for context but never persisted,
 *   - regenerate truncates the stale target + everything after it,
 *   - legacy full-history payloads collapse correctly against the DB,
 *   - orderIndex stays contiguous so page reloads render in order.
 *
 * Run with: `npm test` (npx tsx scripts/test-chat-reconstruction.ts)
 */
import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import {
  reconstructConversationHistory,
  truncateAtMessageId,
  mergeDeltaMessages,
  MAX_DELTA_MESSAGES,
} from "../lib/chat/history-reconstruction";
import { asStringArray, normaliseTool } from "../lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────

function makeDb() {
  const sqlite = new Database(":memory:");
  // Mirrors db/schema.ts `messages` table (only the columns drizzle touches).
  sqlite.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ui_id TEXT NOT NULL,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      parts TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      order_index INTEGER NOT NULL,
      UNIQUE (conversation_id, ui_id)
    );
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL DEFAULT '',
      summary_message_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

type TestDb = ReturnType<typeof makeDb>["db"];

function user(id: string, text = `user text ${id}`): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}
function assistant(id: string, text = `assistant text ${id}`): UIMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

function seedRow(db: TestDb, conversationId: number, m: UIMessage, orderIndex: number) {
  db.insert(schema.messages)
    .values({
      uiId: m.id,
      conversationId,
      role: m.role,
      parts: m.parts,
      orderIndex,
    })
    .run();
}

function seedConversation(
  env: ReturnType<typeof makeDb>,
  id: number,
  summary = "",
  count = 0,
) {
  env.sqlite
    .prepare(
      "INSERT INTO conversations (id, summary, summary_message_count) VALUES (?, ?, ?)",
    )
    .run(id, summary, count);
}

async function persistedIds(db: TestDb, conversationId: number): Promise<string[]> {
  const rows = await db
    .select({ uiId: schema.messages.uiId })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.orderIndex))
    .all();
  return rows.map((r) => r.uiId);
}

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
async function okAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  // ── Pure: mergeDeltaMessages ─────────────────────────────────────────

  console.log("\nmergeDeltaMessages");
  {
    // 1. New user message is appended to history and flagged for persistence.
    ok("appends a new user delta", () => {
      const history = [user("u1"), assistant("a1")];
      const { merged, toPersist } = mergeDeltaMessages(history, [user("u2")]);
      assert.deepEqual(
        merged.map((m) => m.id),
        ["u1", "a1", "u2"],
      );
      assert.deepEqual(
        toPersist.map((m) => m.id),
        ["u2"],
      );
      // inputs are never mutated
      assert.equal(history.length, 2);
    });

    // 2. Already-persisted messages are deduped (bounded safety tail case).
    ok("dedupes messages already in the history", () => {
      const history = [user("u1"), assistant("a1")];
      const { merged, toPersist } = mergeDeltaMessages(history, [
        assistant("a1"),
        user("u1"),
        user("u2"),
      ]);
      assert.deepEqual(
        merged.map((m) => m.id),
        ["u1", "a1", "u2"],
      );
      assert.deepEqual(
        toPersist.map((m) => m.id),
        ["u2"],
      );
    });

    // 3. Assistant-role deltas join the model history but are NEVER persisted
    //    from the client (the response stream is the only source for those).
    ok("assistant deltas are merged but not persisted", () => {
      const history = [user("u1")];
      const { merged, toPersist } = mergeDeltaMessages(history, [
        assistant("a-partial"),
      ]);
      assert.deepEqual(
        merged.map((m) => m.id),
        ["u1", "a-partial"],
      );
      assert.deepEqual(toPersist, []);
    });
  }

  // ── Pure: truncateAtMessageId ────────────────────────────────────────

  console.log("\ntruncateAtMessageId");
  {
    ok("drops the regenerate target and everything after it", () => {
      const history = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];
      const out = truncateAtMessageId(history, "a1");
      assert.deepEqual(
        out.map((m) => m.id),
        ["u1"],
      );
    });

    ok("no-op when the messageId is not present", () => {
      const history = [user("u1"), assistant("a1")];
      assert.equal(truncateAtMessageId(history, "nope"), history);
    });

    ok("no-op when no messageId is provided", () => {
      const history = [user("u1"), assistant("a1")];
      assert.equal(truncateAtMessageId(history, undefined), history);
    });
  }

  // ── Integration: reconstructConversationHistory against real drizzle ─

  console.log("\nreconstructConversationHistory");

  // 4. First message in an empty conversation: appended + persisted at index 0.
  await okAsync("first message is persisted at orderIndex 0", async () => {
    const env = makeDb();
    const db = env.db;
    const history = await reconstructConversationHistory(db, {
      conversationId: 1,
      deltaMessages: [user("u1")],
    });
    assert.deepEqual(
      history.map((m) => m.id),
      ["u1"],
    );
    const rows = await db.select().from(schema.messages).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].uiId, "u1");
    assert.equal(rows[0].orderIndex, 0);
  });

  // 5. Follow-up: DB history + persisted assistant + new user delta.
  await okAsync("follow-up message is appended after persisted history", async () => {
    const env = makeDb();
    const db = env.db;
    const conv = 2;
    seedRow(db, conv, user("u1"), 0);
    seedRow(db, conv, assistant("a1"), 1);
    const history = await reconstructConversationHistory(db, {
      conversationId: conv,
      deltaMessages: [user("u2")],
    });
    assert.deepEqual(
      history.map((m) => m.id),
      ["u1", "a1", "u2"],
    );
    const rows = await db
      .select({ uiId: schema.messages.uiId, orderIndex: schema.messages.orderIndex })
      .from(schema.messages)
      .all();
    assert.equal(rows.length, 3);
    const u2 = rows.find((r) => r.uiId === "u2");
    assert.equal(u2?.orderIndex, 2);
  });

  // 6. Bounded safety tail: the server reconstructs, ignoring already-persisted
  //    messages the client re-sent alongside the new one.
  await okAsync(
    "safety-tail duplicates are dropped and only the new user message is persisted",
    async () => {
      const env = makeDb();
      const db = env.db;
      const conv = 3;
      seedRow(db, conv, user("u1"), 0);
      seedRow(db, conv, assistant("a1"), 1);
      seedRow(db, conv, user("u2"), 2);
      seedRow(db, conv, assistant("a2"), 3);
      // Client sends [u2, a2, u3] (last 3 of its state) — u2/a2 already persisted.
      const history = await reconstructConversationHistory(db, {
        conversationId: conv,
        deltaMessages: [user("u2"), assistant("a2"), user("u3")],
      });
      assert.deepEqual(
        history.map((m) => m.id),
        ["u1", "a1", "u2", "a2", "u3"],
      );
      assert.deepEqual(await persistedIds(db, conv), ["u3", "a2", "u2", "a1", "u1"]);
      assert.equal((await db.select().from(schema.messages).all()).length, 5);
    },
  );

  // 7. Regenerate: stale target + everything after is truncated from the model
  //    history AND removed from the DB (mirroring the DELETE endpoint), even
  //    if the client's DELETE raced and left rows behind. The stale summary is
  //    reset so it can't describe messages that no longer exist.
  await okAsync("regenerate truncates stale rows from both history and DB", async () => {
    const env = makeDb();
    const db = env.db;
    const conv = 4;
    seedConversation(env, conv, "covers u1..a2", 4);
    seedRow(db, conv, user("u1"), 0);
    seedRow(db, conv, assistant("a1"), 1);
    seedRow(db, conv, user("u2"), 2);
    seedRow(db, conv, assistant("a2"), 3);
    // Client truncated state to [u1, u2] and regenerates a1... but the DELETE
    // endpoint found nothing persisted (interrupted run), so rows remain.
    const history = await reconstructConversationHistory(db, {
      conversationId: conv,
      deltaMessages: [user("u2")],
      trigger: "regenerate-message",
      messageId: "a1",
    });
    assert.deepEqual(
      history.map((m) => m.id),
      ["u1", "u2"],
    );
    // Stale rows (a1, u2, a2) were removed; u2 re-persisted in the merge.
    const rows = await db
      .select({ uiId: schema.messages.uiId, orderIndex: schema.messages.orderIndex })
      .from(schema.messages)
      .all();
    assert.deepEqual(
      rows.map((r) => [r.uiId, r.orderIndex]),
      [
        ["u1", 0],
        ["u2", 1],
      ],
    );
    // Summary describing the deleted segment is cleared.
    const convRow = await db
      .select({
        summary: schema.conversations.summary,
        summaryMessageCount: schema.conversations.summaryMessageCount,
      })
      .from(schema.conversations)
      .all();
    assert.equal(convRow[0].summary, "");
    assert.equal(convRow[0].summaryMessageCount, 0);
  });

  // 8. Regenerate on a clean DB (client already deleted): no-op truncate +
  //    delta dedupe → same history as the UI.
  await okAsync("regenerate on an already-trimmed DB is stable", async () => {
    const env = makeDb();
    const db = env.db;
    const conv = 5;
    seedRow(db, conv, user("u1"), 0);
    seedRow(db, conv, assistant("a1"), 1);
    const history = await reconstructConversationHistory(db, {
      conversationId: conv,
      deltaMessages: [assistant("a1"), user("u2")],
      trigger: "regenerate-message",
      messageId: "a2", // not in history → no-op
    });
    assert.deepEqual(
      history.map((m) => m.id),
      ["u1", "a1", "u2"],
    );
  });

  // 9. Legacy full-history payload (an old client uploading everything): every
  //    already-persisted message is deduped; only genuinely new USER messages
  //    are appended + persisted. Client-sent assistant messages never get
  //    persisted (the response stream is the only source for those).
  await okAsync("legacy full-history payloads collapse correctly against the DB", async () => {
    const env = makeDb();
    const db = env.db;
    const conv = 6;
    seedRow(db, conv, user("u1"), 0);
    seedRow(db, conv, assistant("a1"), 1);
    const full = [user("u1"), assistant("a1"), user("u2"), assistant("a2")];
    const history = await reconstructConversationHistory(db, {
      conversationId: conv,
      deltaMessages: full,
    });
    // Model history: everything, in order.
    assert.deepEqual(
      history.map((m) => m.id),
      ["u1", "a1", "u2", "a2"],
    );
    // Persisted rows: only the new user message is written (a2 is an
    // assistant delta — merged for context, never persisted from the client).
    const rows = await db.select().from(schema.messages).all();
    assert.equal(rows.length, 3);
    const u2 = rows.find((r) => r.uiId === "u2");
    assert.equal(u2?.orderIndex, 2);
  });

  // 10. Reconstructing twice with the same delta is idempotent (retry safety).
  await okAsync("re-running the same delta is idempotent", async () => {
    const env = makeDb();
    const db = env.db;
    const conv = 7;
    await reconstructConversationHistory(db, {
      conversationId: conv,
      deltaMessages: [user("u1")],
    });
    const again = await reconstructConversationHistory(db, {
      conversationId: conv,
      deltaMessages: [user("u1")],
    });
    assert.deepEqual(
      again.map((m) => m.id),
      ["u1"],
    );
    assert.equal((await db.select().from(schema.messages).all()).length, 1);
  });

  // ── Tool arg normalisation (load_tool_groups "groups.filter is not a
  //    function" regression) ──────────────────────────────────────────

  console.log("\nasStringArray (tool arg normalisation)");
  {
    ok("accepts a proper array and trims/dedupes", () => {
      assert.deepEqual(
        asStringArray([" fs_write ", "fs_read", "fs_write"]),
        ["fs_write", "fs_read"],
      );
    });

    // The exact failure from the wild: the model passed a comma-separated
    // STRING, and `groups.filter(...)` in load_tool_groups' execute threw
    // "groups.filter is not a function". A string must never reach execute
    // as-is — it is split into a usable list.
    ok("splits a comma-separated string (the reported crash input)", () => {
      assert.deepEqual(
        asStringArray("fs_write, fs_read"),
        ["fs_write", "fs_read"],
      );
      assert.deepEqual(asStringArray("fs_write"), ["fs_write"]);
      assert.deepEqual(asStringArray("  fs_write , , fs_read "), [
        "fs_write",
        "fs_read",
      ]);
    });

    ok("missing / non-string, non-array input collapses to []", () => {
      assert.deepEqual(asStringArray(undefined), []);
      assert.deepEqual(asStringArray(null), []);
      assert.deepEqual(asStringArray(42), []);
      assert.deepEqual(asStringArray({ groups: "fs_write" }), []);
    });
  }

  console.log("\nnormaliseTool (SDK v7 inputSchema)");
  {
    ok("maps the legacy `parameters` key to `inputSchema`", () => {
      const schemaObj = { type: "object" };
      const legacy = { description: "x", parameters: schemaObj, execute: () => "y" };
      const upgraded = normaliseTool(legacy) as Record<string, unknown>;
      assert.equal(upgraded.inputSchema, schemaObj);
      assert.equal(upgraded.parameters, undefined);
      assert.equal(upgraded.execute, legacy.execute);
    });

    ok("leaves SDK v7 tools (inputSchema) untouched", () => {
      const v7 = { description: "x", inputSchema: { type: "object" }, execute: () => "y" };
      assert.equal(normaliseTool(v7), v7);
    });
  }

  // ── Const sanity ─────────────────────────────────────────────────────

  console.log("\nschema");
  ok("MAX_DELTA_MESSAGES is a sane bound", () => {
    assert.ok(MAX_DELTA_MESSAGES >= 10 && MAX_DELTA_MESSAGES <= 1000);
  });

  console.log(`\n✅ All ${passed} tests passed.`);
}

main().catch((err) => {
  console.error("\n❌ Test run failed:", err);
  process.exit(1);
});
