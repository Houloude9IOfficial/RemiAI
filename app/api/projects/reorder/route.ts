import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError } from "@/lib/validation/api";

export async function POST(req: Request) {
  const parsed = z.object({ ids: z.array(z.number().int().positive()) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error);
  const ids = parsed.data.ids;
  const rows = await db.select({ id: projects.id }).from(projects);
  if (ids.length !== rows.length || new Set(ids).size !== ids.length || rows.some((row) => !ids.includes(row.id))) return NextResponse.json({ error: "Provide every project exactly once" }, { status: 400 });
  db.transaction((tx) => ids.forEach((id, index) => { tx.update(projects).set({ sortOrder: index }).where(eq(projects.id, id)).run(); }));
  return NextResponse.json({ ok: true });
}
