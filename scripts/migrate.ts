/**
 * Standalone database migration script.
 * Applies all pending SQL migration files to the SQLite database.
 *
 * Run with: npx tsx scripts/migrate.ts
 */
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "remiai.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Check which migrations have already been applied
db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

const applied = new Set(
  db
    .prepare("SELECT hash FROM __drizzle_migrations")
    .all()
    .map((r: any) => r.hash),
);

const migrationsDir = path.join(process.cwd(), "db/migrations");
const metaPath = path.join(migrationsDir, "meta/_journal.json");
const journal = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

const insert = db.prepare(
  "INSERT INTO __drizzle_migrations (hash) VALUES (?)",
);

for (const entry of journal.entries) {
  const tag = entry.tag;
  if (applied.has(tag)) {
    console.log(`  ✓ ${tag} already applied`);
    continue;
  }

  const sqlFile = path.join(migrationsDir, `${tag}.sql`);
  if (!fs.existsSync(sqlFile)) {
    console.warn(`  ! ${tag} SQL file not found, skipping`);
    continue;
  }

  console.log(`  → Applying ${tag}...`);
  const sql = fs.readFileSync(sqlFile, "utf-8");

  // Split by statement-breakpoint and execute each statement
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      db.exec(stmt);
    } catch (err) {
      console.error(`  ✗ Error in ${tag}:`, (err as Error).message);
      console.error(`  Statement: ${stmt.slice(0, 200)}`);
      throw err;
    }
  }

  insert.run(tag);
  console.log(`  ✓ ${tag} applied successfully`);
}

console.log("\n✅ All migrations applied.");
db.close();
