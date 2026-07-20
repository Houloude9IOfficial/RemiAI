// ---------------------------------------------------------------------------
// Backup format types
// ---------------------------------------------------------------------------

/** Current backup format version.
 *
 *  v1 — Original: hardcoded table keys (camelCase), hardcoded column names (camelCase).
 *  v2 — Dynamic: discovers tables from sqlite_master, uses actual snake_case names.
 */
export const BACKUP_VERSION = 2;

/** Earliest version the import can restore (with migration). */
export const BACKUP_VERSION_MIN = 1;

/** File extension for backup files. */
export const BACKUP_EXTENSION = ".remi-backup";

/** Human-readable media type for the backup file. */
export const BACKUP_MIME_TYPE = "application/vnd.remiai.backup+encrypted";

// ---------------------------------------------------------------------------
// Backup manifest (embedded in the encrypted payload)
// ---------------------------------------------------------------------------

export interface BackupManifest {
  /** Schema version — allows future migration during restore. */
  version: number;
  /** ISO‑8601 timestamp of when the backup was created. */
  exportedAt: string;
  /** App version from package.json at export time. */
  appVersion: string;
  /** Whether uploaded files and avatars are included. */
  includesFiles: boolean;
}

// ---------------------------------------------------------------------------
// Full backup payload (the plaintext that gets encrypted)
// ---------------------------------------------------------------------------

export interface BackupPayload extends BackupManifest {
  /**
   * Table data, keyed by the actual SQLite table name (snake_case).
   * In v2 exports, keys match `sqlite_master` table names exactly.
   * In v1 backups, keys use camelCase — the import migrates them.
   */
  data: BackupData;
}

// ---------------------------------------------------------------------------
// Dynamic table data — keyed by the actual SQLite table name
// ---------------------------------------------------------------------------

export interface BackupData {
  /** Table_name → Array of row objects (column_name → value). */
  [tableName: string]: Record<string, unknown>[] | BackupFiles;
}

// ---------------------------------------------------------------------------
// Embedded files (stored under data["files"])
// ---------------------------------------------------------------------------

export interface BackupFiles {
  /** Map of `uploads/{conversationId}/{filename}` → base64 content. */
  uploads: Record<string, string>;
  /** Map of `avatars/{filename}` → base64 content. */
  avatars: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Restore result
// ---------------------------------------------------------------------------

export interface RestoreResult {
  success: true;
  /** Table_name → rows restored. */
  tables: Record<string, number>;
  files: {
    uploads: number;
    avatars: number;
  };
  exportedAt: string;
  appVersion: string;
  /** Warnings collected during restore (e.g. skipped unknown columns). */
  warnings: string[];
}
