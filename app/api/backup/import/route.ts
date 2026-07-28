import { NextRequest, NextResponse } from "next/server";
import { importBackup } from "@/lib/backup/import";

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
      encrypted = await req.text();
      password = req.headers.get("x-remiai-backup-password");
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
