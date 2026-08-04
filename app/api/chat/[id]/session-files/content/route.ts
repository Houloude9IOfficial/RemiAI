import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { readSessionFile } from "@/lib/session-files/storage";

const VIEWER_LIMIT = 1_000_000; // 1 MB cap — matches readSessionFile's MAX_READ_LIMIT

/** GET /api/chat/:id/session-files/content?path=... — text content for the viewer. */
export async function GET(
  req: Request,
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

  const filePath = new URL(req.url).searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "Missing 'path' query parameter" }, { status: 400 });
  }

  try {
    const result = await readSessionFile(conversationId, filePath, 0, VIEWER_LIMIT);
    return NextResponse.json({
      path: filePath,
      name: filePath.split("/").pop(),
      content: result.content,
      totalBytes: result.totalBytes,
      isTruncated: result.isTruncated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read file";
    const status = message.toLowerCase().includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
