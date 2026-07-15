/**
 * GET /api/watcher/stream
 *
 * Server-Sent Events endpoint for real-time watcher status updates.
 * Keeps the connection open and pushes JSON events whenever the
 * watcher status changes (e.g., scan starts/ends, files indexed).
 */
import { NextResponse } from "next/server";
import { watcherEventBus } from "@/lib/fs/watcher-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let unsubscribe: (() => void) | undefined;
  let cleanupInterval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<string>({
    start(controller) {
      // Send an initial ping so the client knows the connection is open
      controller.enqueue("data: {\"type\":\"connected\"}\n\n");

      // Subscribe to watcher events for real-time updates
      unsubscribe = watcherEventBus.onEvent((payload) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
        } catch {
          // Client disconnected — clean up
        }
      });

      // Also ping every 5s to keep the connection alive and detect stale clients
      cleanupInterval = setInterval(() => {
        try {
          controller.enqueue(": keepalive\n\n");
        } catch {
          // Client disconnected
          if (unsubscribe) unsubscribe();
          clearInterval(cleanupInterval);
          controller.close();
        }
      }, 5_000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (cleanupInterval) clearInterval(cleanupInterval);
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
