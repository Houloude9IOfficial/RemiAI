import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/paths";

const DOWNLOAD_DIR = path.join(DATA_DIR, "backup-downloads");
const DOWNLOAD_TTL_MS = 15 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

function pendingPath(token: string): string {
  return path.join(DOWNLOAD_DIR, `${token}.pending.remi-backup`);
}

function activePath(token: string): string {
  return path.join(DOWNLOAD_DIR, `${token}.active.remi-backup`);
}

function isDownloadFileName(name: string): boolean {
  return (
    /^[A-Za-z0-9_-]{20,100}\.(?:pending|active)\.remi-backup$/.test(name) ||
    /^\.[A-Za-z0-9_-]{20,100}\.\d+\.[a-f0-9]{16}\.tmp$/.test(name)
  );
}

async function ensureDownloadDirectory(): Promise<void> {
  await fsp.mkdir(DOWNLOAD_DIR, { recursive: true, mode: 0o700 });
}

/** Remove abandoned staged backups so encrypted data does not accumulate. */
export async function cleanupExpiredBackupDownloads(includeActive = true): Promise<void> {
  try {
    const entries = await fsp.readdir(DOWNLOAD_DIR, { withFileTypes: true });
    const expiresBefore = Date.now() - DOWNLOAD_TTL_MS;

    await Promise.all(
      entries
        .filter((entry) =>
          entry.isFile() &&
          isDownloadFileName(entry.name) &&
          (includeActive ||
            !entry.name.endsWith(".active.remi-backup")),
        )
        .map(async (entry) => {
          const filePath = path.join(DOWNLOAD_DIR, entry.name);
          try {
            const stats = await fsp.stat(filePath);
            if (stats.mtimeMs < expiresBefore) await fsp.unlink(filePath);
          } catch {
            // Another request may have claimed or removed the file already.
          }
        }),
    );
  } catch {
    // The directory may not exist yet; staging creates it on first export.
  }
}

/**
 * Write an encrypted backup to a private, short-lived staging file.
 * The returned token is opaque and never derived from user data.
 */
export async function stageBackup(encrypted: string): Promise<{ token: string; size: number }> {
  await ensureDownloadDirectory();
  // Do not remove active streams during a concurrent request. Abandoned
  // active files are cleaned on the next server startup.
  await cleanupExpiredBackupDownloads(false);

  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const finalPath = pendingPath(token);
  const temporaryPath = path.join(
    DOWNLOAD_DIR,
    `.${token}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );

  try {
    await fsp.writeFile(temporaryPath, encrypted, {
      encoding: "utf8",
      mode: 0o600,
    });
    // Atomic publication prevents a download request from seeing a partial file.
    await fsp.rename(temporaryPath, finalPath);
    return { token, size: Buffer.byteLength(encrypted, "utf8") };
  } catch (err) {
    await fsp.unlink(temporaryPath).catch(() => undefined);
    throw err;
  }
}

/**
 * Atomically claim a staged backup for one download request.
 * A token cannot be downloaded twice concurrently or reused after claiming.
 */
export async function claimBackupDownload(
  token: string,
): Promise<{ path: string; size: number } | null> {
  if (!TOKEN_RE.test(token)) return null;

  // Do not remove active streams during a concurrent request. Abandoned
  // active files are cleaned on the next server startup.
  await cleanupExpiredBackupDownloads(false);

  const sourcePath = pendingPath(token);
  const claimedPath = activePath(token);
  try {
    await fsp.rename(sourcePath, claimedPath);
    const stats = await fsp.stat(claimedPath);
    if (!stats.isFile()) {
      await fsp.unlink(claimedPath).catch(() => undefined);
      return null;
    }
    return { path: claimedPath, size: stats.size };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
}

/**
 * Open a claimed backup as a stream and delete it when the response closes.
 * Deleting on close also works on Windows, where deleting an open file fails.
 */
export function streamClaimedBackup(
  claimed: { path: string; size: number },
): { stream: fs.ReadStream; size: number } {
  const stream = fs.createReadStream(claimed.path);
  const cleanup = () => {
    void fsp.unlink(claimed.path).catch(() => undefined);
  };
  stream.once("close", cleanup);
  stream.once("error", cleanup);
  return { stream, size: claimed.size };
}

export const BACKUP_DOWNLOAD_TTL_MINUTES = DOWNLOAD_TTL_MS / 60_000;
