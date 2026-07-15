import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { routines } from "@/db/schema";
import { executeRoutine } from "@/lib/routines/runner";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const routineId = parseInt(id, 10);
  if (isNaN(routineId)) {
    return NextResponse.json({ error: "Invalid routine ID" }, { status: 400 });
  }

  const routine = await db
    .select()
    .from(routines)
    .where(eq(routines.id, routineId))
    .get();

  if (!routine) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  try {
    const { logId, result } = await executeRoutine(routineId);
    return NextResponse.json({
      logId,
      routineName: routine.name,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution failed" },
      { status: 500 },
    );
  }
}
