import { NextResponse } from "next/server";
import { db } from "@/db";
import { directories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { indexDirectory } from "@/lib/fs/file-index";
import { setScanning, getWatcherStatus } from "@/lib/fs/watcher";
import { watcherEventBus, buildWatcherEventPayload } from "@/lib/fs/watcher-events";

/**
 * POST /api/watcher/scan
 *
 * Triggers a manual re-scan of all watched directories.
 * Returns immediately — the scan runs in the background.
 */
export async function POST() {
  const watchedDirs = await db
    .select()
    .from(directories)
    .where(eq(directories.watchEnabled, true))
    .all();

  if (watchedDirs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No watched directories to scan.",
      scanned: 0,
    });
  }

  // Fire-and-forget full re-index of all watched directories
  setScanning(true);
  Promise.all(
    watchedDirs.map((dir) =>
      indexDirectory(dir.id).then((count) => {
        console.log(`[watcher] Manual scan: indexed ${count} files in "${dir.label}"`);
      }),
    ),
  )
    .catch((err) => {
      console.error("[watcher] Manual scan error:", err);
    })
    .finally(() => {
      setScanning(false);
      // Emit final status so SSE clients get updated file counts
      const state = getWatcherStatus();
      buildWatcherEventPayload(
        { running: state.running, scanning: state.scanning, watchedDirs: state.watchedDirs },
        "status-change",
      ).then((payload) => watcherEventBus.emitEvent(payload));
    });

  return NextResponse.json({
    ok: true,
    message: `Scanning ${watchedDirs.length} watched director${watchedDirs.length === 1 ? "y" : "ies"}...`,
    scanned: watchedDirs.length,
  });
}
