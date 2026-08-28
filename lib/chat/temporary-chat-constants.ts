/**
 * Client-safe constants for temporary chats (no server imports — safe to
 * import from client components; the server-side cleanup lives in
 * lib/chat/temporary-chats.ts which imports the database).
 */

/** How long a temporary chat survives before being auto-deleted. */
export const TEMPORARY_CHAT_RETENTION_DAYS = 3;
