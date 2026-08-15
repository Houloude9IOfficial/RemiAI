import { redirect } from "next/navigation";
import { db } from "@/db";
import { conversations } from "@/db/schema";

// Never prerender this page at build time. It auto-creates a NEW conversation
// and redirects there, so opening the site without a chat id always starts a
// fresh chat instead of resuming the most recent one. If Next.js statically
// renders it during `next build`, the redirect is baked into the shipped HTML
// using the build-time database — whose conversation IDs almost certainly
// don't exist on the deployed instance (fresh or read-only volumes,
// multi-instance deployments). The user then lands on /chat/<stale-id> which
// 404s and, without client-side error handling, shows an eternal loading
// skeleton.
export const dynamic = "force-dynamic";

export default async function ChatHomePage() {
  // Auto-create a brand-new conversation and redirect to it. This saves the
  // user from landing on a dead /chat/conversations page that shows a
  // never-resolving skeleton, and always starts fresh rather than resuming an
  // old chat.
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
