import { NextResponse } from "next/server";
import { asc, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";

const createSchema = z.object({ name: z.string().trim().min(1).max(120), brief: z.string().max(10000).optional(), instructions: z.string().max(10000).optional() });

export async function GET() {
  const rows = await db.select().from(projects).orderBy(desc(projects.pinned), asc(projects.sortOrder), asc(projects.id));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error);
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${projects.sortOrder}), -1) + 1` }).from(projects);
  const now = new Date().toISOString();
  const row = await db.insert(projects).values({ ...parsed.data, sortOrder: next, createdAt: now, updatedAt: now }).returning().get();
  return NextResponse.json(row, { status: 201 });
}
