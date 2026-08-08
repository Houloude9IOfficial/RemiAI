#!/usr/bin/env tsx
/**
 * File Watcher Worker
 *
 * A standalone background process that monitors configured directories for
 * file changes and automatically updates the file index.
 *
 * Usage:
 *   npx tsx scripts/file-watcher.ts
 *
 * It re-reads directory configuration from the DB every 10 seconds so that
 * newly added/removed directories are picked up without restarting.
 */

import fs from "node:fs";
import path from "node:path";
import { db, initializeApp } from "../db";
import { directories } from "../db/schema";
import { eq } from "drizzle-orm";
import { indexFile, removeFromIndex, clearDirectoryIndex } from "../lib/fs/file-index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchEntry {
  id: number;
  path: string;
  label: string;
}

interface ActiveWatch {
  entry: WatchEntry;
  watcher: fs.FSWatcher;
  debounceTimers: Map<string, NodeJS.Timeout>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often (in ms) to poll the DB for directory config changes. */
const CONFIG_POLL_INTERVAL = 10_000;

/** Debounce delay (in ms) to coalesce rapid file events (e.g., editor saves). */
const DEBOUNCE_DELAY = 500;

/** Directories that are always skipped during indexing. */
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
// State
// ---------------------------------------------------------------------------

const activeWatches = new Map<number, ActiveWatch>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIgnored(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith(".");
}

function normalizeRelativePath(rootPath: string, filePath: string): string {
  const relative = path.relative(rootPath, filePath);
  // Normalize to forward slashes for cross-platform consistency
  return relative.replace(/\\/g, "/");
}

/**
 * Compute a debounced key that groups rapid events for the same file.
 */
function debounceKey(rootPath: string, relativePath: string): string {
  return `${rootPath}::${relativePath}`;
}

// ---------------------------------------------------------------------------
// Watcher management
// ---------------------------------------------------------------------------

async function processFileEvent(
  watchEntry: WatchEntry,
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
    // Check if the file still exists
    await fs.promises.stat(fullPath);

    // File exists — index it
    await indexFile(watchEntry.id, relativePath, fullPath);
    console.log(
      `[file-watcher] Indexed ${eventType}: ${watchEntry.label}/${relativePath}`,
    );
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // File was deleted — remove from index
      await removeFromIndex(watchEntry.id, relativePath);
      console.log(
        `[file-watcher] Removed deleted: ${watchEntry.label}/${relativePath}`,
      );
    } else {
      console.error(
        `[file-watcher] Error processing ${filename}:`,
        err.message,
      );
    }
  }
}

function createDebouncedHandler(
  watchEntry: WatchEntry,
  eventType: "change" | "rename",
  activeWatch: ActiveWatch,
): (eventType: "change" | "rename", filename: string | null) => void {
  return (evtType: "change" | "rename", filename: string | null) => {
    if (!filename) return;

    const relativePath = normalizeRelativePath(watchEntry.path, path.join(watchEntry.path, filename));
    const key = debounceKey(watchEntry.path, relativePath);

    // Clear existing timer for this file
    const existing = activeWatch.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    // Set new debounced timer
    const timer = setTimeout(async () => {
      activeWatch.debounceTimers.delete(key);
      await processFileEvent(watchEntry, evtType, filename);
    }, DEBOUNCE_DELAY);

    activeWatch.debounceTimers.set(key, timer);
  };
}

async function startWatch(entry: WatchEntry): Promise<void> {
  if (activeWatches.has(entry.id)) {
    return; // Already watching
  }

  try {
    // Verify the directory still exists
    await fs.promises.access(entry.path, fs.constants.R_OK);

    const activeWatch: ActiveWatch = {
      entry,
      watcher: null!,
      debounceTimers: new Map(),
    };

    const handler = createDebouncedHandler(entry, "change", activeWatch);

    // Use recursive watching (supported on macOS, Windows; on Linux falls
    // back to non-recursive — we'll do an initial full index to catch all)
    try {
      activeWatch.watcher = fs.watch(entry.path, { recursive: true }, handler);

      activeWatch.watcher.on("error", (err) => {
        console.error(
          `[file-watcher] Watch error for "${entry.label}":`,
          err.message,
        );
        cleanupWatch(entry.id);
      });

      activeWatches.set(entry.id, activeWatch);
      console.log(
        `[file-watcher] Watching: ${entry.label} (${entry.path})`,
      );
    } catch {
      // Recursive watch may not be supported on this platform (Linux).
      // Fall back to a non-recursive watch + periodic full re-index.
      console.warn(
        `[file-watcher] Recursive watch not supported for "${entry.label}". Falling back to periodic indexing.`,
      );
      activeWatch.watcher = fs.watch(entry.path, { recursive: false }, handler);
      activeWatches.set(entry.id, activeWatch);
    }
  } catch (err: any) {
    console.error(
      `[file-watcher] Cannot watch "${entry.label}" (${entry.path}): ${err.message}`,
    );
  }
}

function cleanupWatch(directoryId: number): void {
  const active = activeWatches.get(directoryId);
  if (!active) return;

  // Close watcher
  try {
    active.watcher.close();
  } catch {
    // Ignore close errors
  }

  // Clear all debounce timers
  for (const timer of active.debounceTimers.values()) {
    clearTimeout(timer);
  }
  active.debounceTimers.clear();

  activeWatches.delete(directoryId);
  console.log(
    `[file-watcher] Stopped watching: ${active.entry.label}`,
  );
}

// ---------------------------------------------------------------------------
// Config sync
// ---------------------------------------------------------------------------

async function syncWatches(): Promise<void> {
  try {
    // Get all directories with watch_enabled = true
    const watchedDirs = await db
      .select()
      .from(directories)
      .where(eq(directories.watchEnabled, true))
      .all();

    const watchedIds = new Set(watchedDirs.map((d) => d.id));

    // Remove watches for directories no longer in the config
    for (const [id] of activeWatches) {
      if (!watchedIds.has(id)) {
        cleanupWatch(id);
        // Also clear the file index for this directory
        await clearDirectoryIndex(id);
      }
    }

    // Add/update watches
    for (const dir of watchedDirs) {
      await startWatch({
        id: dir.id,
        path: dir.path,
        label: dir.label,
      });
    }
  } catch (err) {
    console.error("[file-watcher] Config sync error:", err);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(): void {
  console.log("\n[file-watcher] Shutting down...");
  for (const [id] of activeWatches) {
    cleanupWatch(id);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[file-watcher] Starting file watcher worker...");
  console.log(`[file-watcher] Config poll interval: ${CONFIG_POLL_INTERVAL}ms`);
  console.log(`[file-watcher] Debounce delay: ${DEBOUNCE_DELAY}ms`);

  // Ensure migrations have been applied (previously done at db import time).
  await initializeApp();

  // Initial sync of watches
  await syncWatches();

  // Periodic re-sync to pick up config changes
  setInterval(syncWatches, CONFIG_POLL_INTERVAL);

  // Keep the process alive
  console.log("[file-watcher] Worker is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[file-watcher] Fatal error:", err);
  process.exit(1);
});
