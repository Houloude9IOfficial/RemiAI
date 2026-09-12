import { NextResponse } from "next/server";
import { listAutomationRuns } from "@/lib/runs/automation";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const runs = await listAutomationRuns({ heartbeatId: id, limit: 100 });
  return NextResponse.json({ runs, count: runs.length });
}
