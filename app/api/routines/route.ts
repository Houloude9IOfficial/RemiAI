import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { routines, routineLogs } from "@/db/schema";

export async function GET() {
  const allRoutines = await db
    .select()
    .from(routines)
    .orderBy(routines.name)
    .all();

  // Enrich with last run info
  const enriched = await Promise.all(
    allRoutines.map(async (r) => {
      const lastLog = await db
        .select()
        .from(routineLogs)
        .where(eq(routineLogs.routineId, r.id))
        .orderBy(desc(routineLogs.startedAt))
        .limit(1)
        .get();
      return {
        ...r,
        lastRun: lastLog?.completedAt ?? null,
        lastStatus: lastLog?.status ?? null,
      };
    }),
  );

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name: string;
    description?: string;
    code: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  // Check for duplicate name
  const existing = await db
    .select()
    .from(routines)
    .where(eq(routines.name, body.name.trim()))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: `A routine named "${body.name}" already exists.` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const routine = await db
    .insert(routines)
    .values({
      name: body.name.trim(),
      description: body.description?.trim() ?? "",
      code: body.code,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return NextResponse.json(routine, { status: 201 });
}
