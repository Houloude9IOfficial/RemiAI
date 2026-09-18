import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
  conversationTitleEventBus,
  type ConversationTitleUpdatedPayload,
} from "@/lib/chat/title-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const conversation = await db
    .select({ title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  let unsubscribe: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  const send = (controller: ReadableStreamDefaultController<string>, payload: ConversationTitleUpdatedPayload) => {
    controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const stream = new ReadableStream<string>({
    start(controller) {
      // A snapshot makes reconnects reliable if the title was generated while
      // the page's EventSource was briefly unavailable.
      send(controller, {
        type: "conversation-title-updated",
        conversationId,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      });
      unsubscribe = conversationTitleEventBus.onUpdated((payload) => {
        if (payload.conversationId !== conversationId) return;
        try {
          send(controller, payload);
        } catch {
          // The cancel handler releases the listener after a disconnected client.
        }
      });
      keepalive = setInterval(() => {
        try {
          controller.enqueue(": keepalive\n\n");
        } catch {
          unsubscribe?.();
          if (keepalive) clearInterval(keepalive);
        }
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new NextResponse(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
