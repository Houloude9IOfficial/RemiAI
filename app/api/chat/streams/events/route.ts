import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/auth/service";
import { activeDurableRuns } from "@/lib/chat/generation-runs";
import {
  generationSnapshot,
  subscribeGenerationEvents,
  type GenerationDescriptor,
  type GenerationEvent,
  type GenerationStatus,
} from "@/lib/chat/generation-events";
import { streamRegistry } from "@/lib/chat/stream-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** EventSource reconnects automatically; 30s of silence is within proxy idle
 *  timeouts in practice, and terminal states are already pushed on change. */
const KEEPALIVE_MS = 30_000;

/**
 * Push feed of generation lifecycle changes.
 *
 * Replaces the client's former 1–1.5s polling of `/api/chat/streams` and
 * `/api/chat/:id/stream/status`: one authenticated SSE connection per tab
 * receives a full snapshot on connect (so reconnects reconcile missed events)
 * plus an incremental event whenever a generation changes state.
 */
export async function GET() {
  if (!await getCurrentAccount()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let unsubscribe: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  const stream = new ReadableStream<string>({
    async start(controller) {
      const send = (event: GenerationEvent) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // The cancel handler releases the listener after a disconnected client.
        }
      };

      let snapshot: GenerationDescriptor[];
      try {
        snapshot = await buildSnapshot();
      } catch {
        // A transient DB failure must not drop the live channel — the
        // in-memory descriptors are still the freshest source of truth.
        snapshot = generationSnapshot();
      }
      if (cancelled) return;
      send({ type: "snapshot", generations: snapshot });

      unsubscribe = subscribeGenerationEvents(send);
      keepalive = setInterval(() => {
        try {
          controller.enqueue(": keepalive\n\n");
        } catch {
          unsubscribe?.();
          if (keepalive) clearInterval(keepalive);
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      cancelled = true;
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

/**
 * Merge in-memory descriptors with durable runs so a client that connects
 * before a run published its registry stream (for example right after a server
 * restart) still receives every recovering generation.
 */
async function buildSnapshot(): Promise<GenerationDescriptor[]> {
  const byConversation = new Map<number, GenerationDescriptor>();
  for (const descriptor of generationSnapshot()) {
    byConversation.set(descriptor.conversationId, descriptor);
  }
  const durable = await activeDurableRuns();
  for (const row of durable) {
    const existing = byConversation.get(row.conversationId);
    if (existing) {
      // The in-memory descriptor is fresher for reconnect data (a `null`
      // stream id there means the stream is between runs); the durable
      // transition is authoritative for lifecycle status.
      byConversation.set(row.conversationId, {
        ...existing,
        status: row.status as GenerationStatus,
      });
      continue;
    }
    byConversation.set(row.conversationId, {
      conversationId: row.conversationId,
      streamId: streamRegistry.id(row.conversationId),
      assistantMessageId: row.assistantMessageId,
      status: row.status as GenerationStatus,
    });
  }
  return [...byConversation.values()];
}
