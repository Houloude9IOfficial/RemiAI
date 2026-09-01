import { NextRequest, NextResponse } from "next/server";
import { exportBackup } from "@/lib/backup/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/backup/export
 *
 * Creates an encrypted backup of all user data.
 *
 * Request body:
 *   { password: string, includeFiles: boolean }
 *
 * Response (JSON):
 *   encrypted: string     — base64-encoded encrypted blob
 *   stats: { tables, uploads, avatars }
 *   size: number          — byte size of the encrypted blob
 */
export async function POST(req: NextRequest) {
  try {
    const body: { password?: string; includeFiles?: boolean } =
      await req.json();

    if (!body.password || typeof body.password !== "string" || body.password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 },
      );
    }

    const includeFiles = body.includeFiles ?? true;

    const result = await exportBackup(body.password, includeFiles);

    return NextResponse.json({
      encrypted: result.encrypted,
      stats: result.stats,
      size: result.encrypted.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown export error";
    console.error("[backup/export] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/backup/export — not supported
 */
export async function GET() {
  return NextResponse.json(
    { error: "Use POST to create a backup." },
    { status: 405 },
  );
}
