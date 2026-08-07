import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { UIMessage } from "ai";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

/**
 * ChatGPT-style conversation reconstruction.
 *
 * The client no longer re-sends the entire message history on every message
 * (that is what caused HTTP 413 payload-too-large errors and re-serialization
 * lag on long chats). Instead the request carries only a small **delta** —
 * the newest message(s) the server may not have persisted yet — and this
 * module rebuilds the full conversation from the `messages` table:
 *
 *   1. Load every persisted message for the conversation, in order.
 *   2. On a `regenerate-message` request, drop the regenerate target and
 *      everything after it (mirrors the client's DELETE endpoint, and is a
 *      safety net if that delete raced or found nothing persisted).
 *   3. Merge the client's delta into the loaded history:
 *      - messages whose `uiId` is already present are skipped (dedupe),
 *      - NEW user messages are appended AND persisted to the DB,
 *      - NEW assistant messages are appended to the model history but never
 *        persisted from the client — assistant messages are only ever
 *        persisted from the server-side response stream.
 *
 * The result is the same full, ordered conversation the client used to send,
 * minus the payload. Note this module deliberately avoids importing `@/db`
 * (the singleton opens the real database and starts watchers/scheduler); it
 * receives the database as an argument so the route and the server-side tests
 * can both drive it.
 */

/**
 * Regenerate semantics: on `regenerate-message` requests the in-memory
 * truncation alone is not enough — stale rows at/after the target can survive
 * in the DB (e.g. the client's DELETE endpoint raced or found nothing), and
 * the next response is persisted at `orderIndex = originalMessages.length`,
 * which could then collide with a leftover row's order_index (no unique
 * constraint) and corrupt reload ordering. So the server mirrors the client's
 * DELETE endpoint: it also removes those rows and resets the rolling summary
 * that may describe the now-deleted segment. When the target is not found in
 * the DB there is nothing stale to remove — the full DB history is used
 * (the server is the source of truth).
 */

/**
 * Upper bound on client-supplied delta messages. New clients send ~1–3; a
 * legacy/stale client may still send the full history (deduped against the
 * DB below). Anything beyond this is a malformed request.
 */
export const MAX_DELTA_MESSAGES = 200;

/** The `trigger` field the AI SDK transport sends with every request. */
export type ChatRequestTrigger = "submit-message" | "regenerate-message";

/**
 * Convert a persisted message row back to a UIMessage. This mirrors
 * `toUIMessage` in `lib/chat/persist.ts`, kept local so this module stays
 * free of the `@/db` singleton import (see module docs above).
 */
function rowToUIMessage(row: typeof schema.messages.$inferSelect): UIMessage {
  return {
    id: row.uiId,
    role: row.role,
    parts: row.parts as UIMessage["parts"],
  };
}

/**
 * Drop a message and everything after it from an in-memory history.
 *
 * Used for `regenerate-message` requests: the client already deletes those
 * rows via `DELETE /api/chat/:id/messages`, but if that delete raced or the
 * rows were never persisted, this guarantees the model never sees the stale
 * response it is supposed to be regenerating. Returns a NEW array.
 *
 * @param messageId uiId of the message being regenerated (the target and
 *                  everything after it are dropped). No-op when undefined
 *                  or not found.
 */
export function truncateAtMessageId(
  history: UIMessage[],
  messageId?: string,
): UIMessage[] {
  if (!messageId) return history;
  const index = history.findIndex((m) => m.id === messageId);
  if (index === -1) return history;
  return history.slice(0, index);
}

/**
 * Merge the client's delta messages into the loaded DB history.
 *
 * - A delta message whose `uiId` already exists in the history is skipped —
 *   this is what makes the bounded safety tail, legacy full-history payloads,
 *   and regenerate requests all safe: already-persisted messages are simply
 *   ignored.
 * - Only `user`-role delta messages are returned in `toPersist`. Assistant
 *   messages are persisted exclusively from the server-side response stream
 *   (the client's copy may still carry `streaming` state or stale parts).
 *
 * Returns a NEW merged array; the inputs are never mutated.
 */
export function mergeDeltaMessages(
  history: UIMessage[],
  delta: UIMessage[],
): { merged: UIMessage[]; toPersist: UIMessage[] } {
  const known = new Set(history.map((m) => m.id));
  const merged = [...history];
  const toPersist: UIMessage[] = [];

  for (const message of delta) {
    if (known.has(message.id)) continue;
    known.add(message.id);
    merged.push(message);
    if (message.role === "user") toPersist.push(message);
  }

  return { merged, toPersist };
}

/**
 * Persist a single user message to the `messages` table (idempotent —
 * `onConflictDoNothing` on `(conversation_id, ui_id)`). This mirrors
 * `persistUIMessage` in `lib/chat/persist.ts`, kept local so this module
 * stays free of the `@/db` singleton import (see module docs above).
 */
async function persistDeltaMessage(
  database: BetterSQLite3Database<typeof schema>,
  conversationId: number,
  message: UIMessage,
): Promise<void> {
  const last = await database
    .select({ orderIndex: schema.messages.orderIndex })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.orderIndex))
    .limit(1)
    .get();

  await database
    .insert(schema.messages)
    .values({
      uiId: message.id,
      conversationId,
      role: message.role,
      parts: message.parts,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    })
    .onConflictDoNothing({
      target: [schema.messages.conversationId, schema.messages.uiId],
    });
}

/**
 * Rebuild the full conversation history for a request: load the persisted
 * messages, apply regenerate truncation, and merge + persist the client's
 * delta. This replaces the client-sent full history with a server-side
 * reconstruction so requests stay tiny regardless of conversation size.
 *
 * @returns the ordered, complete conversation (DB history + merged delta).
 */
export async function reconstructConversationHistory(
  database: BetterSQLite3Database<typeof schema>,
  opts: {
    conversationId: number;
    deltaMessages: UIMessage[];
    trigger?: string;
    messageId?: string;
  },
): Promise<UIMessage[]> {
  const { conversationId, deltaMessages, trigger, messageId } = opts;

  const rows = await database
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.orderIndex))
    .all();

  let history = rows.map(rowToUIMessage);

  // Regenerating an assistant message: never let the stale response (or
  // anything after it) reach the model. The client's DELETE endpoint removes
  // these rows first; this server-side pass is the authoritative safety net
  // (see the module doc above) and also clears the stale summary.
  if (trigger === "regenerate-message" && messageId) {
    const targetIndex = rows.findIndex((r) => r.uiId === messageId);
    if (targetIndex !== -1) {
      const targetOrderIndex = rows[targetIndex].orderIndex;
      const deleted = await database
        .delete(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, conversationId),
            gte(schema.messages.orderIndex, targetOrderIndex),
          ),
        )
        .returning({ id: schema.messages.id });

      if (deleted.length > 0) {
        // Mirror the DELETE endpoint: a regenerated segment is no longer
        // summarized — otherwise the stale summary could describe messages
        // that no longer exist.
        await database
          .update(schema.conversations)
          .set({ summary: "", summaryMessageCount: 0 })
          .where(eq(schema.conversations.id, conversationId));
      }

      history = truncateAtMessageId(history, messageId);
    }
  }

  const { merged, toPersist } = mergeDeltaMessages(history, deltaMessages);

  for (const message of toPersist) {
    await persistDeltaMessage(database, conversationId, message);
  }

  return merged;
}
