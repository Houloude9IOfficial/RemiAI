import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providerModels } from "@/db/schema";
import { providerModelCreateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(providerModels)
    .where(eq(providerModels.providerId, Number(id)));
  return NextResponse.json(rows);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: ReturnType<typeof providerModelCreateSchema.parse>;
  try {
    body = providerModelCreateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  try {
    const row = await db
      .insert(providerModels)
      .values({
        providerId: Number(id),
        modelId: body.modelId,
        label: body.label ?? null,
      })
      .returning()
      .get();
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "This model is already added for this provider" },
      { status: 409 },
    );
  }
}
