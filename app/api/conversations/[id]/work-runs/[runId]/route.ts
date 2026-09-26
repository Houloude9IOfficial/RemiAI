import { NextResponse } from "next/server";
import { z } from "zod";
import { initializeApp } from "@/db";
import { getWorkRun, setWorkPhase, submitWorkPlan } from "@/lib/work/runs";
import { stopWorkServer } from "@/lib/work/execution";
import { closeWorkBrowser } from "@/lib/work/browser";
import { jsonError } from "@/lib/validation/api";
const bodySchema = z.object({ action: z.enum(["approve", "continue", "revise", "cancel", "complete", "needs_attention"]), markdown: z.string().max(100_000).optional(), overview: z.string().max(10_000).optional() });
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) { await initializeApp(); const { id, runId } = await params; const run = await getWorkRun(Number(id), Number(runId)); return run ? NextResponse.json({ run }) : NextResponse.json({ error: "Work run not found" }, { status: 404 }); }
export async function POST(req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  await initializeApp(); const { id, runId } = await params;
  try { const body = bodySchema.parse(await req.json()); const conversationId = Number(id); const workRunId = Number(runId);
    if (body.action === "approve" || body.action === "continue") return NextResponse.json({ run: await setWorkPhase(conversationId, workRunId, "building") });
    if (body.action === "revise") return NextResponse.json({ run: await setWorkPhase(conversationId, workRunId, "planning") });
    if (body.action === "cancel") { stopWorkServer(workRunId); await closeWorkBrowser(workRunId); return NextResponse.json({ run: await setWorkPhase(conversationId, workRunId, "cancelled") }); }
    if (body.action === "complete") return NextResponse.json({ run: await setWorkPhase(conversationId, workRunId, "completed", body.overview) });
    return NextResponse.json({ run: await setWorkPhase(conversationId, workRunId, "needs_attention", body.overview) });
  } catch (error) { return jsonError(error); }
}
