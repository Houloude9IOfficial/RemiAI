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
    const download = new URL(req.url).searchParams.get("download") === "1";
    const filename = filePath.split("/").pop() ?? "file";
    const stats = await fs.stat(target);
    const totalSize = stats.size;
    const mimeType = getMimeType(filename);

    // HTTP Range support — lets <video>/<audio> seek without buffering the
    // whole file (the browser sends `Range: bytes=start-end` when scrubbing).
    const range = req.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range.trim())) {
      const [startStr, endStr] = range.trim().slice(6).split("-");
      const start = startStr ? Number(startStr) : 0;
      let end = endStr ? Number(endStr) : totalSize - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= totalSize) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${totalSize}` },
        });
      }
      end = Math.min(end, totalSize - 1);
      const length = end - start + 1;
      const fd = await fs.open(target, "r");
      const buffer = Buffer.alloc(length);
      try {
        const { bytesRead } = await fd.read(buffer, 0, length, start);
        return new Response(new Uint8Array(buffer.subarray(0, bytesRead)), {
          status: 206,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(bytesRead),
            "Content-Range": `bytes ${start}-${start + bytesRead - 1}/${totalSize}`,
            "Accept-Ranges": "bytes",
            ...(download
              ? { "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` }
              : {}),
            "Cache-Control": "no-store",
          },
        });
      } finally {
        await fd.close();
      }
    }

    const data = await fs.readFile(target);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(totalSize),
        "Accept-Ranges": "bytes",
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
