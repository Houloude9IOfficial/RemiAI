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

type TableInfoRow = { name: string };

function tableColumns(tableName: string): Set<string> {
  const rows = sqlite
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all() as TableInfoRow[];
  return new Set(rows.map((row) => row.name));
}

function tableExists(tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { present?: number } | undefined;
  return row?.present === 1;
}

/**
 * Repair schema drift from installations whose migration journal is ahead of
 * this checkout. Drizzle orders migrations by timestamp, so an older local
 * migration can be skipped even when a required table/column is absent.
 *
 * This runs only during startup (never at module scope), is idempotent, and
 * preserves legacy artifact rows by mapping `path` → `session_path` and
 * `current_version` → `version` when those legacy columns exist.
 */
function repairSchemaCompatibility(): void {
  if (tableExists("conversations")) {
    const columns = tableColumns("conversations");
    if (!columns.has("quality_policy")) {
      sqlite.exec(
        'ALTER TABLE "conversations" ADD COLUMN "quality_policy" TEXT NOT NULL DEFAULT \'balanced\'',
      );
    }
  }

  if (tableExists("artifacts")) {
    let columns = tableColumns("artifacts");
    const add = (name: string, definition: string) => {
      if (columns.has(name)) return;
      sqlite.exec(`ALTER TABLE "artifacts" ADD COLUMN "${name}" ${definition}`);
      columns = tableColumns("artifacts");
    };

    add("source_run_id", "TEXT");
    // Older artifact tables require `path` even though the current model
    // uses `session_path`; keep both populated during the transition.
    add("path", "TEXT NOT NULL DEFAULT ''");
    add("type", "TEXT NOT NULL DEFAULT 'file'");
    add("status", "TEXT NOT NULL DEFAULT 'completed'");
    add("session_path", "TEXT");
    add("file_size", "INTEGER NOT NULL DEFAULT 0");
    add("version", "INTEGER NOT NULL DEFAULT 1");
    add("metadata", "TEXT NOT NULL DEFAULT '{}'");

    if (columns.has("path") && columns.has("session_path")) {
      sqlite
        .prepare("UPDATE artifacts SET session_path = path WHERE session_path IS NULL")
        .run();
      sqlite
        .prepare("UPDATE artifacts SET path = session_path WHERE path = '' AND session_path IS NOT NULL")
        .run();
    }
    if (columns.has("current_version") && columns.has("version")) {
      sqlite
        .prepare(
          "UPDATE artifacts SET version = current_version WHERE current_version IS NOT NULL AND version = 1",
        )
        .run();
    }
  }

  if (!tableExists("sources")) {
    sqlite.exec(`
      CREATE TABLE "sources" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversation_id" INTEGER NOT NULL,
        "source_run_id" TEXT,
        "tool_name" TEXT NOT NULL,
        "source_type" TEXT NOT NULL DEFAULT 'web',
        "url" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "publisher" TEXT NOT NULL DEFAULT '',
        "retrieved_at" TEXT NOT NULL,
        "content_hash" TEXT NOT NULL DEFAULT '',
        "published_at" TEXT,
        "quality_score" INTEGER NOT NULL DEFAULT 0,
        "freshness_status" TEXT NOT NULL DEFAULT 'unknown',
        "extraction_status" TEXT NOT NULL DEFAULT 'unavailable',
        "status" TEXT NOT NULL DEFAULT 'partial',
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "sources_conversation_id_updated_at_idx" ON "sources" ("conversation_id", "updated_at");
      CREATE INDEX "sources_conversation_id_url_idx" ON "sources" ("conversation_id", "url");
    `);
  }

  if (!tableExists("source_claims")) {
    sqlite.exec(`
      CREATE TABLE "source_claims" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversation_id" INTEGER NOT NULL,
        "source_run_id" TEXT,
        "claim_text" TEXT NOT NULL,
        "source_ids" TEXT NOT NULL DEFAULT '[]',
        "support_status" TEXT NOT NULL DEFAULT 'unsupported',
        "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "source_claims_conversation_id_created_at_idx" ON "source_claims" ("conversation_id", "created_at");
    `);
  }

  if (!tableExists("automation_runs")) {
    sqlite.exec(`
      CREATE TABLE "automation_runs" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversation_id" INTEGER NOT NULL,
        "kind" TEXT NOT NULL,
        "source_id" INTEGER,
        "parent_run_id" INTEGER,
        "name" TEXT NOT NULL,
        "task" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'queued',
        "attempt" INTEGER NOT NULL DEFAULT 0,
        "max_attempts" INTEGER NOT NULL DEFAULT 2,
        "checkpoint" TEXT,
        "result" TEXT,
        "error" TEXT,
        "control" TEXT NOT NULL DEFAULT 'none',
        "control_message" TEXT,
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "started_at" TEXT,
        "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" TEXT,
        "next_retry_at" TEXT,
        FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "automation_runs_conversation_id_created_at_idx" ON "automation_runs" ("conversation_id", "created_at");
      CREATE INDEX "automation_runs_status_next_retry_at_idx" ON "automation_runs" ("status", "next_retry_at");
    `);
  }
  if (!tableExists("automation_run_events")) {
    sqlite.exec(`
      CREATE TABLE "automation_run_events" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "run_id" INTEGER NOT NULL,
        "event_type" TEXT NOT NULL,
        "message" TEXT NOT NULL DEFAULT '',
        "metadata" TEXT NOT NULL DEFAULT '{}',
        "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE CASCADE
      );
      CREATE INDEX "automation_run_events_run_id_created_at_idx" ON "automation_run_events" ("run_id", "created_at");
    `);
  }
  for (const [tableName, columnName] of [
    ["routine_logs", "automation_run_id"],
    ["scheduled_tasks", "automation_run_id"],
    ["agent_tasks", "automation_run_id"],
    ["webhook_events", "automation_run_id"],
  ] as const) {
    if (tableExists(tableName) && !tableColumns(tableName).has(columnName)) {
      sqlite.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" INTEGER`);
    }
  }

  if (tableExists("automation_runs")) {
    sqlite
      .prepare(
        `UPDATE automation_runs
         SET status = 'partially_completed',
             error = COALESCE(error, 'Server restarted before this run completed'),
             updated_at = CURRENT_TIMESTAMP,
             completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
         WHERE status IN ('queued', 'planning', 'executing', 'verifying', 'repairing', 'waiting')`,
      )
      .run();
  }

  if (tableExists("build_runs")) {
    const columns = tableColumns("build_runs");
    if (!columns.has("checkpoint")) {
      sqlite.exec('ALTER TABLE "build_runs" ADD COLUMN "checkpoint" TEXT');
    }
    if (!tableColumns("build_runs").has("result_artifact_id")) {
      sqlite.exec('ALTER TABLE "build_runs" ADD COLUMN "result_artifact_id" INTEGER');
    }
  }

  if (!tableExists("build_runs")) {
    sqlite.exec(`
      CREATE TABLE "build_runs" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "conversation_id" INTEGER NOT NULL,
        "source_run_id" TEXT,
        "task" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'running',
        "definition_of_done" TEXT NOT NULL DEFAULT '[]',
        "changed_files" TEXT NOT NULL DEFAULT '[]',
        "checks" TEXT NOT NULL DEFAULT '[]',
        "checkpoint" TEXT,
        "result_artifact_id" INTEGER,
        "summary" TEXT NOT NULL DEFAULT '',
        "error" TEXT,
        "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" TEXT,
        FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
      );
      CREATE INDEX "build_runs_conversation_id_created_at_idx" ON "build_runs" ("conversation_id", "created_at");
    `);
  }
}

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
    // If the migration table is out of sync, the compatibility repair below
    // still creates/adds the current app's required structures without
    // deleting user data.
    console.warn(
      "[db] Migration warning — attempting compatibility repair.",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    repairSchemaCompatibility();
  } catch (e) {
    console.error("[db] Schema compatibility repair failed:", e);
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

  // Recover durable automation runs left active by a server restart. This is
  // intentionally asynchronous so boot remains fast; the old state remains
  // visible as partial rather than being reported as successful.
  setTimeout(() => {
    import("@/lib/runs/automation")
      .then(({ recoverStaleAutomationRuns }) => recoverStaleAutomationRuns())
      .catch((err) => console.error("[runs] Failed to recover stale runs:", err));
  }, 0);

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

  // Auto-refresh provider models every 5 minutes so newly released models
  // appear (and removed ones drop out) without user action. Keeps each
  // model's enabled state — only new models get enabled.
  // Uses dynamic import to avoid circular dependency (refresh imports db).
  setTimeout(() => {
    import("@/lib/providers/refresh")
      .then(({ startModelAutoRefresh }) => startModelAutoRefresh())
      .catch((err) => console.error("[models] Failed to start auto-refresh:", err));
  }, 0);

  // Seed the preloaded skill repos and auto-check for skill updates.
  // Non-blocking background task (network + disk work must never gate boot).
  setTimeout(() => {
    import("@/lib/skills/manager")
      .then(async ({ seedPreloadedRepos, checkAllReposForUpdates }) => {
        await seedPreloadedRepos();
        // Best-effort; failures log and are retried on the next boot.
        await checkAllReposForUpdates().catch((err) =>
          console.error("[skills] Background update check failed:", err),
        );
      })
      .catch((err) => console.error("[skills] Failed to initialize:", err));
  }, 0);
}

export { db };
