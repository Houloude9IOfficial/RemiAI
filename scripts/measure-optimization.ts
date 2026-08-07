/* eslint-disable */
// TEMPORARY validation script — measures the before/after size of the model
// payload for real conversations in the dev database.
import Database from "better-sqlite3";
import path from "path";
import { optimizeMessageHistory, RECENT_MESSAGES_KEPT } from "../lib/chat/history-optimizer";
import { estimateTokenCount } from "../lib/utils";

const db = new Database(path.join(process.cwd(), "data", "remiai.sqlite"));

interface MsgRow {
  ui_id: string;
  role: string;
  parts: string;
  order_index: number;
}

function loadConversation(conversationId: number): { id: number; title: string; messages: MsgRow[] } {
  const conv = db.prepare("SELECT id, title FROM conversations WHERE id = ?").get(conversationId) as any;
  const msgs = db
    .prepare("SELECT ui_id, role, parts, order_index FROM messages WHERE conversation_id = ? ORDER BY order_index ASC")
    .all(conversationId) as MsgRow[];
  return { id: conv.id, title: conv.title, messages: msgs };
}

function toUI(m: MsgRow) {
  return {
    id: m.ui_id,
    role: m.role as "user" | "assistant" | "system",
    parts: JSON.parse(m.parts),
  };
}

function measure(msgs: any[], label: string) {
  const json = JSON.stringify(msgs);
  const tokens = estimateTokenCount(json);
  console.log(`  ${label.padEnd(42)} ${json.length.toLocaleString().padStart(12)} chars  ~${tokens.toLocaleString().padStart(8)} tokens`);
  return tokens;
}

// Pick the 6 largest conversations by stored message bytes
const biggest = db
  .prepare(
    `SELECT conversation_id, SUM(length(parts)) bytes, COUNT(*) msgs
     FROM messages GROUP BY conversation_id ORDER BY bytes DESC LIMIT 6`,
  )
  .all() as any[];

let totalBefore = 0;
let totalAfter = 0;

for (const b of biggest) {
  const conv = loadConversation(b.conversation_id);
  const uiMsgs = conv.messages.map(toUI);
  console.log(`\n=== conversation #${conv.id} (${conv.title.slice(0, 50)}) — ${b.msgs} messages, ${b.bytes.toLocaleString()} bytes stored ===`);

  const before = measure(uiMsgs, "raw history (as persisted)");
  const optimized = optimizeMessageHistory(uiMsgs);
  const after = measure(optimized, "after optimizeMessageHistory");
  const reduced = optimizeMessageHistory(uiMsgs, { keepRecent: 12 });
  const after12 = measure(reduced, "after optimizer + wider recent window (12)");

  const pct = ((before - after) / before) * 100;
  const pct12 = ((before - after12) / before) * 100;
  console.log(`  reduction: ${pct.toFixed(1)}% (keepRecent=8) | ${pct12.toFixed(1)}% (keepRecent=12)`);
  totalBefore += before;
  totalAfter += after12;
}

console.log(`\n=== TOTALS over top-6 conversations ===`);
console.log(`  before: ~${totalBefore.toLocaleString()} tokens`);
console.log(`  after (optimizer, keepRecent=12): ~${totalAfter.toLocaleString()} tokens`);
console.log(`  overall reduction: ${(((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1)}%`);
