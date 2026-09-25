import { NextResponse } from "next/server";
import { z } from "zod";
import { initializeApp } from "@/db";
import { createWorkRun, getActiveWorkRun } from "@/lib/work/runs";
import { jsonError } from "@/lib/validation/api";

const bodySchema = z.object({
  goal: z.string().trim().min(1).max(4000), successCriteria: z.string().max(4000).optional(),
  technicalBrief: z.record(z.string(), z.string()).optional(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("canvas"), canvasName: z.string().trim().min(1).max(120) }),
    z.object({ type: z.literal("directory"), directoryId: z.number().int().positive(), relativePath: z.string().max(1000).optional() }),
  ]),
});
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await initializeApp(); const { id } = await params;
  return NextResponse.json({ run: await getActiveWorkRun(Number(id)) });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await initializeApp(); const { id } = await params;
  try { return NextResponse.json({ run: await createWorkRun({ conversationId: Number(id), ...bodySchema.parse(await req.json()) }) }, { status: 201 }); }
  catch (error) { return jsonError(error); }
}
