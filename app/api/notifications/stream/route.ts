import { NextResponse } from "next/server";
import { subscribeAutomationNotifications } from "@/lib/runs/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));
      const unsubscribe = subscribeAutomationNotifications((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          unsubscribe();
        }
      });
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
          unsubscribe();
        }
      }, 30_000);
      // ReadableStream cancellation is runtime-dependent; this assignment is
      // supported by the Node/Web stream implementation used by Next.js.
      // @ts-expect-error controller cancellation hook is not in all TS libs
      controller.oncancel = () => {
        clearInterval(keepalive);
        unsubscribe();
      };
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
