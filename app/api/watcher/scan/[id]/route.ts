import { NextResponse } from "next/server";
import { getRootById } from "@/lib/fs/access";
import { indexDirectory } from "@/lib/fs/file-index";
import { setScanning, getWatcherStatus } from "@/lib/fs/watcher";
import { watcherEventBus, buildWatcherEventPayload } from "@/lib/fs/watcher-events";

/**
 * POST /api/watcher/scan/[id]
 *
 * Triggers a manual re-scan of a single watched directory by its ID.
 * Returns immediately — the scan runs in the background.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const directoryId = Number(id);

  let root;
  try {
    root = await getRootById(directoryId);
  } catch {
    return NextResponse.json(
      { error: "Directory not found" },
      { status: 404 },
    );
  }

  // Fire-and-forget re-index of this single directory
  setScanning(true);
  indexDirectory(directoryId)
    .then((count) => {
      console.log(
        `[watcher] Manual scan of "${root.label}": indexed ${count} files`,
      );
    })
    .catch((err) => {
      console.error(
        `[watcher] Manual scan error for "${root.label}":`,
        err,
      );
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
    message: `Scanning "${root.label}"...`,
    directoryId,
  });
}
