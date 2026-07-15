import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { routines } from "@/db/schema";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const routineId = parseInt(id, 10);
  if (isNaN(routineId)) {
    return NextResponse.json({ error: "Invalid routine ID" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(routines)
    .where(eq(routines.id, routineId))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    code?: string;
    enabled?: boolean;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.code !== undefined) updates.code = body.code;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  await db
    .update(routines)
    .set(updates as any)
    .where(eq(routines.id, routineId))
    .run();

  const updated = await db
    .select()
    .from(routines)
    .where(eq(routines.id, routineId))
    .get();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const routineId = parseInt(id, 10);
  if (isNaN(routineId)) {
    return NextResponse.json({ error: "Invalid routine ID" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(routines)
    .where(eq(routines.id, routineId))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  await db
    .delete(routines)
    .where(eq(routines.id, routineId))
    .run();

  return NextResponse.json({ ok: true });
}
