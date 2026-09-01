import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providerModels } from "@/db/schema";
import { providerModelCreateSchema, providerModelsBatchUpdateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";
import { demoBlockedResponse, isDemoMode } from "@/lib/demo-policy";

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
  const { id } = await params;
  let body: ReturnType<typeof providerModelsBatchUpdateSchema.parse>;
  try {
    body = providerModelsBatchUpdateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const providerId = Number(id);

  // Apply each update in a transaction
  const results = db.transaction((tx) => {
    const rows: typeof providerModels.$inferSelect[] = [];
    for (const u of body.updates) {
      const { modelId, ...set } = u;
      const row = tx
        .update(providerModels)
        .set(set)
        .where(
          and(
            eq(providerModels.providerId, providerId),
            eq(providerModels.modelId, modelId),
          ),
        )
        .returning()
        .get();
      if (row) rows.push(row);
    }
    return rows;
  });

  return NextResponse.json(results);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
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
