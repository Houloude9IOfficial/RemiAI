import { NextResponse } from "next/server";
import { getPermittedRoots } from "@/lib/fs/access";
import { getWatcherStatus } from "@/lib/fs/watcher";
import { db } from "@/db";
import { fileIndex } from "@/db/schema";
import { eq, count, max } from "drizzle-orm";

export async function GET() {
  const status = getWatcherStatus();
  const roots = await getPermittedRoots();

  // Get file counts per directory using individual queries (N+1, acceptable for few dirs)
  const dirFileCounts: Record<number, number> = {};
  for (const root of roots) {
    const result = await db
      .select({ c: count() })
      .from(fileIndex)
      .where(eq(fileIndex.directoryId, root.id))
      .all();
    dirFileCounts[root.id] = result[0]?.c ?? 0;
  }

  // Get total indexed file count and last update time via aggregation
  const [totalResult] = await db
    .select({ total: count() })
    .from(fileIndex)
    .all();

  const [latestResult] = await db
    .select({ latest: max(fileIndex.updatedAt) })
    .from(fileIndex)
    .all();

  const totalFiles = totalResult?.total ?? 0;
  const lastScanTime = latestResult?.latest ?? null;

  const watchEnabledIds = new Set(status.watchedDirs.map((w) => w.id));

  return NextResponse.json({
    running: status.running,
    scanning: status.scanning,
    totalFiles,
    lastScanTime,
    watchedDirs: roots.map((r) => ({
      id: r.id,
      label: r.label,
      path: r.path,
      watchEnabled: watchEnabledIds.has(r.id),
      indexedFiles: dirFileCounts[r.id] ?? 0,
      isWatched: watchEnabledIds.has(r.id),
    })),
  });
}
