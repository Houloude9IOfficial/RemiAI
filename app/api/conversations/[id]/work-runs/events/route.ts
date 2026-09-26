import { latestWorkRunEvent, subscribeWorkRunEvents } from "@/lib/work/events";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const conversationId = Number(id);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { const encoder = new TextEncoder(); const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); const latest = latestWorkRunEvent(conversationId); if (latest) send(latest); const unsubscribe = subscribeWorkRunEvents((event) => { if (event.conversationId === conversationId) send(event); }); const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 25_000); _req.signal.addEventListener("abort", () => { clearInterval(heartbeat); unsubscribe(); controller.close(); }, { once: true }); } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
