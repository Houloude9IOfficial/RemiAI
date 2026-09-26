import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { deleteProjectFiles } from "@/lib/projects/storage";

const updateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), brief: z.string().max(10000).optional(), instructions: z.string().max(10000).optional(), notes: z.string().max(20000).optional(), pinned: z.boolean().optional(), sortOrder: z.number().int().min(0).optional() }).refine((value) => Object.keys(value).length > 0);
async function idFrom(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idFrom(params);
  if (!id) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const row = await db.select().from(projects).where(eq(projects.id, id)).get();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Project not found" }, { status: 404 });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idFrom(params);
  if (!id) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error);
  const row = await db.update(projects).set({ ...parsed.data, updatedAt: new Date().toISOString() }).where(eq(projects.id, id)).returning().get();
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Project not found" }, { status: 404 });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idFrom(params);
  if (!id) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const row = await db.delete(projects).where(eq(projects.id, id)).returning().get();
  if (!row) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  await deleteProjectFiles(id);
  return NextResponse.json({ ok: true });
}
