import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { webhooks, conversations, providers, providerModels } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import type { WebhookCondition } from "@/db/schema";

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "exists", "matches"]),
  value: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  systemPrompt: z.string().max(8000).default(""),
  conditions: z.array(conditionSchema).default([]),
  conversationId: z.coerce.number().int().positive().optional().nullable(),
  respondSync: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Resolve the app's default provider/model (preferred default, else the first
 * enabled provider's first enabled model) so auto-created webhook
 * conversations are immediately runnable. Returns null when nothing is set up.
 */
async function resolveDefaultModel(): Promise<{
  providerId: number;
  modelId: string;
} | null> {
  const defaultModel = await db
    .select({ providerId: providerModels.providerId, modelId: providerModels.modelId })
    .from(providerModels)
    .where(eq(providerModels.isDefault, true))
    .get();
  if (defaultModel) return defaultModel;

  const provider = await db
    .select()
    .from(providers)
    .where(eq(providers.enabled, true))
    .get();
  if (!provider) return null;
  const model = await db
    .select({ modelId: providerModels.modelId })
    .from(providerModels)
    .where(and(eq(providerModels.providerId, provider.id), eq(providerModels.enabled, true)))
    .get();
  return model ? { providerId: provider.id, modelId: model.modelId } : null;
}

export async function GET() {
  const rows = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  let conversationId = body.conversationId ?? null;

  // Auto-create a dedicated conversation when none was chosen, wired to the
  // default model so triggered runs work out of the box.
  if (conversationId === null) {
    const defaultModel = await resolveDefaultModel();
    const conversation = await db
      .insert(conversations)
      .values({
        title: `Webhook: ${body.name}`,
        providerId: defaultModel?.providerId ?? null,
        modelId: defaultModel?.modelId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();
    conversationId = conversation.id;
  }

  const row = await db
    .insert(webhooks)
    .values({
      name: body.name,
      secret: generateWebhookSecret(),
      systemPrompt: body.systemPrompt,
      conditions: body.conditions as WebhookCondition[],
      conversationId,
      respondSync: body.respondSync,
      enabled: body.enabled,
    })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
