import { NextResponse } from "next/server";
import { notificationBus } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SSE endpoint that streams scheduled task completion events to connected clients.
 * The frontend subscribes to this and shows native browser notifications.
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`),
      );

      // Subscribe to notification bus
      const unsubscribe = notificationBus.subscribe((task) => {
        try {
          const event = {
            type: "scheduled_task_completed",
            task: {
              id: task.id,
              conversationId: task.conversationId,
              triggerAt: task.triggerAt,
              task: task.task,
              status: task.status,
              result: task.result,
              error: task.error,
              completedAt: task.completedAt,
            },
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Client disconnected
          unsubscribe();
        }
      });

      // Keepalive every 30 seconds to prevent connection drops
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
          unsubscribe();
        }
      }, 30_000);

      // Cleanup on disconnect
      const cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
      };

      // @ts-expect-error - ReadableStream controller has oncancel in some runtimes
      controller.oncancel = cleanup;
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
