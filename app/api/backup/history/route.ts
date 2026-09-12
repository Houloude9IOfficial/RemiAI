import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";
import { recordBackupHistory, type BackupHistoryData } from "@/lib/backup/export";

export interface HistoryEntry {
  id: number;
  exportedAt: string;
  totalSize: number;
  includesFiles: boolean;
  tableStats: Record<string, number>;
  uploadCount: number;
  avatarCount: number;
  skillCount: number;
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
 * POST /api/backup/history
 *
 * Records an export after the client has received the complete backup
 * response. The export route intentionally does not write this row because a
 * proxy can fail after the server has generated the response.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BackupHistoryData>;

    if (
      typeof body.exportedAt !== "string" ||
      typeof body.totalSize !== "number" ||
      !Number.isSafeInteger(body.totalSize) ||
      body.totalSize < 0 ||
      typeof body.includesFiles !== "boolean" ||
      !body.tableStats ||
      typeof body.tableStats !== "object" ||
      Array.isArray(body.tableStats) ||
      typeof body.uploadCount !== "number" ||
      !Number.isSafeInteger(body.uploadCount) ||
      body.uploadCount < 0 ||
      typeof body.avatarCount !== "number" ||
      !Number.isSafeInteger(body.avatarCount) ||
      body.avatarCount < 0 ||
      typeof body.skillCount !== "number" ||
      !Number.isSafeInteger(body.skillCount) ||
      body.skillCount < 0 ||
      typeof body.appVersion !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid backup history data." },
        { status: 400 },
      );
    }

    await recordBackupHistory(body as BackupHistoryData);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    console.error("[backup/history] Error recording history:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
      skillCount: row.skillCount,
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
