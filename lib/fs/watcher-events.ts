/**
 * Shared EventEmitter for file watcher status changes.
 * The SSE endpoint subscribes to this to push real-time updates to clients.
 */
import { EventEmitter } from "node:events";
import { getPermittedRoots } from "./access";
import { db } from "@/db";
import { fileIndex } from "@/db/schema";
import { eq, count, max } from "drizzle-orm";

export type WatcherEventType = "scan-start" | "scan-end" | "status-change" | "connected";

export interface WatcherEventPayload {
  type: WatcherEventType;
  timestamp: string;
  status: {
    running: boolean;
    scanning: boolean;
    totalFiles: number;
    lastScanTime: string | null;
    watchedDirs: {
      id: number;
      label: string;
      path: string;
      watchEnabled: boolean;
      indexedFiles: number;
      isWatched: boolean;
    }[];
  };
}

/**
 * Minimal watcher state needed to build a full status payload.
 * Avoids circular dep by not importing from ./watcher.
 */
export interface WatcherState {
  running: boolean;
  scanning: boolean;
  watchedDirs: { id: number }[];
}

/**
 * Build the full watcher status payload by querying the DB.
 * @param state - The current watcher state (passed in to avoid circular imports)
 * @param type - The event type
 */
export async function buildWatcherEventPayload(
  state: WatcherState,
  type: WatcherEventType,
): Promise<WatcherEventPayload> {
  const roots = await getPermittedRoots();

  // Get file counts per directory
  const dirFileCounts: Record<number, number> = {};
  for (const root of roots) {
    const result = await db
      .select({ c: count() })
      .from(fileIndex)
      .where(eq(fileIndex.directoryId, root.id))
      .all();
    dirFileCounts[root.id] = result[0]?.c ?? 0;
  }

  // Get total and last update time
  const [totalResult] = await db
    .select({ total: count() })
    .from(fileIndex)
    .all();
  const [latestResult] = await db
    .select({ latest: max(fileIndex.updatedAt) })
    .from(fileIndex)
    .all();

  const watchEnabledIds = new Set(state.watchedDirs.map((w) => w.id));

  return {
    type,
    timestamp: new Date().toISOString(),
    status: {
      running: state.running,
      scanning: state.scanning,
      totalFiles: totalResult?.total ?? 0,
      lastScanTime: latestResult?.latest ?? null,
      watchedDirs: roots.map((r) => ({
        id: r.id,
        label: r.label,
        path: r.path,
        watchEnabled: watchEnabledIds.has(r.id),
        indexedFiles: dirFileCounts[r.id] ?? 0,
        isWatched: watchEnabledIds.has(r.id),
      })),
    },
  };
}

class WatcherEventBus extends EventEmitter {
  private static instance: WatcherEventBus;

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow many SSE connections
  }

  static getInstance(): WatcherEventBus {
    if (!WatcherEventBus.instance) {
      WatcherEventBus.instance = new WatcherEventBus();
    }
    return WatcherEventBus.instance;
  }

  emitEvent(payload: WatcherEventPayload): void {
    this.emit("watcher-event", payload);
  }

  onEvent(handler: (payload: WatcherEventPayload) => void): () => void {
    this.on("watcher-event", handler);
    return () => {
      this.off("watcher-event", handler);
    };
  }
}

export const watcherEventBus = WatcherEventBus.getInstance();
