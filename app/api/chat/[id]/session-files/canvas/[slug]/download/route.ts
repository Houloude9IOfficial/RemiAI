import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { zipSessionFiles } from "@/lib/session-files/storage";
import { CANVAS_ROOT } from "@/lib/canvas/storage";

/**
 * GET /api/chat/:id/session-files/canvas/:slug/download
 * Download a specific canvas project as a .zip archive.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; slug: string }> },
) {
  const { id, slug } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const row = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const canvasFolder = `${CANVAS_ROOT}/${slug}`;

  try {
    const buffer = await zipSessionFiles(conversationId, canvasFolder);
    const safeTitle = slug || "canvas";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeTitle}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create zip archive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
