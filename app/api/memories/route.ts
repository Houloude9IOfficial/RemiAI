import { NextRequest, NextResponse } from "next/server";
import { eq, sql, and, desc, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";
import { MEMORY_CATEGORIES, isValidCategory, isValidMemoryDate, type MemoryCategory } from "@/lib/memory-categories";

function ensureMemoryColumns(): void {
  try {
    const { ensureMemoryColumns: heal } = require("@/db") as typeof import("@/db");
    heal();
  } catch {}
}

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

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  const category = req.nextUrl.searchParams.get("category");
  const memoryDate = req.nextUrl.searchParams.get("memoryDate");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const filters: SQL[] = [];
  if (isValidCategory(category)) filters.push(eq(memories.category, category));
  if (isValidMemoryDate(memoryDate)) filters.push(eq(memories.memoryDate, memoryDate as string));
  if (isValidMemoryDate(from)) filters.push(sql`${memories.memoryDate} >= ${from}`);
  if (isValidMemoryDate(to)) filters.push(sql`${memories.memoryDate} <= ${to}`);

  const searchFilter: SQL | undefined = query ? sql`${memories.content} LIKE ${`%${query}%`}` : undefined;
  if (searchFilter) filters.push(searchFilter);

  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...(filters as [SQL, SQL, ...SQL[]]));

  const exec = () =>
    (where
      ? db.select().from(memories).where(where).orderBy(desc(memories.createdAt)).all()
      : db.select().from(memories).orderBy(desc(memories.createdAt)).all());

  try {
    const rows = withMemoryRetry(exec);
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[memories GET] failed", e);
    return NextResponse.json({ error: "Failed to list memories" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    content: string;
    category?: string;
    memoryDate?: string | null;
  };

  if (!body.content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const category: MemoryCategory = isValidCategory(body.category ?? null) ? (body.category as MemoryCategory) : "general";
  let memoryDate: string | null = null;
  if (body.memoryDate != null && String(body.memoryDate).trim() !== "") {
    const raw = String(body.memoryDate).trim();
    if (!isValidMemoryDate(raw)) {
      return NextResponse.json({ error: "memoryDate must be YYYY-MM-DD" }, { status: 400 });
    }
    memoryDate = raw;
  }

  const exec = () =>
    db
      .insert(memories)
      .values({ content: body.content.trim(), category, memoryDate } as any)
      .returning()
      .get();

  try {
    const row = withMemoryRetry(exec);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("[memories POST] failed", e);
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  // Allow PATCH on the collection for bulk? No — use /[id].
  return NextResponse.json({ error: "Use /api/memories/:id" }, { status: 405 });
}
