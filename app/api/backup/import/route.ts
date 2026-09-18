import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { importBackup, importBackupFile } from "@/lib/backup/import";
import { DATA_DIR } from "@/lib/paths";

/**
 * POST /api/backup/import
 *
 * Restores data from an encrypted backup file.
 *
 * Request (multipart/form-data):
 *   file: File           — the .remi-backup file to restore
 *   password: string     — password to decrypt the backup
 *
 * Response:
 *   { success: true, tables: {...}, files: {...}, exportedAt, appVersion }
 *
 * ⚠️ This WILL overwrite ALL existing data in the database.
 *    The caller should confirm with the user before sending this request.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let encrypted: string | null = null;
    let password: string | null = null;

    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      password = typeof formData.get("password") === "string" ? formData.get("password") as string : null;
      encrypted = file instanceof File ? await file.text() : null;
    } else if (contentType.toLowerCase().startsWith("text/plain") || contentType.toLowerCase().startsWith("application/octet-stream")) {
      password = req.headers.get("x-remiai-backup-password");
      if (!req.body) return NextResponse.json({ error: "No backup file provided." }, { status: 400 });
      if (!password || password.length < 4) return NextResponse.json({ error: "Password must be at least 4 characters." }, { status: 400 });
      const importDir = path.join(DATA_DIR, "backup-imports");
      await fsp.mkdir(importDir, { recursive: true, mode: 0o700 });
      const input = path.join(importDir, `${crypto.randomBytes(24).toString("base64url")}.upload`);
      try {
        console.info("[backup/import] receiving streamed upload");
        await pipeline(Readable.fromWeb(req.body as never), fs.createWriteStream(input, { flags: "wx", mode: 0o600 }));
        const result = await importBackupFile(input, password);
        return NextResponse.json(result);
      } finally {
        await fsp.unlink(input).catch(() => undefined);
      }
    } else {
      const body = await req.json() as { encrypted?: unknown; password?: unknown };
      encrypted = typeof body.encrypted === "string" ? body.encrypted : null;
      password = typeof body.password === "string" ? body.password : null;
    }

    if (!encrypted) {
      return NextResponse.json(
        { error: "No backup file provided." },
        { status: 400 },
      );
    }

    if (!password || password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 },
      );
    }

    if (!encrypted || encrypted.length < 64) {
      return NextResponse.json(
        { error: "Invalid or corrupted backup file." },
        { status: 400 },
      );
    }

    const result = await importBackup(encrypted, password);

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown import error";
    console.error("[backup/import] Error:", err);

    // Distinguish auth errors from other failures
    if (message.toLowerCase().includes("wrong password") || message.toLowerCase().includes("decrypt")) {
      return NextResponse.json({ error: "Wrong password or corrupted backup file." }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/backup/import — not supported
 */
export async function GET() {
  return NextResponse.json(
    { error: "Use POST to restore a backup." },
    { status: 405 },
  );
}
