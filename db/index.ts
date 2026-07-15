import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import { startFileWatcher } from "@/lib/fs/watcher";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(path.join(dataDir, "remiai.sqlite"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

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

export { db };
