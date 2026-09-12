import fsp from "node:fs/promises";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { UPLOAD_DIR, AVATAR_DIR, SESSION_FILES_DIR, SKILLS_DIR } from "@/lib/paths";
import { decryptBackup } from "./crypto";
import { getAllTables } from "./schema";
import {
  BACKUP_VERSION,
  BACKUP_VERSION_MIN,
  type BackupFiles,
  type RestoreResult,
} from "./types";
import { revokeAllSessions } from "@/lib/auth/service";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------



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
  const rawFiles = (data.files ?? {
    uploads: {},
    avatars: {},
    sessionFiles: {},
    skills: {},
  }) as BackupFiles;
  const files: BackupFiles = {
    uploads: typeof rawFiles.uploads === "object" ? (rawFiles.uploads as Record<string, string>) : {},
    avatars: typeof rawFiles.avatars === "object" ? (rawFiles.avatars as Record<string, string>) : {},
    sessionFiles: typeof rawFiles.sessionFiles === "object" ? (rawFiles.sessionFiles as Record<string, string>) : {},
    skills: typeof rawFiles.skills === "object" ? (rawFiles.skills as Record<string, string>) : {},
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
    files = { uploads: {}, avatars: {}, sessionFiles: {}, skills: {} };

    for (const [key, value] of Object.entries(data)) {
      if (key === "files") {
        const f = value as Record<string, unknown>;
        files = {
          uploads: typeof f.uploads === "object" ? (f.uploads as Record<string, string>) : {},
          avatars: typeof f.avatars === "object" ? (f.avatars as Record<string, string>) : {},
          sessionFiles: typeof f.sessionFiles === "object" ? (f.sessionFiles as Record<string, string>) : {},
          skills: typeof f.skills === "object" ? (f.skills as Record<string, string>) : {},
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
// Insert rows into a table with column filtering
// ---------------------------------------------------------------------------

/** Regex to validate SQLite column names. */
const VALID_COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Optional foreign keys introduced by later schema versions. Older or
 * partially exported backups can contain a reference whose parent row is not
 * present. Preserve the child row and clear only that optional link instead
 * of aborting the entire restore.
 */
const MANDATORY_FOREIGN_KEYS: Array<{
  table: string;
  column: string;
  parentTable: string;
}> = [
  { table: "automation_runs", column: "conversation_id", parentTable: "conversations" },
  { table: "automation_run_events", column: "run_id", parentTable: "automation_runs" },
  { table: "provider_models", column: "provider_id", parentTable: "providers" },
  { table: "build_runs", column: "conversation_id", parentTable: "conversations" },
  { table: "artifacts", column: "conversation_id", parentTable: "conversations" },
  { table: "sources", column: "conversation_id", parentTable: "conversations" },
  { table: "source_claims", column: "conversation_id", parentTable: "conversations" },
  { table: "messages", column: "conversation_id", parentTable: "conversations" },
  { table: "todo_items", column: "conversation_id", parentTable: "conversations" },
  { table: "routine_logs", column: "routine_id", parentTable: "routines" },
  { table: "scheduled_tasks", column: "conversation_id", parentTable: "conversations" },
  { table: "agent_tasks", column: "conversation_id", parentTable: "conversations" },
  { table: "webhook_events", column: "webhook_id", parentTable: "webhooks" },
];

const OPTIONAL_FOREIGN_KEYS: Array<{
  table: string;
  column: string;
  parentTable: string;
}> = [
  { table: "agent_tasks", column: "parent_task_id", parentTable: "agent_tasks" },
  { table: "agent_tasks", column: "automation_run_id", parentTable: "automation_runs" },
  { table: "routine_logs", column: "automation_run_id", parentTable: "automation_runs" },
  { table: "scheduled_tasks", column: "automation_run_id", parentTable: "automation_runs" },
  { table: "webhook_events", column: "automation_run_id", parentTable: "automation_runs" },
];

function rowIdSet(rows: Record<string, unknown>[] | undefined): Set<string> {
  return new Set(
    (rows ?? [])
      .map((row) => row.id)
      .filter((id) => id !== null && id !== undefined)
      .map((id) => String(id)),
  );
}

function hasMissingMandatoryForeignKey(
  tableName: string,
  row: Record<string, unknown>,
  tableIdSets: Map<string, Set<string>>,
): string | null {
  for (const relation of MANDATORY_FOREIGN_KEYS) {
    if (
      relation.table === tableName &&
      !tableIdSets.get(relation.parentTable)?.has(String(row[relation.column]))
    ) {
      return `${relation.column} → ${relation.parentTable}`;
    }
  }
  return null;
}

function clearDanglingOptionalForeignKeys(
  tableName: string,
  row: Record<string, unknown>,
  tableIdSets: Map<string, Set<string>>,
  warned: Set<string>,
  warnings: string[],
): Record<string, unknown> {
  let result = row;
  for (const relation of OPTIONAL_FOREIGN_KEYS) {
    if (relation.table !== tableName) continue;
    const value = row[relation.column];
    if (value === null || value === undefined || tableIdSets.get(relation.parentTable)?.has(String(value))) {
      continue;
    }

    if (result === row) result = { ...row };
    result[relation.column] = null;
    const warningKey = `${tableName}.${relation.column}`;
    if (!warned.has(warningKey)) {
      warned.add(warningKey);
      warnings.push(
        `Table "${tableName}": dangling ${relation.column} reference was cleared during restore.`,
      );
    }
  }
  return result;
}

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
type SqliteExecutor = Pick<typeof db, "run">;

function rootErrorMessage(error: unknown): string {
  let current: unknown = error;
  let fallback = "Unknown database error";
  for (let depth = 0; depth < 6 && current; depth++) {
    if (current instanceof Error && current.message) fallback = current.message;
    else if (typeof current === "object" && "message" in current && typeof current.message === "string") fallback = current.message;
    else if (typeof current === "string" && current) fallback = current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return fallback;
}

function insertRows(
  executor: SqliteExecutor,
  tableName: string,
  rows: Record<string, unknown>[],
  currentColumns: Set<string>,
  warnings: string[],
): number {
  if (rows.length === 0) return 0;

  let restored = 0;

  for (const [rowIndex, row] of rows.entries()) {
    // Filter to only columns that exist in the current DB
    const validCols = Object.keys(row).filter(
      (col) => VALID_COLUMN_RE.test(col) && currentColumns.has(col),
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
    try {
      executor.run(stmt);
    } catch (err) {
      const detail = rootErrorMessage(err);
      throw new Error(
        `Table "${tableName}", row ${rowIndex + 1}: ${detail}`,
        { cause: err },
      );
    }
    restored++;
  }

  return restored;
}

// ---------------------------------------------------------------------------
// Write files back to disk
// ---------------------------------------------------------------------------

async function restoreFiles(data: BackupFiles): Promise<{
  uploads: number;
  avatars: number;
  sessionFiles: number;
  skills: number;
}> {
  let uploads = 0;
  let avatars = 0;
  let sessionFiles = 0;
  let skills = 0;

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

  // Session sandboxes (including chat uploads under uploads/) — restored with
  // their per-conversation folder structure preserved.
  await fsp.mkdir(SESSION_FILES_DIR, { recursive: true });
  for (const [relPath, base64] of Object.entries(data.sessionFiles)) {
    const fullPath = path.join(SESSION_FILES_DIR, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, Buffer.from(base64, "base64"));
    sessionFiles++;
  }

  // Installed skills (source.json + skill folders) — restored with their
  // folder structure preserved.
  await fsp.mkdir(SKILLS_DIR, { recursive: true });
  for (const [relPath, base64] of Object.entries(data.skills ?? {})) {
    const fullPath = path.join(SKILLS_DIR, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, Buffer.from(base64, "base64"));
    skills++;
  }

  return { uploads, avatars, sessionFiles, skills };
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
  // ── Insert data ─────────────────────────────────────────────────────────
  const tableCounts: Record<string, number> = {};
  const tableIdSets = new Map(
    Object.entries(payload.tables).map(([tableName, rows]) => [tableName, rowIdSet(rows)]),
  );
  const danglingReferenceWarnings = new Set<string>();

  // Order tables so every known foreign-key parent is restored before its
  // children. In particular, agent_tasks.automation_run_id references
  // automation_runs; leaving automation_runs in the alphabetical "unknown"
  // section caused current backups to fail at agent_tasks.
  const preferredOrder = [
    "directories",
    "providers",
    "provider_models",
    "mcp_servers",
    "memories",
    "user_preferences",
    "conversations",
    "automation_runs",
    "automation_run_events",
    "build_runs",
    "artifacts",
    "sources",
    "source_claims",
    "tool_configs",
    "messages",
    "todo_items",
    "routines",
    "routine_logs",
    "scheduled_tasks",
    "webhooks",
    "webhook_events",
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

  // Keep the wipe and restore in one atomic transaction. SQLite only changes
  // foreign_keys outside a transaction; disabling it here also lets us restore
  // older/partial backups without depending on table order.
  db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    db.transaction((tx) => {
      // Delete application data only after validation/decryption succeeded.
      // Because this is the same transaction as insertion, any failed row
      // rolls the wipe back instead of leaving a partially restored database.
      for (const table of currentTables) {
        if (["backup_history", "auth_accounts", "auth_sessions", "auth_bootstrap"].includes(table.name)) continue;
        tx.run(sql`DELETE FROM ${sql.identifier(table.name)}`);
      }
      tx.run(sql`DELETE FROM sqlite_sequence`);

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

        // Authentication is installation-local and was not part of the
        // original backup format. Ignore it even for interim auth-aware backup
        // files so restore can never replace the current account.
        if (["auth_accounts", "auth_sessions", "auth_bootstrap"].includes(tableName)) {
          warnings.push(`Table "${tableName}" was skipped because authentication is not part of application backups.`);
          continue;
        }

        const restoreRows: Record<string, unknown>[] = [];
        for (const row of rows) {
          const missingParent = hasMissingMandatoryForeignKey(tableName, row, tableIdSets);
          if (missingParent) {
            const warningKey = `${tableName}.${missingParent}`;
            if (!danglingReferenceWarnings.has(warningKey)) {
              danglingReferenceWarnings.add(warningKey);
              warnings.push(
                `Table "${tableName}": rows with missing mandatory reference ${missingParent} were skipped during restore.`,
              );
            }
            continue;
          }
          restoreRows.push(
            clearDanglingOptionalForeignKeys(
              tableName,
              row,
              tableIdSets,
              danglingReferenceWarnings,
              warnings,
            ),
          );
        }
        const count = insertRows(tx, tableName, restoreRows, currentCols, warnings);
        if (count > 0) tableCounts[tableName] = count;
      }
    });
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`);
  }

  // ── Restore files ──────────────────────────────────────────────────────
  const fileStats = payload.includesFiles
    ? await restoreFiles(payload.files)
    : { uploads: 0, avatars: 0, sessionFiles: 0, skills: 0 };

  revokeAllSessions();

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
