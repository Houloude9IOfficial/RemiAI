import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { deleteConversationUploads } from "@/lib/chat/cleanup";

const batchDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export async function POST(req: Request) {
  let body: z.infer<typeof batchDeleteSchema>;
  try {
    body = batchDeleteSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  await db.delete(conversations).where(inArray(conversations.id, body.ids));

  // Clean up uploaded files for all deleted conversations
  await Promise.allSettled(body.ids.map(deleteConversationUploads));

  return NextResponse.json({ ok: true });
}
