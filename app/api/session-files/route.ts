import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
  SESSION_FILES_BASE,
  listSessionFiles,
} from "@/lib/session-files/storage";

export type SessionFilesOverviewEntry = {
  id: number;
  title: string;
  updatedAt: string;
  fileCount: number;
  totalSize: number;
};

/**
 * GET /api/session-files — overview of every conversation and its session
 * file sandbox (file count + total size). Used by the Files dashboard page.
 */
export async function GET() {
  // Discover which sandbox directories exist on disk
  let sandboxIds: number[] = [];
  try {
    const dirents = await fs.readdir(SESSION_FILES_BASE, {
      withFileTypes: true,
    });
    sandboxIds = dirents
      .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
      .map((d) => Number(d.name));
  } catch {
    // data/session-files doesn't exist yet — no files anywhere
  }
  const sandboxSet = new Set(sandboxIds);

  // All conversations, most recently updated first
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  // Stat each sandbox that exists (bounded — worst case is a handful of chats)
  const stats = await Promise.all(
    sandboxIds.map(async (id) => {
      try {
        const entries = await listSessionFiles(id, null);
        return {
          id,
          fileCount: entries.filter((e) => e.isFile).length,
          totalSize: entries.reduce((sum, e) => sum + e.size, 0),
        };
      } catch {
        return { id, fileCount: 0, totalSize: 0 };
      }
    }),
  );
  const statByConversation = new Map(stats.map((s) => [s.id, s]));

  const result: SessionFilesOverviewEntry[] = rows.map((row) => {
    const stat = statByConversation.get(row.id);
    const hasSandbox = sandboxSet.has(row.id);
    return {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
      fileCount: hasSandbox ? (stat?.fileCount ?? 0) : 0,
      totalSize: hasSandbox ? (stat?.totalSize ?? 0) : 0,
    };
  });

  return NextResponse.json({ conversations: result });
}
