/**
 * Integrated File Watcher
 *
 * Runs inside the Next.js process (no separate worker needed).
 * - Does an initial full index scan of all watched directories on startup
 * - Uses fs.watch to track live file changes
 * - Re-syncs directory config from DB every 10s
 * - Graceful shutdown on SIGINT/SIGTERM
 *
 * Imported by db/index.ts which starts it automatically on server boot.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { directories } from "@/db/schema";
import { indexFile, indexDirectory, removeFromIndex } from "./file-index";
import { watcherEventBus, buildWatcherEventPayload } from "./watcher-events";

// Use a minimal type for the db instance — avoids importing @/db (circular dep)
type DB = BetterSQLite3Database<any>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often (in ms) to poll the DB for directory config changes. */
const CONFIG_POLL_INTERVAL = 10_000;

/** Debounce delay (in ms) to coalesce rapid file events (e.g., editor saves). */
const DEBOUNCE_DELAY = 500;

/** Directories always skipped during indexing. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
]);

// ---------------------------------------------------------------------------
// Types & State
// ---------------------------------------------------------------------------

interface ActiveWatch {
  directoryId: number;
  label: string;
  path: string;
  watcher: fs.FSWatcher;
  debounceTimers: Map<string, NodeJS.Timeout>;
}

let activeWatches = new Map<number, ActiveWatch>();
let configInterval: ReturnType<typeof setInterval> | null = null;
let started = false;
let scanningCount = 0;

// ---------------------------------------------------------------------------
// Status tracking
// ---------------------------------------------------------------------------

/**
 * Get the current status of the file watcher.
 */
export function getWatcherStatus() {
  return {
    running: started,
    scanning: scanningCount > 0,
    watchedCount: activeWatches.size,
    watchedDirs: Array.from(activeWatches.values()).map((w) => ({
      id: w.directoryId,
      label: w.label,
      path: w.path,
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIgnored(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith(".");
}

function normalizeRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Watcher management
// ---------------------------------------------------------------------------

async function processFileEvent(
  watchEntry: { id: number; path: string; label: string },
  eventType: "change" | "rename",
  filename: string | null,
): Promise<void> {
  if (!filename) return;

  const fullPath = path.join(watchEntry.path, filename);
  const relativePath = normalizeRelativePath(watchEntry.path, fullPath);

  // Skip ignored directories
  const segments = filename.split(path.sep);
  for (const segment of segments) {
    if (isIgnored(segment)) return;
  }

  try {
    await fsp.stat(fullPath);
    await indexFile(watchEntry.id, relativePath, fullPath);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      await removeFromIndex(watchEntry.id, relativePath);
    }
  }
}

function createDebouncedHandler(
  watchEntry: { id: number; path: string; label: string },
  activeWatch: ActiveWatch,
) {
  return (evtType: "change" | "rename", filename: string | null) => {
    if (!filename) return;
    const fullPath = path.join(watchEntry.path, filename);
    const key = normalizeRelativePath(watchEntry.path, fullPath);

    const existing = activeWatch.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      activeWatch.debounceTimers.delete(key);
      await processFileEvent(watchEntry, evtType, filename);
    }, DEBOUNCE_DELAY);

    activeWatch.debounceTimers.set(key, timer);
  };
}

async function startWatchOnDir(entry: {
  id: number;
  path: string;
  label: string;
}): Promise<void> {
  if (activeWatches.has(entry.id)) return;

  try {
    await fsp.access(entry.path, fs.constants.R_OK);

    const activeWatch: ActiveWatch = {
      directoryId: entry.id,
      label: entry.label,
      path: entry.path,
      watcher: null!,
      debounceTimers: new Map(),
    };

    const handler = createDebouncedHandler(entry, activeWatch);

    try {
      activeWatch.watcher = fs.watch(entry.path, { recursive: true }, handler);
    } catch {
      activeWatch.watcher = fs.watch(entry.path, { recursive: false }, handler);
    }

    activeWatch.watcher.on("error", () => stopWatch(entry.id));
    activeWatches.set(entry.id, activeWatch);
  } catch {
    // Directory not accessible, skip
  }
}

function stopWatch(directoryId: number): void {
  const active = activeWatches.get(directoryId);
  if (!active) return;

  try {
    active.watcher.close();
  } catch {
    // ignore
  }
  for (const timer of active.debounceTimers.values()) {
    clearTimeout(timer);
  }
  active.debounceTimers.clear();
  activeWatches.delete(directoryId);
}

// ---------------------------------------------------------------------------
// Config sync
// ---------------------------------------------------------------------------

async function syncWatches(db: DB): Promise<void> {
  try {
    const watchedDirRows = await db
      .select()
      .from(directories)
      .where(eq(directories.watchEnabled, true))
      .all();

    const watchedIds = new Set(watchedDirRows.map((d) => d.id));

    // Remove watches for directories no longer watched
    for (const [id] of activeWatches) {
      if (!watchedIds.has(id)) {
        stopWatch(id);
      }
    }

    // Add/update watches and do initial full index if new
    for (const dir of watchedDirRows) {
      const wasAlreadyWatched = activeWatches.has(dir.id);
      await startWatchOnDir({
        id: dir.id,
        path: dir.path,
        label: dir.label,
      });

      // Full index scan for newly watched directories (background)
      if (!wasAlreadyWatched) {
        setScanning(true);
        indexDirectory(dir.id)
          .then((count) => {
            if (count > 0) {
              console.log(
                `[watcher] Indexed ${count} existing files in "${dir.label}"`,
              );
            }
          })
          .finally(() => {
            setScanning(false);
          });
      }
    }
  } catch {
    // Config sync errors are non-fatal
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the file watcher. Idempotent — safe to call multiple times.
 * Does an initial full index scan of all watched directories.
 *
 * @param db - The Drizzle ORM database instance (passed in to avoid circular imports)
 */
export function startFileWatcher(db: DB): void {
  if (started) return;
  started = true;

  // Defer to next tick so the server can start serving quickly
  setImmediate(async () => {
    console.log("[watcher] Starting file watcher...");

    // Initial sync: set up watches and index all watched dirs
    await syncWatches(db);

    // Periodic re-sync to pick up config changes
    configInterval = setInterval(() => {
      syncWatches(db);
    }, CONFIG_POLL_INTERVAL);
  });

  // Graceful shutdown
  const shutdown = () => {
    if (!started) return;
    started = false;
    if (configInterval) clearInterval(configInterval);
    for (const [id] of activeWatches) stopWatch(id);
    activeWatches.clear();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Stop the file watcher and clean up all resources.
 */
/**
 * Mark the watcher as currently scanning. Uses a counter so nested
 * scan operations don't race with each other.
 * Emits a watcher event for real-time SSE updates.
 */
export function setScanning(scanning: boolean): void {
  const wasScanning = scanningCount > 0;
  scanningCount += scanning ? 1 : -1;
  if (scanningCount < 0) scanningCount = 0; // Safety guard
  const nowScanning = scanningCount > 0;

  // Emit event if scanning state actually changed
  if (wasScanning !== nowScanning) {
    const state = getWatcherStatus();
    buildWatcherEventPayload(
      { running: state.running, scanning: state.scanning, watchedDirs: state.watchedDirs },
      nowScanning ? "scan-start" : "scan-end",
    ).then((payload) => watcherEventBus.emitEvent(payload));
  }
}

/**
 * Stop the file watcher and clean up all resources.
 */
export function stopFileWatcher(): void {
  started = false;
  if (configInterval) clearInterval(configInterval);
  configInterval = null;
  for (const [id] of activeWatches) stopWatch(id);
  activeWatches.clear();
}
