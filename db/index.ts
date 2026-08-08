import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { DATA_DIR } from "@/lib/paths";
import { startFileWatcher } from "@/lib/fs/watcher";

/**
 * SQLite connection, opened at module scope so route modules can import the
 * `db` instance cleanly.
 *
 * IMPORTANT: nothing at module scope may WRITE to the database. During
 * `next build` (e.g. on GitHub Actions CI), Next.js collects page data using
 * parallel worker processes that import route modules — including this one.
 * Those workers run with a stripped-down environment (no `NEXT_PHASE`), so a
 * guard based on `NEXT_PHASE === "phase-production-build"` does NOT hold in
 * them. Running write side effects (migrations, orphaned-task cleanup, file
 * watcher, scheduler) at module scope in every worker used to make several
 * processes write to the same SQLite file concurrently, crashing the build
 * with `SqliteError: database is locked` (SQLITE_BUSY).
 *
 * All startup side effects live in `initializeApp()`, which is called exactly
 * once from the `register()` hook in `instrumentation.ts` — i.e. when the
 * Next.js server actually boots (dev / `next start` / the standalone server
 * used by Electron), never during `next build` or in its workers.
 */
const dataDir = DATA_DIR;
fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, "remiai.sqlite");

function sleepSync(ms: number): void {
  // Atomics.wait is a synchronous sleep on the main thread (build workers are
  // forked child processes). Falls back to a busy-wait where unavailable.
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* busy-wait */
    }
  }
}

/**
 * Open the SQLite connection and put it in WAL mode.
 *
 * This runs at module scope, so it also runs inside `next build`'s parallel
 * page-data worker processes (each worker imports the route modules). Opening
 * the file is lock-free, but switching to WAL mode takes an exclusive lock
 * and — unlike ordinary statements — does NOT honour the busy timeout, so
 * several workers racing to convert a fresh database used to throw
 * `SqliteError: database is locked` (SQLITE_BUSY) immediately, crashing the
 * build on macOS CI runners. Retry with a short sleep until the other
 * processes finish their millisecond-long conversion.
 */
function openDatabase(): Database.Database {
  const retryable = (code: string | undefined) =>
    code === "SQLITE_BUSY" ||
    code === "SQLITE_LOCKED" ||
    code === "SQLITE_CANTOPEN";

  for (let attempt = 0; ; attempt++) {
    try {
      const sqlite = new Database(DB_PATH, {
        // Wait for the write lock instead of failing immediately. WAL mode
        // allows concurrent readers but only one writer, and multiple
        // processes (e.g. Next.js build workers, or several app instances)
        // can touch the same file.
        timeout: 30_000,
      });
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      return sqlite;
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      // Give up quickly on non-transient failures (bad path, corrupt file).
      if (!retryable(code) || attempt >= 200) throw err;
      sleepSync(25);
    }
  }
}

const sqlite = openDatabase();

const db = drizzle(sqlite, { schema });

let initialized = false;

/**
 * Run startup side effects exactly once, when the app server boots.
 *
 * Called from `instrumentation.ts` (`register()`). Idempotent — safe to call
 * multiple times or from multiple entry points.
 */
export async function initializeApp(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Defensive: Next.js already skips the instrumentation `register()` hook
  // during `next build`, but never run these in a build context regardless.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

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
