import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, conversations } from "@/db/schema";
import { providerUpdateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";
import { maskProvider } from "@/lib/providers/mask";
import { demoBlockedResponse, isDemoMode } from "@/lib/demo-policy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode()) return demoBlockedResponse();
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
  if (isDemoMode()) return demoBlockedResponse();
  if (isDemoMode()) return demoBlockedResponse();
  const { id } = await params;
  const providerId = Number(id);

  // Detach any conversations referencing this provider before deleting
  await db
    .update(conversations)
    .set({ providerId: null, modelId: null })
    .where(eq(conversations.providerId, providerId));

  await db.delete(providers).where(eq(providers.id, providerId));
  return NextResponse.json({ ok: true });
}
