import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth/service";
import { streamRegistry } from "@/lib/chat/stream-registry";
import { activeDurableConversationIds } from "@/lib/chat/generation-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-authoritative inventory used by the sidebar and returning tabs. */
export async function GET() {
  if (!await getCurrentAccount()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ids = new Set([
    ...streamRegistry.activeConversationIds(),
    ...await activeDurableConversationIds(),
  ]);
  return NextResponse.json({ conversationIds: [...ids] });
}
