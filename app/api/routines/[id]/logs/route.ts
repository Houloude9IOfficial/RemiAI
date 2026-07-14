import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { routineLogs } from "@/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const routineId = parseInt(id, 10);
  if (isNaN(routineId)) {
    return NextResponse.json({ error: "Invalid routine ID" }, { status: 400 });
  }

  const limitStr = _req.url ? new URL(_req.url).searchParams.get("limit") : null;
  const limit = Math.min(Math.max(parseInt(limitStr ?? "25", 10) || 25, 1), 100);

  const logs = await db
    .select()
    .from(routineLogs)
    .where(eq(routineLogs.routineId, routineId))
    .orderBy(desc(routineLogs.startedAt))
    .limit(limit)
    .all();

  return NextResponse.json(logs);
}
