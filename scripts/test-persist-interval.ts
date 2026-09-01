/**
 * Regression tests for `periodicallyPersistMessages` (lib/chat/persist-interval.ts).
 *
 * Covers the "not all tools were shown after a refresh" class of bugs: the
 * persisted assistant message must contain EVERY tool call that streamed,
 * even edge cases like an invalid tool call whose `tool-input-error` chunk
 * arrives without a preceding `tool-input-start`, and it must never persist
 * half-formed parts (`input-streaming` with no input yet) that would render
 * as permanently-stuck loading cards.
 *
 * Run with: `npm test` (npx tsx scripts/test-persist-interval.ts)
 */
import assert from "node:assert/strict";
import type { UIMessage, UIMessageChunk } from "ai";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { periodicallyPersistMessages } from "../lib/chat/persist-interval";

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
  `);
  return drizzle(sqlite, { schema });
}

type TestDb = ReturnType<typeof makeDb>;

function streamFrom(chunks: Array<Record<string, unknown>>): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(c as unknown as UIMessageChunk);
      }
      controller.close();
    },
  });
}

async function persistedMessage(db: TestDb, conversationId: number, uiId: string) {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .all();
  const row = rows.find((r) => r.uiId === uiId);
  assert.ok(row, `expected persisted message ${uiId}`);
  // The `parts` column is drizzle json-mode — already parsed.
  return row.parts as unknown as Array<Record<string, unknown>>;
}

function toolPart(name: string) {
  return (p: Record<string, unknown>) =>
    typeof p.type === "string" && p.type === `tool-${name}`;
}

let passed = 0;
async function okAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nperiodicallyPersistMessages — tool parts survive persistence");

  // 1. A realistic multi-tool, multi-step stream: every tool call that
  //    streamed must be present in the final persisted message, in order,
  //    with its output attached.
  await okAsync("persists every tool call from a multi-step stream", async () => {
    const db = makeDb();
    const conv = 1;
    const chunks: Array<Record<string, unknown>> = [
      { type: "start", messageId: "msg-1" },
      { type: "start-step" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Let me look" },
      { type: "text-end", id: "t1" },
      { type: "tool-input-start", toolCallId: "c1", toolName: "read_file" },
      { type: "tool-input-available", toolCallId: "c1", toolName: "read_file", input: { path: "a.ts" } },
      { type: "tool-input-start", toolCallId: "c2", toolName: "search_files" },
      { type: "tool-input-available", toolCallId: "c2", toolName: "search_files", input: { query: "foo" } },
      { type: "tool-output-available", toolCallId: "c1", output: { content: "..." } },
      { type: "tool-output-available", toolCallId: "c2", output: { matches: [] } },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "tool-input-start", toolCallId: "c3", toolName: "write_file" },
      { type: "tool-input-available", toolCallId: "c3", toolName: "write_file", input: { path: "b.ts", content: "x" } },
      { type: "tool-output-available", toolCallId: "c3", output: { ok: true } },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "text-start", id: "t2" },
      { type: "text-delta", id: "t2", delta: "Done." },
      { type: "text-end", id: "t2" },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ];

    const original = [{ id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "build it" }] }];
    await periodicallyPersistMessages(
      conv,
      original,
      streamFrom(chunks),
      undefined,
      undefined,
      db,
    );

    const parts = await persistedMessage(db, conv, "msg-1");
    const tools = parts.filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"));
    assert.deepEqual(
      tools.map((t) => t.type),
      ["tool-read_file", "tool-search_files", "tool-write_file"],
    );
    for (const t of tools) {
      assert.equal(t.state, "output-available", `${t.type} must have its output`);
    }
    // Text from BOTH steps is present.
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join(" ");
    assert.ok(text.includes("Let me look"));
    assert.ok(text.includes("Done."));
  });

  // 2. An invalid tool call surfaces as `tool-input-error` WITHOUT a
  //    preceding `tool-input-start` — it must still be persisted (this was
  //    silently dropped before the fix, losing the call after a refresh).
  await okAsync("persists an invalid tool call (tool-input-error, no input-start)", async () => {
    const db = makeDb();
    const conv = 2;
    const chunks: Array<Record<string, unknown>> = [
      { type: "start", messageId: "msg-2" },
      { type: "start-step" },
      {
        type: "tool-input-error",
        toolCallId: "bad1",
        toolName: "load_tool_groups",
        input: { groups: "fs_write" },
        errorText: "Invalid arguments",
      },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ];

    await periodicallyPersistMessages(
      conv,
      [{ id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
      streamFrom(chunks),
      undefined,
      undefined,
      db,
    );

    const parts = await persistedMessage(db, conv, "msg-2");
    const bad = parts.find(toolPart("load_tool_groups"));
    assert.ok(bad, "invalid tool call must be persisted");
    assert.equal(bad.state, "output-error");
    assert.equal(bad.errorText, "Invalid arguments");
  });

  // 3. A tool output arriving without ANY recorded input (resumed/replayed
  //    stream edge case) is still persisted rather than dropped.
  await okAsync("persists a tool output that arrives without a prior input chunk", async () => {
    const db = makeDb();
    const conv = 3;
    const chunks: Array<Record<string, unknown>> = [
      { type: "start", messageId: "msg-3" },
      { type: "start-step" },
      { type: "tool-output-available", toolCallId: "orphan1", output: { ok: true } },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ];

    await periodicallyPersistMessages(
      conv,
      [{ id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
      streamFrom(chunks),
      undefined,
      undefined,
      db,
    );

    const parts = await persistedMessage(db, conv, "msg-3");
    const orphan = parts.find((p) => p.toolCallId === "orphan1");
    assert.ok(orphan, "orphaned tool output must be persisted");
    assert.equal(orphan.state, "output-available");
  });

  // 4. A snapshot that lands between `tool-input-start` and
  //    `tool-input-available` must never persist the half-formed part
  //    (no input → renders as a permanently-stuck loading card).
  await okAsync("never persists a part stuck at input-streaming (no input)", async () => {
    const db = makeDb();
    const conv = 4;
    const chunks: Array<Record<string, unknown>> = [
      { type: "start", messageId: "msg-4" },
      { type: "start-step" },
      // Deliberately ends before tool-input-available ever arrives.
      { type: "tool-input-start", toolCallId: "ghost1", toolName: "read_file" },
      { type: "finish-step" },
      { type: "finish", finishReason: "stop" },
    ];

    await periodicallyPersistMessages(
      conv,
      [{ id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
      streamFrom(chunks),
      undefined,
      undefined,
      db,
    );

    const parts = await persistedMessage(db, conv, "msg-4");
    assert.ok(
      !parts.some((p) => p.toolCallId === "ghost1"),
      "half-formed tool part must not be persisted",
    );
  });

  // 5. Re-running the same response id (resume/continuation) upserts the
  //    same row instead of duplicating it.
  await okAsync("resume upserts the same row (no duplicate messages)", async () => {
    const db = makeDb();
    const conv = 5;
    const base = { type: "start" as const, messageId: "msg-5" };
    const original = [{ id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }];

    await periodicallyPersistMessages(
      conv,
      original,
      streamFrom([
        { ...base },
        { type: "start-step" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "partial" },
        { type: "text-end", id: "t1" },
        { type: "finish-step" },
        { type: "finish", finishReason: "tool-calls" },
      ]),
      undefined,
      undefined,
      db,
    );
    await periodicallyPersistMessages(
      conv,
      original,
      streamFrom([
        { ...base },
        { type: "start-step" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "partial" },
        { type: "text-delta", id: "t1", delta: " + complete" },
        { type: "text-end", id: "t1" },
        { type: "tool-input-start", toolCallId: "c1", toolName: "web_fetch" },
        { type: "tool-input-available", toolCallId: "c1", toolName: "web_fetch", input: { url: "https://x" } },
        { type: "tool-output-available", toolCallId: "c1", output: { html: "<p>x</p>" } },
        { type: "finish-step" },
        { type: "finish", finishReason: "stop" },
      ]),
      undefined,
      undefined,
      db,
    );

    const rows = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conv))
      .all();
    assert.equal(rows.length, 1, "continuation must upsert, not duplicate");
    const parts = rows[0].parts as unknown as Array<Record<string, unknown>>;
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("");
    assert.ok(text.includes("complete"), "continuation text must merge into the same row");
    assert.ok(parts.some(toolPart("web_fetch")), "continuation tools must be present");
  });

  console.log(`\n✅ All ${passed} persistence tests passed.`);
}

main().catch((err) => {
  console.error("\n❌ Test run failed:", err);
  process.exit(1);
});
