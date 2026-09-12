import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, ensureHeartbeatColumns } from "@/db";
import { heartbeats } from "@/db/schema";
import { executeHeartbeat } from "@/lib/heartbeats/runner";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(), prompt: z.string().trim().min(1).max(10000).optional(),
  enabled: z.boolean().optional(), scheduleType: z.enum(["interval", "cron"]).optional(), schedule: z.string().min(1).max(100).optional(), timezone: z.string().min(1).max(80).optional(),
  providerId: z.coerce.number().int().positive().nullable().optional(), modelId: z.string().max(300).nullable().optional(), fallbackMode: z.enum(["auto", "fail"]).optional(),
  allowedToolNames: z.array(z.string()).optional(), allowedToolGroups: z.array(z.string()).optional(), deniedToolNames: z.array(z.string()).optional(), allowedMcpServerIds: z.array(z.coerce.number().int().positive()).optional(),
  maxSteps: z.coerce.number().int().min(1).max(50).optional(), timeoutSeconds: z.coerce.number().int().min(60).max(3600).optional(), maxAttempts: z.coerce.number().int().min(1).max(5).optional(), retentionDays: z.coerce.number().int().min(1).max(365).optional(), notifyOnCompletion: z.boolean().optional(),
});

async function get(id: number) { return db.select().from(heartbeats).where(eq(heartbeats.id, id)).get(); }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureHeartbeatColumns();
  const id = Number((await params).id); const row = await get(id);
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Heartbeat not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  try {
    ensureHeartbeatColumns();
    const input = patchSchema.parse(await req.json());
    const row = await db.update(heartbeats).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(heartbeats.id, id)).returning().get();
    return row ? NextResponse.json(row) : NextResponse.json({ error: "Heartbeat not found" }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Heartbeat" }, { status: 400 }); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id); const row = await db.delete(heartbeats).where(eq(heartbeats.id, id)).returning().get();
  return row ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Heartbeat not found" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  ensureHeartbeatColumns();
  const id = Number((await params).id); const action = new URL(req.url).searchParams.get("action") ?? "run"; const heartbeat = await get(id);
  if (!heartbeat) return NextResponse.json({ error: "Heartbeat not found" }, { status: 404 });
  if (action === "pause" || action === "resume") {
    const row = await db.update(heartbeats).set({ enabled: action === "resume", updatedAt: new Date().toISOString() }).where(eq(heartbeats.id, id)).returning().get();
    return NextResponse.json(row);
  }
  executeHeartbeat(heartbeat).catch((error) => console.error(`[api] Heartbeat #${id} failed:`, error));
  return NextResponse.json({ ok: true, message: "Heartbeat execution started" }, { status: 202 });
}
