import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { providerUpdateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";
import { maskProvider } from "@/lib/providers/mask";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: ReturnType<typeof providerUpdateSchema.parse>;
  try {
    body = providerUpdateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const row = await db
    .update(providers)
    .set(body)
    .where(eq(providers.id, Number(id)))
    .returning()
    .get();

  if (!row) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
  return NextResponse.json(maskProvider(row));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(providers).where(eq(providers.id, Number(id)));
  return NextResponse.json({ ok: true });
}
