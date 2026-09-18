import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";
import { UPLOAD_DIR, AVATAR_DIR, SESSION_FILES_DIR, SKILLS_DIR } from "@/lib/paths";
import { createBackupStage, publishBackupStage } from "./download";
import { encryptBackupStream } from "./crypto";
import { getAllTables } from "./schema";
import { BACKUP_VERSION } from "./types";

// ---------------------------------------------------------------------------
// App version (read from package.json at import time)
// ---------------------------------------------------------------------------

const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(/*turbopackIgnore: true*/ process.cwd(), "package.json"),
        "utf8",
      ),
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Export: gather all data, encrypt, return base64
// ---------------------------------------------------------------------------

export interface BackupHistoryData {
  exportedAt: string;
  totalSize: number;
  includesFiles: boolean;
  tableStats: Record<string, number>;
  uploadCount: number;
  avatarCount: number;
  skillCount: number;
  appVersion: string;
}

export interface ExportResult {
  staged: { token: string; size: number };
  history: BackupHistoryData;
  stats: {
    tables: Record<string, number>;
    uploads: number;
    avatars: number;
    sessionFiles: number;
    skills: number;
  };
}

/**
 * Record a backup only after the client has received the complete export
 * response. Keeping this separate from exportBackup prevents an upstream
 * proxy failure from leaving a successful-looking history row behind.
 */
export async function recordBackupHistory(data: BackupHistoryData): Promise<void> {
  await db.insert(backupHistory).values(data);
}

/**
 * Stage an encrypted backup for download without putting the backup contents
 * in the export JSON response. The token is intentionally separate from the
 * history metadata so it cannot expose the backup or its password.
 */
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
  const roots = [
    ["uploads", UPLOAD_DIR], ["avatars", AVATAR_DIR],
    ["sessionFiles", SESSION_FILES_DIR], ["skills", SKILLS_DIR],
  ] as const;
  const fileCounts = { uploads: 0, avatars: 0, sessionFiles: 0, skills: 0 };

  // ── Build payload ──────────────────────────────────────────────────────
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    includesFiles: includeFiles,
    data: {
      ...tableData,
    },
  };

  async function* archive(): AsyncGenerator<Buffer> {
    // Emit the v2 JSON shape a small piece at a time. Its contents remain
    // compatible with the existing restore validator; only its encrypted
    // envelope changes in v3.
    const { data: tableDataOnly, ...manifest } = payload;
    yield Buffer.from(`${JSON.stringify(manifest).slice(0, -1)},"data":${JSON.stringify(tableDataOnly).slice(0, -1)},"files":{`);
    let firstRoot = true;
    if (!includeFiles) {
      yield Buffer.from("}}}");
      return;
    }
    for (const [root, directory] of roots) {
      if (!firstRoot) yield Buffer.from(",");
      firstRoot = false;
      yield Buffer.from(`${JSON.stringify(root)}:{`);
      let firstFile = true;
      const walk = async function* (current: string, relative = ""): AsyncGenerator<{ fullPath: string; relative: string }> {
        let entries: fs.Dirent[];
        try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const next = path.join(current, entry.name);
          const rel = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) yield* walk(next, rel);
          else if (entry.isFile()) yield { fullPath: next, relative: rel };
        }
      };
      for await (const file of walk(directory)) {
        const size = (await fsp.stat(file.fullPath)).size;
        fileCounts[root]++;
        if (!firstFile) yield Buffer.from(",");
        firstFile = false;
        yield Buffer.from(`${JSON.stringify(file.relative)}:`);
        yield Buffer.from('"');
        let remainder = Buffer.alloc(0);
        for await (const part of fs.createReadStream(file.fullPath)) {
          const chunk = Buffer.concat([remainder, Buffer.from(part)]);
          const usable = chunk.length - (chunk.length % 3);
          if (usable) yield Buffer.from(chunk.subarray(0, usable).toString("base64"));
          remainder = chunk.subarray(usable);
        }
        if (remainder.length) yield Buffer.from(remainder.toString("base64"));
        yield Buffer.from('"');
      }
      yield Buffer.from("}");
    }
    yield Buffer.from("}}}");
  }
  const stage = await createBackupStage();
  console.info("[backup/export] streaming v3 archive", { includeFiles, tableCount: tables.length });
  try {
    await encryptBackupStream(Readable.from(archive()), stage.temporaryPath, password);
    const staged = await publishBackupStage(stage);
    console.info("[backup/export] staged v3 archive", { size: staged.size, ...fileCounts });
    return {
      staged,
      history: {
        exportedAt: payload.exportedAt,
        totalSize: staged.size,
        includesFiles: includeFiles,
        tableStats,
        uploadCount: fileCounts.uploads,
        avatarCount: fileCounts.avatars,
        skillCount: fileCounts.skills,
        appVersion: APP_VERSION,
      },
      stats: { tables: tableStats, uploads: fileCounts.uploads, avatars: fileCounts.avatars, sessionFiles: fileCounts.sessionFiles, skills: fileCounts.skills },
    };
  } catch (err) {
    await fsp.unlink(stage.temporaryPath).catch(() => undefined);
    console.error("[backup/export] streaming failed", err);
    throw err;
  }
}
