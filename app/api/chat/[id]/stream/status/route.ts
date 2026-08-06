import { NextResponse } from "next/server";
import { streamRegistry } from "@/lib/chat/stream-registry";

/**
 * Reports whether a conversation currently has a live server-side stream.
 *
 * The AI SDK's resumeStream() silently no-ops (204 → null → early return)
 * when there is no active stream to reconnect to, so the UI can't tell
 * "resumed" from "nothing happened". The Continue/retry flow checks this
 * endpoint first: resume the live stream if present, otherwise re-run the
 * generation from the accumulated messages.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = Number(id);
  return NextResponse.json({ active: streamRegistry.has(conversationId) });
}
