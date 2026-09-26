import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { SESSION_FILES_BASE, listSessionFiles } from "@/lib/session-files/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LibraryFile = {
  conversationId: number;
  conversationTitle: string;
  path: string;
  name: string;
  size: number;
  mtime: string;
  url: string;
};

/**
 * GET /api/library — every file from every retained chat, newest first.
 * Files remain private to their conversation; this is an index only.
 */
export async function GET() {
  let sandboxIds: number[] = [];
  try {
    const dirents = await fs.readdir(SESSION_FILES_BASE, { withFileTypes: true });
    sandboxIds = dirents
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number(entry.name));
  } catch {
    // No chat has created a sandbox yet.
  }

  const rows = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));
  const titles = new Map(rows.map((row) => [row.id, row.title]));

  const nestedFiles = await Promise.all(
    sandboxIds.map(async (conversationId) => {
      const conversationTitle = titles.get(conversationId);
      if (!conversationTitle) return [] as LibraryFile[];
      try {
        const entries = await listSessionFiles(conversationId, null);
        return entries
          .filter((entry) => entry.isFile)
          .map((entry) => ({
            conversationId,
            conversationTitle,
            path: entry.path,
            name: entry.name,
            size: entry.size,
            mtime: entry.mtime,
            url: `/api/chat/${conversationId}/session-files/${entry.path
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`,
          }));
      } catch {
        return [] as LibraryFile[];
      }
    }),
  );

  const files = nestedFiles.flat().sort(
    (a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime(),
  );
  return NextResponse.json({ files });
}
