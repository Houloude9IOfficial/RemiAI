import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureHeartbeatColumns } from "@/db";
import { heartbeats, providerModels, providers } from "@/db/schema";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(10000),
  enabled: z.boolean().optional().default(true),
  scheduleType: z.enum(["interval", "cron"]).default("interval"),
  schedule: z.string().min(1).max(100).default("3600"),
  timezone: z.string().min(1).max(80).default("UTC"),
  providerId: z.coerce.number().int().positive().nullable().optional(),
  modelId: z.string().max(300).nullable().optional(),
  fallbackMode: z.enum(["auto", "fail"]).default("fail"),
  allowedToolNames: z.array(z.string()).default([]),
  allowedToolGroups: z.array(z.string()).default([]),
  deniedToolNames: z.array(z.string()).default([]),
  allowedMcpServerIds: z.array(z.coerce.number().int().positive()).default([]),
  maxSteps: z.coerce.number().int().min(1).max(50).default(20),
  timeoutSeconds: z.coerce.number().int().min(60).max(3600).default(300),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(2),
  retentionDays: z.coerce.number().int().min(1).max(365).default(30),
  notifyOnCompletion: z.boolean().default(false),
});

function nextRun(input: z.infer<typeof schema>) {
  if (input.scheduleType === "cron") return new Date(Date.now() + 60_000).toISOString();
  return new Date(Date.now() + Math.max(60, Number(input.schedule) || 3600) * 1000).toISOString();
}

export async function GET() {
  ensureHeartbeatColumns();
  const rows = await db.select().from(heartbeats).orderBy(desc(heartbeats.updatedAt), desc(heartbeats.id)).all();
  return NextResponse.json({ heartbeats: rows, count: rows.length });
}

export async function POST(req: Request) {
  try {
    ensureHeartbeatColumns();
    const input = schema.parse(await req.json());
    const now = new Date().toISOString();
    const provider = input.providerId ? await db.select().from(providers).where(eq(providers.id, input.providerId)).get() : await db.select().from(providers).where(eq(providers.enabled, true)).get();
    const model = provider ? await db.select().from(providerModels).where(eq(providerModels.providerId, provider.id)).get() : undefined;
    const row = await db.insert(heartbeats).values({ ...input, providerId: provider?.id ?? null, modelId: input.modelId ?? model?.modelId ?? null, nextRunAt: nextRun(input), createdAt: now, updatedAt: now }).returning().get();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Heartbeat" }, { status: 400 });
  }
}
