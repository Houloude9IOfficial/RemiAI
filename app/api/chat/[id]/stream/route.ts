import { NextResponse } from "next/server";
import { streamRegistry } from "@/lib/chat/stream-registry";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = Number(id);

  const stream = streamRegistry.get(conversationId);
  if (!stream) {
    // No active stream — nothing to reconnect to
    return new NextResponse(null, { status: 204 });
  }

  // Return the SSE stream for the reconnecting client.
  // The client-side DefaultChatTransport will parse the SSE events
  // and rebuild the UI messages from the beginning.
  return new NextResponse(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
