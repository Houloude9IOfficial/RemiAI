import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { toUIMessage } from "@/lib/chat/persist";
import { deleteConversationUploads } from "@/lib/chat/cleanup";
import { deleteConversationSessionFiles } from "@/lib/session-files/storage";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  providerId: z.number().int().optional().nullable(),
  modelId: z.string().optional().nullable(),
  mode: z.enum(["chat", "goal", "plan", "build"]).optional(),
  qualityPolicy: z.enum(["fast", "balanced", "quality", "selected"]).optional(),
  bashMode: z.enum(["sandboxed", "full"]).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversation = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, Number(id)))
    .get();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, Number(id)))
    .orderBy(asc(messages.orderIndex));

  return NextResponse.json({ conversation, messages: rows.map(toUIMessage) });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const row = await db
    .update(conversations)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, Number(id)))
    .returning()
    .get();

  if (!row) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = Number(id);
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  // Clean up uploaded files + session sandbox files for this conversation
  await deleteConversationUploads(conversationId);
  await deleteConversationSessionFiles(conversationId);
  return NextResponse.json({ ok: true });
}
