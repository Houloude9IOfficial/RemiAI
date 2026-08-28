import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { TEMPORARY_CHAT_RETENTION_DAYS } from "./temporary-chat-constants";
import { deleteConversationUploads } from "./cleanup";
import { deleteConversationSessionFiles } from "@/lib/session-files/storage";

/** Retention window in milliseconds. */
export const TEMPORARY_CHAT_RETENTION_MS =
  TEMPORARY_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Delete temporary chats that haven't been touched for the retention period.
 * Runs once at server boot (see instrumentation.ts / db.initializeApp) and is
 * idempotent. Conversation rows cascade their messages/todos/artifacts/etc.;
 * uploads and the session-files sandbox are cleaned up per row, matching the
 * DELETE conversation route.
 *
 * @returns the number of temporary chats deleted.
 */
export async function cleanupExpiredTemporaryChats(): Promise<number> {
  const cutoff = new Date(Date.now() - TEMPORARY_CHAT_RETENTION_MS).toISOString();
  const expired = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.isTemporary, true),
        lt(conversations.updatedAt, cutoff),
      ),
    )
    .all();

  let deleted = 0;
  for (const row of expired) {
    try {
      await db.delete(conversations).where(eq(conversations.id, row.id)).run();
      await deleteConversationUploads(row.id);
      await deleteConversationSessionFiles(row.id);
      deleted += 1;
    } catch (err) {
      console.error(`[temporary-chats] Failed to delete expired chat ${row.id}:`, err);
    }
  }

  if (deleted > 0) {
    console.log(`[temporary-chats] Deleted ${deleted} expired temporary chat(s)`);
  }
  return deleted;
}
