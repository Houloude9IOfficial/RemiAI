import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { webhooks, webhookEvents } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { processWebhookEvent } from "@/lib/webhooks/runner";

/** Test runs always wait for the AI (bounded), so the UI shows the result. */
const TEST_TIMEOUT_MS = 120_000;

const testSchema = z.object({
  payload: z.unknown().optional(),
});

/**
 * POST /api/webhooks/:id/test — manually fire a webhook with an optional
 * sample payload and wait for the AI result. Useful for verifying the trigger
 * prompt + tool access before pointing a real service at the endpoint.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const webhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, Number(id)))
    .get();
  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  let payload: unknown = { test: true, message: "Test webhook delivery" };
  try {
    const body = testSchema.parse(await req.json().catch(() => ({})));
    if (body.payload !== undefined) payload = body.payload;
  } catch (err) {
    return jsonError(err);
  }

  const event = await db
    .insert(webhookEvents)
    .values({ webhookId: webhook.id, status: "received", payload })
    .returning()
    .get();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: Awaited<ReturnType<typeof processWebhookEvent>> | "TIMEOUT";
  try {
    outcome = await Promise.race([
      processWebhookEvent({
        webhook,
        eventId: event.id,
        payload,
        headers: { "x-test": "true" },
        query: {},
      }),
      new Promise<"TIMEOUT">((resolve) => {
        timer = setTimeout(() => resolve("TIMEOUT"), TEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }

  if (outcome === "TIMEOUT") {
    return NextResponse.json({
      ok: true,
      processing: true,
      eventId: event.id,
      note: "Run is still processing in the background; check the conversation.",
    });
  }
  if (outcome.error) {
    return NextResponse.json({ ok: false, error: outcome.error, eventId: event.id });
  }
  return NextResponse.json({ ok: true, result: outcome.result ?? "", eventId: event.id });
}
