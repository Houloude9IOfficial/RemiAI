import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";

export interface HistoryEntry {
  id: number;
  exportedAt: string;
  totalSize: number;
  includesFiles: boolean;
  tableStats: Record<string, number>;
  uploadCount: number;
  avatarCount: number;
  appVersion: string;
  createdAt: string;
}

/**
 * GET /api/backup/history
 *
 * Returns recent backup history entries, ordered by most recent first.
 *
 * Query params:
 *   limit?: number  — max entries to return (default 20, max 100)
 *
 * Response:
 *   { entries: HistoryEntry[] }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "20", 10) || 20, 1), 100);

    const rows = await db
      .select()
      .from(backupHistory)
      .orderBy(desc(backupHistory.createdAt))
      .limit(limit)
      .all();

    const entries: HistoryEntry[] = rows.map((row) => ({
      id: row.id,
      exportedAt: row.exportedAt,
      totalSize: row.totalSize,
      includesFiles: row.includesFiles,
      tableStats: row.tableStats,
      uploadCount: row.uploadCount,
      avatarCount: row.avatarCount,
      appVersion: row.appVersion,
      createdAt: row.createdAt,
    }));

    return NextResponse.json({ entries });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    console.error("[backup/history] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
