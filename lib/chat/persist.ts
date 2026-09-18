import type { UIMessage } from "ai";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";

export async function persistUIMessage(conversationId: number, message: UIMessage) {
  db.transaction((tx) => {
    const last = tx
      .select({ orderIndex: messages.orderIndex })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.orderIndex))
      .limit(1)
      .get();

    tx
      .insert(messages)
      .values({
        uiId: message.id,
        conversationId,
        role: message.role,
        parts: message.parts,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      })
      .onConflictDoNothing({ target: [messages.conversationId, messages.uiId] }).run();
  });
}

export function toUIMessage(row: typeof messages.$inferSelect): UIMessage {
  return {
    id: row.uiId,
    role: row.role,
    parts: row.parts as UIMessage["parts"],
  };
}
