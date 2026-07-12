import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { discoverModels } from "@/lib/providers/discover";
import { PROVIDER_MODEL_CATALOG } from "@/lib/providers/catalog";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const providerId = Number(id);

  const provider = await db
    .select()
    .from(providers)
    .where(eq(providers.id, providerId))
    .get();

  if (!provider) {
    return NextResponse.json(
      { error: "Provider not found" },
      { status: 404 },
    );
  }

  // Try auto-discovery
  const { models, discovered } = await discoverModels({
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  });

  const seedModels = discovered
    ? models
    : (PROVIDER_MODEL_CATALOG[provider.kind] ?? []).map((m) => ({
        modelId: m.modelId,
        label: m.label,
      }));

  if (seedModels.length === 0) {
    return NextResponse.json({
      count: 0,
      discovered,
      message: discovered
        ? "No models returned by the provider"
        : "Auto-discovery unavailable, and no default models exist",
    });
  }

  // Delete existing models and insert fresh ones
  await db.delete(providerModels).where(eq(providerModels.providerId, providerId));

  for (const model of seedModels) {
    await db
      .insert(providerModels)
      .values({
        providerId,
        modelId: model.modelId,
        label: model.label,
      })
      .run();
  }

  return NextResponse.json({
    count: seedModels.length,
    discovered,
    message: discovered
      ? `Discovered ${seedModels.length} model${seedModels.length === 1 ? "" : "s"}`
      : `Added ${seedModels.length} default model${seedModels.length === 1 ? "" : "s"} (auto-discovery unavailable)`,
  });
}
