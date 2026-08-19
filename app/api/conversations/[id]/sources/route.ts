import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
  listConversationClaims,
  listConversationSources,
} from "@/lib/research/source-storage";

function parseConversationId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const conversationId = parseConversationId(rawId);
  if (conversationId === null) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const conversation = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const [rows, claims] = await Promise.all([
    listConversationSources(conversationId),
    listConversationClaims(conversationId),
  ]);
  return NextResponse.json({ conversationId, sources: rows, claims });
}
