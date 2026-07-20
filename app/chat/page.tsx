import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

export default async function ChatHomePage() {
  // Fetch the most recently updated conversation
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (rows.length > 0) {
    // Redirect to the most recent conversation
    redirect(`/chat/${rows[0].id}`);
  }

  // No conversations — auto-create one and redirect there.
  // This saves the user from landing on a dead /chat/conversations page
  // that shows a never-resolving skeleton (99% of the time it's empty after
  // a fresh start or data wipe).
  const row = await db
    .insert(conversations)
    .values({
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  redirect(`/chat/${row.id}`);
}
