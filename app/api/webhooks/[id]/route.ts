import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { webhooks, webhookEvents, conversations } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { evaluateConditions } from "@/lib/webhooks/conditions";
import { processWebhookEvent } from "@/lib/webhooks/runner";

/** How long a sync delivery waits for the AI run before acknowledging as "processing". */
const SYNC_TIMEOUT_MS = 90_000;

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  systemPrompt: z.string().max(8000).optional(),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1),
        op: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "exists", "matches"]),
        value: z.string().optional(),
      }),
    )
    .optional(),
  conversationId: z.coerce.number().int().positive().optional().nullable(),
  respondSync: z.boolean().optional(),
  enabled: z.boolean().optional(),
  regenerateSecret: z.boolean().optional(),
});

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function extractSecret(req: Request): string | null {
  const header = req.headers.get("x-webhook-secret");
  if (header) return header;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  return null;
}

function headerRecord(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * Parse the raw request body: JSON when possible, otherwise wrap it so the
 * payload column (JSON mode) always stores a JSON-serialisable value.
 */
async function parseBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return { raw: "" };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, contentType: req.headers.get("content-type") ?? undefined };
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "TIMEOUT"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"TIMEOUT">((resolve) => {
        timer = setTimeout(() => resolve("TIMEOUT"), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function parseQuery(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/**
 * POST /api/webhooks/:id — public webhook delivery endpoint.
 *
 * Authenticated with the per-webhook secret (X-Webhook-Secret header or
 * Authorization: Bearer). On acceptance it records a webhook event and runs
 * the AI in the webhook's conversation — either synchronously (response text
 * returned to the caller) or fire-and-forget (instant 202 ack).
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

  const secret = extractSecret(req);
  if (!secret || !safeEqual(secret, webhook.secret)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  if (!webhook.enabled) {
    // Acknowledge silently so providers stop retrying.
    return NextResponse.json({ ok: true, disabled: true });
  }

  const payload = await parseBody(req);
  const query = parseQuery(req);
  const headers = headerRecord(req);

  // Structured filter conditions (AND). Skip the run when they don't match.
  if (!evaluateConditions(payload, webhook.conditions)) {
    const event = await db
      .insert(webhookEvents)
      .values({ webhookId: webhook.id, status: "skipped", payload })
      .returning()
      .get();
    await db
      .update(webhooks)
      .set({
        lastReceivedAt: new Date().toISOString(),
        lastStatus: "skipped",
        lastEventId: event.id,
      })
      .where(eq(webhooks.id, webhook.id))
      .run();
    return NextResponse.json({ ok: true, skipped: true, eventId: event.id });
  }

  const event = await db
    .insert(webhookEvents)
    .values({ webhookId: webhook.id, status: "received", payload })
    .returning()
    .get();

  const run = () =>
    processWebhookEvent({
      webhook,
      eventId: event.id,
      payload,
      headers,
      query,
    });

  if (webhook.respondSync) {
    const outcome = await withTimeout(run(), SYNC_TIMEOUT_MS);
    if (outcome === "TIMEOUT") {
      // Let the run keep going in the background; the caller gets an ack.
      return NextResponse.json({
        ok: true,
        processing: true,
        eventId: event.id,
        note: "Run is still processing in the background; check the conversation.",
      });
    }
    if (outcome.error) {
      return NextResponse.json({ ok: false, error: outcome.error, eventId: event.id }, { status: 500 });
    }
    return NextResponse.json({ ok: true, result: outcome.result ?? "", eventId: event.id });
  }

  // Fire-and-forget: acknowledge immediately, run in the background.
  void run();
  return NextResponse.json({ ok: true, eventId: event.id }, { status: 202 });
}

/**
 * GET /api/webhooks/:id — verification ping (public, secret-authenticated).
 * Supports the Meta-style GET challenge (hub.challenge echo) used to verify
 * Instagram/Facebook/Messenger webhooks.
 */
export async function GET(
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

  const query = parseQuery(req);
  const verifyToken = query["hub.verify_token"];
  const presented = verifyToken ?? extractSecret(req);
  if (!presented || !safeEqual(presented, webhook.secret)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  if (query["hub.challenge"] !== undefined) {
    return new Response(query["hub.challenge"], {
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ ok: true, name: webhook.name, enabled: webhook.enabled });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: z.infer<typeof updateSchema>;
  try {
    body = updateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const existing = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, Number(id)))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  // Validate that a chosen conversation exists.
  if (body.conversationId !== undefined && body.conversationId !== null) {
    const conv = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, body.conversationId))
      .get();
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) data.name = body.name;
  if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt;
  if (body.conditions !== undefined) data.conditions = body.conditions;
  if (body.conversationId !== undefined) data.conversationId = body.conversationId;
  if (body.respondSync !== undefined) data.respondSync = body.respondSync;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.regenerateSecret) data.secret = crypto.randomBytes(24).toString("base64url");

  const row = await db
    .update(webhooks)
    .set(data)
    .where(eq(webhooks.id, Number(id)))
    .returning()
    .get();
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(webhooks).where(eq(webhooks.id, Number(id)));
  return NextResponse.json({ ok: true });
}
