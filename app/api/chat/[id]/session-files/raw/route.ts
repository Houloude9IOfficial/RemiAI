import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
  resolveSessionPath,
  getMimeType,
} from "@/lib/session-files/storage";

/** GET /api/chat/:id/session-files/raw?path=... — raw file bytes (images, downloads). */
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
    const target = await resolveSessionPath(conversationId, filePath);
    const data = await fs.readFile(target);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const filename = filePath.split("/").pop() ?? "file";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": getMimeType(filename),
        ...(download
          ? { "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` }
          : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read file";
    const status = message.toLowerCase().includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
