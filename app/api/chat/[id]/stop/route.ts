import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, initializeApp } from "@/db";
import { questionSubmissions } from "@/db/schema";
import { getCurrentAccount } from "@/lib/auth/service";
import { questionRuns } from "@/lib/chat/question-delivery";
import { streamRegistry } from "@/lib/chat/stream-registry";
import { activeDurableRun, finishDurableGeneration } from "@/lib/chat/generation-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Explicit user Stop. Disconnecting a browser never calls this endpoint. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getCurrentAccount()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initializeApp();
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  questionRuns.get(conversationId)?.controller.abort("Stopped by user");
  streamRegistry.remove(conversationId, "Stopped by user");
  db.update(questionSubmissions).set({ autoContinue: false }).where(and(
    eq(questionSubmissions.conversationId, conversationId),
    eq(questionSubmissions.delivered, false),
  )).run();
  const durableRun = await activeDurableRun(conversationId);
  if (durableRun) {
    await finishDurableGeneration({
      id: durableRun.id,
      status: "stopped",
      error: "Stopped by user",
    });
  }
  return NextResponse.json({ ok: true });
}
