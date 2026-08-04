import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
  listSessionFiles,
  deleteSessionFile,
  uploadSessionFile,
  MAX_UPLOAD_SIZE,
} from "@/lib/session-files/storage";

/** Validate that a conversation exists and return its id. */
async function resolveConversation(
  params: Promise<{ id: string }>,
): Promise<number> {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    throw new Error("Invalid conversation id");
  }
  const row = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!row) {
    throw new Error("Conversation not found");
  }
  return conversationId;
}

/** GET /api/chat/:id/session-files — list sandbox files. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await resolveConversation(params);
    const entries = await listSessionFiles(id, null);
    return NextResponse.json({
      conversationId: id,
      count: entries.length,
      files: entries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list session files";
    const status = message.toLowerCase().includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** POST /api/chat/:id/session-files — upload a file (multipart/form-data, field "file"). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await resolveConversation(params);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        {
          error: `File "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — exceeds the 25 MB limit`,
        },
        { status: 413 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const entry = await uploadSessionFile(id, file.name, buffer);
    return NextResponse.json({ ok: true, file: entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload file";
    const status = message.toLowerCase().includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/chat/:id/session-files — delete a file ({ path }). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await resolveConversation(params);
    const body = (await req.json().catch(() => ({}))) as { path?: string };
    if (!body.path || typeof body.path !== "string") {
      return NextResponse.json(
        { error: "Missing 'path' in request body" },
        { status: 400 },
      );
    }
    await deleteSessionFile(id, body.path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete file";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
