import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureMemoryColumns } from "@/db";
import { memories, MEMORY_CATEGORIES } from "@/db/schema";
import { isValidCategory, isValidMemoryDate } from "@/lib/memory-categories";

function withMemoryRetry<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
    const missing = msg.includes("no such column") || msg.includes("has no column");
    if (!missing) throw e;
    ensureMemoryColumns();
    return fn();
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(memories).where(eq(memories.id, Number(id)));
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    content?: string;
    category?: string;
    memoryDate?: string | null;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.content !== undefined) {
    const trimmed = String(body.content).trim();
    if (!trimmed) return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
    if (trimmed.length > 500) return NextResponse.json({ error: "Content too long (max 500)" }, { status: 400 });
    updates.content = trimmed;
  }
  if (body.category !== undefined) {
    if (!isValidCategory(body.category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${MEMORY_CATEGORIES.join(", ")}` }, { status: 400 });
    }
    updates.category = body.category;
  }
  if (body.memoryDate !== undefined) {
    if (body.memoryDate === null || body.memoryDate === "") {
      updates.memoryDate = null;
    } else {
      const raw = String(body.memoryDate).trim();
      if (!isValidMemoryDate(raw)) {
        return NextResponse.json({ error: "memoryDate must be YYYY-MM-DD or null" }, { status: 400 });
      }
      updates.memoryDate = raw;
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const exec = () =>
    db.update(memories).set(updates as any).where(eq(memories.id, numericId)).returning().get();

  try {
    const row = withMemoryRetry(exec) as any;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[memories PATCH] failed", e);
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);
  const row = db.select().from(memories).where(eq(memories.id, numericId)).get();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
