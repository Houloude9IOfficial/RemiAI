import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
  resolveSessionPath,
  getMimeType,
} from "@/lib/session-files/storage";

/**
 * GET /api/chat/:id/session-files/{path...}
 *
 * Serves a file from the conversation's session sandbox by URL path.
 * This powers clean, embeddable file URLs (e.g.
 * `/api/chat/5/session-files/assets/img/earth.jpg`) that the AI can use in
 * markdown (`![...](url)`) and that URL-based tools resolve from disk.
 *
 * - `?download=1` adds a Content-Disposition: attachment header so the
 *   browser downloads the file instead of navigating to it.
 * - Path traversal is blocked by resolveSessionPath (lexical + realpath
 *   containment checks inside the sandbox).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  const { id, path: segments } = await params;
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

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Missing file path" }, { status: 400 });
  }

  const filePath = segments.map((s) => decodeURIComponent(s)).join("/");
  const download = new URL(req.url).searchParams.get("download") === "1";
  const filename = filePath.split("/").pop() ?? "file";

  try {
    const target = await resolveSessionPath(conversationId, filePath);

    let stats;
    try {
      stats = await fs.stat(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json(
          { error: `File not found in session sandbox: "${filePath}"` },
          { status: 404 },
        );
      }
      throw err;
    }
    if (!stats.isFile()) {
      return NextResponse.json(
        { error: `"${filePath}" is not a file` },
        { status: 400 },
      );
    }

    const data = await fs.readFile(target);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": getMimeType(filename),
        "Content-Length": String(stats.size),
        ...(download
          ? {
              "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            }
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
