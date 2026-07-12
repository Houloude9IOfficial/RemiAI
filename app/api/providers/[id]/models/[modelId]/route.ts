import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerModels } from "@/db/schema";
import { providerModelUpdateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const { id, modelId } = await params;
  let body: ReturnType<typeof providerModelUpdateSchema.parse>;
  try {
    body = providerModelUpdateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const row = await db
    .update(providerModels)
    .set(body)
    .where(
      and(
        eq(providerModels.providerId, Number(id)),
        eq(providerModels.modelId, modelId),
      ),
    )
    .returning()
    .get();

  if (!row) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> },
) {
  const { id, modelId } = await params;
  await db
    .delete(providerModels)
    .where(
      and(
        eq(providerModels.providerId, Number(id)),
        eq(providerModels.modelId, modelId),
      ),
    );
  return NextResponse.json({ ok: true });
}
