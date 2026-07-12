import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(memories).where(eq(memories.id, Number(id)));
  return NextResponse.json({ ok: true });
}
