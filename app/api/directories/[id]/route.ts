import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { directories } from "@/db/schema";
import { directoryUpdateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: ReturnType<typeof directoryUpdateSchema.parse>;
  try {
    body = directoryUpdateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const row = await db
    .update(directories)
    .set(body)
    .where(eq(directories.id, Number(id)))
    .returning()
    .get();

  if (!row) {
    return NextResponse.json({ error: "Directory not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(directories).where(eq(directories.id, Number(id)));
  return NextResponse.json({ ok: true });
}
