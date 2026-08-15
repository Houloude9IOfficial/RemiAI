import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";

/**
 * GET /api/webhooks/:id/events — most recent deliveries for a webhook,
 * newest first (used by the Settings → Webhooks delivery log).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.webhookId, Number(id)))
    .orderBy(desc(webhookEvents.id))
    .limit(50)
    .all();
  return NextResponse.json(rows);
}
