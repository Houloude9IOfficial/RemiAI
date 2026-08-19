import { NextResponse } from "next/server";
import { listAutomationRuns } from "@/lib/runs/automation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationIdValue = url.searchParams.get("conversationId");
  const conversationId = conversationIdValue ? Number(conversationIdValue) : undefined;
  if (conversationIdValue && (!Number.isInteger(conversationId) || conversationId! <= 0)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const runs = await listAutomationRuns({
    conversationId,
    limit: Number(url.searchParams.get("limit") ?? 50),
  });
  return NextResponse.json({ runs, count: runs.length });
}
