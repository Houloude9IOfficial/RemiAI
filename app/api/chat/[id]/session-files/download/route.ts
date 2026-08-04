import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { zipSessionFiles } from "@/lib/session-files/storage";

/** GET /api/chat/:id/session-files/download — download the sandbox as a .zip. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const row = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  try {
    const buffer = await zipSessionFiles(conversationId);
    const safeTitle = (row.id ?? "session").toString();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="remi-session-${safeTitle}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create zip archive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
