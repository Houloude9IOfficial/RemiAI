import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";

const bodySchema = z.object({
  /** uiId of the message to delete — this message AND everything after it are removed. */
  uiId: z.string().min(1),
});

/**
 * DELETE /api/chat/:id/messages
 *
 * Deletes a message (by uiId) and all messages that come after it in the
 * conversation. Used by "Regenerate" on an assistant message: the client
 * trims its local list back to that point, this endpoint removes the
 * persisted rows so a page reload matches the regenerated history.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  // Find the target message's order index
  const target = await db
    .select({ orderIndex: messages.orderIndex })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.uiId, body.uiId),
      ),
    )
    .get();

  if (!target) {
    // Message was never persisted (e.g. an interrupted run) — nothing to trim.
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const deleted = await db
    .delete(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        gte(messages.orderIndex, target.orderIndex),
      ),
    )
    .returning({ id: messages.id });

  // The rolling conversation summary describes messages that were just
  // deleted/regenerated — reset it so the next request keeps the rebuilt
  // history verbatim instead of dropping messages the summary never covered.
  if (deleted.length > 0) {
    await db
      .update(conversations)
      .set({ summary: "", summaryMessageCount: 0 })
      .where(eq(conversations.id, conversationId));
  }

  return NextResponse.json({ ok: true, deleted: deleted.length });
}
