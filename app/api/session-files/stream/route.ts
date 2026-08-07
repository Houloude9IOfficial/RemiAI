/**
 * GET /api/session-files/stream
 *
 * Server-Sent Events endpoint for real-time session-file updates.
 * Keeps the connection open and pushes JSON events whenever any
 * conversation's sandbox changes (the AI writes/edits/deletes files,
 * the user uploads, etc.). Clients filter by conversationId.
 */
import { NextResponse } from "next/server";
import { sessionFilesEventBus } from "@/lib/session-files/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let unsubscribe: (() => void) | undefined;
  let cleanupInterval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<string>({
    start(controller) {
      // Send an initial ping so the client knows the connection is open
      controller.enqueue("data: {\"type\":\"connected\"}\n\n");

      // Subscribe to session-file change events for real-time updates
      unsubscribe = sessionFilesEventBus.onChanged((payload) => {
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
