import path from "node:path";
import fs from "node:fs/promises";

/**
 * Legacy upload base directory — matches the old app/api/chat/upload/route.ts
 * path. Chat uploads now live in the conversation's session sandbox under
 * `uploads/` (data/session-files/{conversationId}/uploads/), which is cleaned
 * up by deleteConversationSessionFiles. This handles leftover files from
 * before that change.
 */
const UPLOAD_BASE = path.join(process.cwd(), "data", "uploads");

/**
 * Delete all legacy uploaded files for a conversation.
 * Uses `force: true` so it doesn't throw if no uploads directory exists.
 */
export async function deleteConversationUploads(conversationId: number): Promise<void> {
  const uploadDir = path.join(UPLOAD_BASE, String(conversationId));
  await fs.rm(uploadDir, { recursive: true, force: true });
}
