import { NextResponse } from "next/server";
import { getAutomationRun, getAutomationRunEvents } from "@/lib/runs/automation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  }
  const run = await getAutomationRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const events = await getAutomationRunEvents(runId);
  return NextResponse.json({ run, events });
}
