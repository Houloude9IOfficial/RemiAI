import { sql } from "drizzle-orm";
import { db } from "@/db";

// ---------------------------------------------------------------------------
// Tables to exclude from backup/restore (drizzle internal + SQLite built-in)
// ---------------------------------------------------------------------------

const INTERNAL_TABLES = new Set<string>(["__drizzle_migrations", "sqlite_sequence"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TableInfo {
  /** Actual SQLite table name (snake_case). */
  name: string;
  /** Column names in the table. */
  columns: string[];
}

// ---------------------------------------------------------------------------
// Discover all user tables
// ---------------------------------------------------------------------------

/**
 * Query `sqlite_master` to discover all user-created tables, skipping
 * internal drizzle migration tables and SQLite built-in tables.
 *
 * Returns the table name and its columns for each table.
 */
export function getAllTables(): TableInfo[] {
  const rows = db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '__drizzle_%' AND name != 'sqlite_sequence' ORDER BY name`,
  ) as { name: string }[];

  return rows
    .filter((r) => !INTERNAL_TABLES.has(r.name))
    .map((r) => ({
      name: r.name,
      columns: getTableColumns(r.name),
    }));
}

// ---------------------------------------------------------------------------
// Get columns for a specific table
// ---------------------------------------------------------------------------

/**
 * Query `PRAGMA table_info` to get the column names for a given table.
 */
export function getTableColumns(tableName: string): string[] {
  const cols = db.all(
    sql`SELECT name FROM pragma_table_info(${tableName})`,
  ) as { name: string }[];

  return cols.map((c) => c.name);
}
