import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";
import { encryptBackup } from "./crypto";
import { getAllTables } from "./schema";
import { BACKUP_VERSION, type BackupFiles } from "./types";

// ---------------------------------------------------------------------------
// App version (read from package.json at import time)
// ---------------------------------------------------------------------------

const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const AVATAR_DIR = path.join(DATA_DIR, "avatars");

// ---------------------------------------------------------------------------
// Read all files from a directory as base64
// ---------------------------------------------------------------------------

async function collectFiles(
  dir: string,
  basePrefix: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  try {
    await fsp.access(dir);
  } catch {
    return result;
  }

  async function walk(current: string, relativePrefix: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const buffer = await fsp.readFile(fullPath);
        result[relPath] = buffer.toString("base64");
      }
    }
  }

  await walk(dir, basePrefix);
  return result;
}

// ---------------------------------------------------------------------------
// Export: gather all data, encrypt, return base64
// ---------------------------------------------------------------------------

export interface ExportResult {
  encrypted: string;
  stats: {
    tables: Record<string, number>;
    uploads: number;
    avatars: number;
  };
}

export async function exportBackup(
  password: string,
  includeFiles: boolean,
): Promise<ExportResult> {
  // ── Discover tables dynamically from sqlite_master ──────────────────────
  const tables = getAllTables();
  const tableData: Record<string, unknown[]> = {};
  const tableStats: Record<string, number> = {};

  for (const t of tables) {
    // Backup history and authentication state are installation-local metadata,
    // not application data. Never export credentials, sessions, or bootstrap
    // secrets.
    if (["backup_history", "auth_accounts", "auth_sessions", "auth_bootstrap"].includes(t.name)) continue;

    const rows = db.all(
      sql`SELECT * FROM ${sql.identifier(t.name)}`,
    ) as Record<string, unknown>[];
    tableData[t.name] = rows;
    tableStats[t.name] = rows.length;
  }

  // ── Collect files ──────────────────────────────────────────────────────
  let files: BackupFiles = { uploads: {}, avatars: {} };
  if (includeFiles) {
    const [uploads, avatars] = await Promise.all([
      collectFiles(UPLOAD_DIR, ""),
      collectFiles(AVATAR_DIR, ""),
    ]);
    files = { uploads, avatars };
  }

  // ── Build payload ──────────────────────────────────────────────────────
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    includesFiles: includeFiles,
    data: {
      ...tableData,
      files,
    },
  };

  // ── Serialise & encrypt ────────────────────────────────────────────────
  const plaintext = JSON.stringify(payload);
  const encrypted = encryptBackup(plaintext, password);

  // ── Log backup history ────────────────────────────────────────────────
  try {
    await db.insert(backupHistory).values({
      exportedAt: payload.exportedAt,
      totalSize: encrypted.length,
      includesFiles: includeFiles,
      tableStats,
      uploadCount: Object.keys(files.uploads).length,
      avatarCount: Object.keys(files.avatars).length,
      appVersion: APP_VERSION,
    });
  } catch (err) {
    console.warn("[backup] Failed to log backup history:", err);
  }

  return {
    encrypted,
    stats: {
      tables: tableStats,
      uploads: Object.keys(files.uploads).length,
      avatars: Object.keys(files.avatars).length,
    },
  };
}
