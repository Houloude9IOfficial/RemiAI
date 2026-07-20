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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const password = formData.get("password") as string | null;

    if (!file) {
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

    // Read the file content as text (it's base64-encoded)
    const encrypted = await file.text();

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
