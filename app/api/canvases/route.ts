import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { listCanvases } from "@/lib/canvas/storage";
import { buildSessionFileUrl } from "@/lib/session-files/storage";

/** GET /api/canvases?conversationId={id} — list canvas projects for a conversation. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = z
    .object({ conversationId: z.coerce.number().int().positive() })
    .safeParse(Object.fromEntries(url.searchParams));

  // No conversationId → return all conversations that have at least one canvas.
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Missing or invalid 'conversationId' query parameter" },
      { status: 400 },
    );
  }

  const { conversationId } = parsed.data;
  const row = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const canvases = await listCanvases(conversationId);
  return NextResponse.json({
    conversationId,
    count: canvases.length,
    canvases: canvases.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      entryFile: c.entryFile,
      updatedAt: c.updatedAt,
      previewUrl: c.previewUrl,
      files: c.files.map((f) => ({
        ...f,
        // Canonical URL so the panel can link/open/download each file
        // (mirrors the canvas tool result serialisation).
        url: f.isDirectory ? null : buildSessionFileUrl(conversationId, f.path),
      })),
    })),
  });
}