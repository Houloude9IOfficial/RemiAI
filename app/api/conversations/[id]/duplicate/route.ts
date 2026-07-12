import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const originalId = Number(id);

  // Fetch the original conversation
  const original = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, originalId))
    .get();

  if (!original) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  // Create a new conversation based on the original
  const dupe = await db
    .insert(conversations)
    .values({
      title: `${original.title} (copy)`,
      providerId: original.providerId,
      modelId: original.modelId,
    })
    .returning()
    .get();

  // Copy all messages with new uiIds
  const originalMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, originalId))
    .orderBy(asc(messages.orderIndex));

  if (originalMessages.length > 0) {
    await db
      .insert(messages)
      .values(
        originalMessages.map((msg) => ({
          uiId: crypto.randomUUID(),
          conversationId: dupe.id,
          role: msg.role,
          parts: msg.parts,
          orderIndex: msg.orderIndex,
        })),
      )
      .run();
  }

  return NextResponse.json(dupe, { status: 201 });
}
