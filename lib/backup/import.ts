import fsp from "node:fs/promises";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { decryptBackup } from "./crypto";
import { getAllTables, getTableColumns } from "./schema";
import {
  BACKUP_VERSION,
  BACKUP_VERSION_MIN,
  type BackupFiles,
  type RestoreResult,
} from "./types";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const AVATAR_DIR = path.join(DATA_DIR, "avatars");

// ---------------------------------------------------------------------------
// v1 → v2 migration helpers
// ---------------------------------------------------------------------------

/**
 * Map from v1 camelCase table keys to actual SQLite table names.
 * Only needed for restoring v1 backups.
 */
const V1_TABLE_NAME_MAP: Record<string, string> = {
  directories: "directories",
  providers: "providers",
  providerModels: "provider_models",
  mcpServers: "mcp_servers",
  memories: "memories",
  userPreferences: "user_preferences",
  conversations: "conversations",
  toolConfigs: "tool_configs",
  messages: "messages",
  todoItems: "todo_items",
  routines: "routines",
  routineLogs: "routine_logs",
  scheduledTasks: "scheduled_tasks",
  agentTasks: "agent_tasks",
};

/** camelCase → snake_case, e.g. "apiKey" → "api_key". */
function camelToSnake(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Migrate a v1 backup payload to the v2 format.
 * - Maps camelCase table names → snake_case using V1_TABLE_NAME_MAP
 * - Converts each row's camelCase column keys → snake_case
 * - Extracts and preserves the `files` section
 */
function migrateV1Payload(
  data: Record<string, unknown>,
): { tables: Record<string, Record<string, unknown>[]>; files: BackupFiles } {
  // Extract files first
  const rawFiles = (data.files ?? { uploads: {}, avatars: {} }) as BackupFiles;
  const files: BackupFiles = {
    uploads: typeof rawFiles.uploads === "object" ? (rawFiles.uploads as Record<string, string>) : {},
    avatars: typeof rawFiles.avatars === "object" ? (rawFiles.avatars as Record<string, string>) : {},
  };

  // Migrate each table
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [v1Key, tableName] of Object.entries(V1_TABLE_NAME_MAP)) {
    const rows = data[v1Key];
    if (Array.isArray(rows)) {
      tables[tableName] = rows.map((row: Record<string, unknown>) => {
        const migrated: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          migrated[camelToSnake(key)] = value;
        }
        return migrated;
      });
    }
  }

  return { tables, files };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePayload(payload: unknown): {
  version: number;
  exportedAt: string;
  appVersion: string;
  includesFiles: boolean;
  tables: Record<string, Record<string, unknown>[]>;
  files: BackupFiles;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("Backup file is not a valid JSON object.");
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.version !== "number") {
    throw new Error("Backup is missing 'version' field.");
  }

  if (p.version < BACKUP_VERSION_MIN) {
    throw new Error(
      `Backup format version ${p.version} is too old. Minimum supported version is ${BACKUP_VERSION_MIN}.`,
    );
  }

  if (!p.exportedAt || typeof p.exportedAt !== "string") {
    throw new Error("Backup is missing 'exportedAt' field.");
  }

  const appVersion = typeof p.appVersion === "string" ? p.appVersion : "";
  const includesFiles = p.includesFiles === true;
  const data = p.data as Record<string, unknown> | undefined;

  if (!data || typeof data !== "object") {
    throw new Error("Backup is missing 'data' section.");
  }

  let tables: Record<string, Record<string, unknown>[]>;
  let files: BackupFiles;

  if (p.version === 1) {
    // ── Migrate v1 → v2 ──────────────────────────────────────────────
    const migrated = migrateV1Payload(data);
    tables = migrated.tables;
    files = migrated.files;
  } else if (p.version >= 2) {
    // ── v2+ — use as-is (snake_case keys matching actual table names) ──
    tables = {} as Record<string, Record<string, unknown>[]>;
    files = { uploads: {}, avatars: {} };

    for (const [key, value] of Object.entries(data)) {
      if (key === "files") {
        const f = value as Record<string, unknown>;
        files = {
          uploads: typeof f.uploads === "object" ? (f.uploads as Record<string, string>) : {},
          avatars: typeof f.avatars === "object" ? (f.avatars as Record<string, string>) : {},
        };
      } else if (Array.isArray(value)) {
        tables[key] = value as Record<string, unknown>[];
      }
    }
  } else {
    throw new Error(
      `Backup format version ${p.version} is not supported. Expected version ${BACKUP_VERSION} or higher.`,
    );
  }

  // Ensure at least one table has data
  if (Object.keys(tables).length === 0) {
    throw new Error("Backup contains no table data.");
  }

  return { version: p.version, exportedAt: p.exportedAt, appVersion, includesFiles, tables, files };
}

// ---------------------------------------------------------------------------
// Delete all existing data (dynamic, FK-safe)
// ---------------------------------------------------------------------------

function deleteAllData(): void {
  const tables = getAllTables();

  db.transaction((tx) => {
    tx.run(sql`PRAGMA foreign_keys = OFF`);

    for (const t of tables) {
      if (t.name === "backup_history") continue;
      tx.run(sql`DELETE FROM ${sql.identifier(t.name)}`);
    }

    tx.run(sql`DELETE FROM sqlite_sequence`);
    tx.run(sql`PRAGMA foreign_keys = ON`);
  });
}

// ---------------------------------------------------------------------------
// Insert rows into a table with column filtering
// ---------------------------------------------------------------------------

/** Regex to validate SQLite column names. */
const VALID_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Coerce a backup value to a type that better-sqlite3 can bind.
 * SQLite only accepts: numbers, strings, bigints, buffers, and null.
 */
function toSQLiteValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

/**
 * Insert rows into a table.
 *
 * - Filters columns to only those that exist in the current DB schema
 * - Coerces values to SQLite-compatible types
 * - Logs warnings for skipped columns and rows
 */
function insertRows(
  tableName: string,
  rows: Record<string, unknown>[],
  currentColumns: Set<string>,
  warnings: string[],
): number {
  if (rows.length === 0) return 0;

  let restored = 0;

  db.transaction((tx) => {
    for (const row of rows) {
      // Filter to only columns that exist in the current DB
      const validCols = Object.keys(row).filter(
        (col) =>
          VALID_COLUMN_RE.test(col) && currentColumns.has(col),
      );

      if (validCols.length === 0) {
        warnings.push(
          `Table "${tableName}": row has no valid columns — skipped.`,
        );
        continue;
      }

      // Warn about columns in backup that don't exist in current DB
      const skipped = Object.keys(row).filter(
        (col) => !currentColumns.has(col) && VALID_COLUMN_RE.test(col),
      );
      if (skipped.length > 0) {
        // Only warn once per table, not per row
        if (restored === 0) {
          warnings.push(
            `Table "${tableName}": columns [${skipped.join(", ")}] not found in current DB — omitted.`,
          );
        }
      }

      const values = validCols.map((col) => toSQLiteValue(row[col]));
      const colIdents = validCols.map((c) => sql.identifier(c));
      const valSQL: SQL[] = values.map((v) => sql`${v}`);
      const stmt =
        sql`INSERT INTO ${sql.identifier(tableName)} (${sql.join(colIdents, sql`, `)}) VALUES (${sql.join(valSQL, sql`, `)})`;
      tx.run(stmt);
      restored++;
    }
  });

  return restored;
}

// ---------------------------------------------------------------------------
// Write files back to disk
// ---------------------------------------------------------------------------

async function restoreFiles(data: BackupFiles): Promise<{
  uploads: number;
  avatars: number;
}> {
  let uploads = 0;
  let avatars = 0;

  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  for (const [relPath, base64] of Object.entries(data.uploads)) {
    const fullPath = path.join(UPLOAD_DIR, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, Buffer.from(base64, "base64"));
    uploads++;
  }

  await fsp.mkdir(AVATAR_DIR, { recursive: true });
  for (const [filename, base64] of Object.entries(data.avatars)) {
    const fullPath = path.join(AVATAR_DIR, filename);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, Buffer.from(base64, "base64"));
    avatars++;
  }

  return { uploads, avatars };
}

// ---------------------------------------------------------------------------
// Restore: decrypt, validate, wipe, insert
// ---------------------------------------------------------------------------

export async function importBackup(
  encrypted: string,
  password: string,
): Promise<RestoreResult> {
  const warnings: string[] = [];

  // ── Decrypt ─────────────────────────────────────────────────────────────
  let plaintext: string;
  try {
    plaintext = decryptBackup(encrypted, password);
  } catch (err) {
    throw new Error(
      `Failed to decrypt backup: ${err instanceof Error ? err.message : "Wrong password or corrupted file"}`,
    );
  }

  // ── Parse & validate (with v1→v2 migration) ────────────────────────────
  let payload: ReturnType<typeof validatePayload>;
  try {
    const parsed = JSON.parse(plaintext);
    payload = validatePayload(parsed);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Failed to parse backup data. The file may be corrupted.");
  }

  // ── Discover current DB schema ──────────────────────────────────────────
  const currentTables = getAllTables();
  const currentTableMap = new Map<string, Set<string>>(
    currentTables.map((t) => [t.name, new Set(t.columns)]),
  );

  // ── Wipe existing data (skipping backup_history) ────────────────────────
  deleteAllData();

  // ── Insert data ─────────────────────────────────────────────────────────
  const tableCounts: Record<string, number> = {};
  const restoreOrder: string[] = [];

  // Order tables: known parent tables first, then alphabetically for unknowns
  const preferredOrder = [
    "directories",
    "providers",
    "provider_models",
    "mcp_servers",
    "memories",
    "user_preferences",
    "conversations",
    "tool_configs",
    "messages",
    "todo_items",
    "routines",
    "routine_logs",
    "scheduled_tasks",
    "agent_tasks",
  ];

  // Sort: known tables in preferred order, then alphabetically
  const sortedTables = Object.keys(payload.tables).sort((a, b) => {
    const ai = preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  db.transaction((tx) => {
    tx.run(sql`PRAGMA foreign_keys = OFF`);

    for (const tableName of sortedTables) {
      const rows = payload.tables[tableName];
      if (!rows || rows.length === 0) continue;

      const currentCols = currentTableMap.get(tableName);
      if (!currentCols) {
        warnings.push(
          `Table "${tableName}" from backup does not exist in current DB — skipped.`,
        );
        continue;
      }

      const count = insertRows(tableName, rows, currentCols, warnings);
      if (count > 0) tableCounts[tableName] = count;
    }

    tx.run(sql`PRAGMA foreign_keys = ON`);
  });

  // ── Restore files ──────────────────────────────────────────────────────
  const fileStats = payload.includesFiles
    ? await restoreFiles(payload.files)
    : { uploads: 0, avatars: 0 };

  // ── Build result ────────────────────────────────────────────────────────
  return {
    success: true,
    tables: tableCounts,
    files: fileStats,
    exportedAt: payload.exportedAt,
    appVersion: payload.appVersion,
    warnings,
  };
}
