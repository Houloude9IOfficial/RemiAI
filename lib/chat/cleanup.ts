import path from "node:path";
import fs from "node:fs/promises";

/**
 * Upload base directory — must match the path in app/api/chat/upload/route.ts
 */
const UPLOAD_BASE = path.join(process.cwd(), "data", "uploads");

/**
 * Delete all uploaded files for a conversation.
 * Uses `force: true` so it doesn't throw if no uploads directory exists.
 */
export async function deleteConversationUploads(conversationId: number): Promise<void> {
  const uploadDir = path.join(UPLOAD_BASE, String(conversationId));
  await fs.rm(uploadDir, { recursive: true, force: true });
}
