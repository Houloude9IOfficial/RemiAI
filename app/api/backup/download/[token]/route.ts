import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { claimBackupDownload, streamClaimedBackup } from "@/lib/backup/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/backup/download/:token
 *
 * Streams a staged encrypted backup. Tokens are opaque, single-use, and
 * expire when the staging cleanup runs. The API proxy keeps this route behind
 * the normal authenticated session wall.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const claimed = await claimBackupDownload(token);
    if (!claimed) {
      return NextResponse.json(
        { error: "Backup download not found or expired." },
        { status: 404 },
      );
    }

    const { stream, size } = streamClaimedBackup(claimed);
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": 'attachment; filename="remiai-backup.remi-backup"',
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download backup";
    console.error("[backup/download] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
