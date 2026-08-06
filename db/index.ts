import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { startFileWatcher } from "@/lib/fs/watcher";

/**
 * During `next build` (e.g. on GitHub Actions CI), Next.js collects page data
 * using parallel worker processes that import route modules — including this
 * one. Running write side effects (migrations, orphaned-task cleanup, file
 * watcher, scheduler) at module scope in every worker used to make two
 * processes write to the same SQLite file concurrently, crashing the build
 * with `SqliteError: database is locked` (SQLITE_BUSY) on macOS runners.
 *
 * The app only needs these side effects when it is actually serving requests
 * (dev / `next start` / Electron), so they are skipped during the production
 * build phase. The DB is still opened so route modules import cleanly.
 */
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

const dataDir = path.join(
  // turbopackIgnore: the local data dir must never be traced/copied into the
  // standalone output — it contains the user's SQLite DB and uploads.
  /* turbopackIgnore: true */ process.cwd(),
  "data",
);
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "remiai.sqlite"));
sqlite.pragma("journal_mode = WAL");
// Wait for the write lock instead of failing immediately. WAL mode allows
// concurrent readers but only one writer, and multiple processes (e.g. Next.js
// build workers, or several app instances) can touch the same DB file.
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

if (!IS_BUILD_PHASE) {
  // Auto-run migrations on startup so the app works out of the box
  // without requiring a separate `npm run db:migrate` step.
  try {
    migrate(db, { migrationsFolder: path.join(process.cwd(), "db/migrations") });
  } catch (e) {
    // If the migration table is out of sync (e.g. tables already exist but
    // __drizzle_migrations is missing entries), log a warning and continue.
    // This prevents a crash on startup for a local-first app.
    // To force a fresh migration, delete the database file and restart.
    console.warn(
      "[db] Migration warning — the database may already be up to date.",
      e instanceof Error ? e.message : e,
    );
  }

  // Clean up orphaned background agent tasks from any previous server session
  // Both "running" and "queued" tasks are orphaned when the server restarts
  if (schema.agentTasks) {
    try {
      db.update(schema.agentTasks)
        .set({ status: "failed", error: "Server restarted" })
        .where(sql`${schema.agentTasks.status} IN ('running', 'queued')`)
        .run();
    } catch {
      // Table may not exist yet on first run after migration
    }
  }

  // Start the file watcher in the background (non-blocking).
  // It will index all watched directories and track live file changes.
  startFileWatcher(db);

  // Start the background scheduler for executing due scheduled tasks.
  // Uses dynamic import to avoid circular dependency (scheduler imports db).
  setTimeout(() => {
    import("@/lib/scheduler")
      .then(({ startScheduler }) => startScheduler())
      .catch((err) => console.error("[scheduler] Failed to start:", err));
  }, 0);
}

export { db };
