import { NextResponse } from "next/server";
import { z } from "zod";
import { stopAllAutomationRuns } from "@/lib/runs/automation";

const schema = z.object({
  action: z.literal("stop_all"),
  conversationId: z.coerce.number().int().positive().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Expected { action: 'stop_all' }" }, { status: 400 });
  }
  const stopped = await stopAllAutomationRuns(body.conversationId);
  return NextResponse.json({ ok: true, stopped });
}
