import { NextResponse } from "next/server";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { providerCreateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";
import { maskProvider } from "@/lib/providers/mask";
import { discoverModels } from "@/lib/providers/discover";
import { PROVIDER_MODEL_CATALOG } from "@/lib/providers/catalog";

export async function GET() {
  const rows = await db.select().from(providers).orderBy(providers.createdAt);
  return NextResponse.json(rows.map(maskProvider));
}

export async function POST(req: Request) {
  let body: ReturnType<typeof providerCreateSchema.parse>;
  try {
    body = providerCreateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  if ((body.kind === "ollama" || body.kind === "openai-compatible") && !body.baseUrl) {
    return NextResponse.json(
      { error: "A base URL is required for this provider kind" },
      { status: 400 },
    );
  }

  const row = await db
    .insert(providers)
    .values({
      kind: body.kind,
      isPreset: body.isPreset,
      label: body.label,
      baseUrl: body.baseUrl ?? null,
      apiKey: body.apiKey ?? null,
    })
    .returning()
    .get();

  // Try to auto-discover models from the provider's API
  const { models, discovered } = await discoverModels({
    kind: row.kind,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
  });

  // Seed models — discovered ones on success, catalog defaults on failure
  const seedModels = discovered
    ? models
    : (PROVIDER_MODEL_CATALOG[row.kind] ?? []).map((m) => ({
        modelId: m.modelId,
        label: m.label,
        contextWindow: null,
      }));

  for (const model of seedModels) {
    await db
      .insert(providerModels)
      .values({
        providerId: row.id,
        modelId: model.modelId,
        label: model.label,
        contextWindow: model.contextWindow,
      })
      .onConflictDoNothing({ target: [providerModels.providerId, providerModels.modelId] })
      .run();
  }

  return NextResponse.json(
    { ...maskProvider(row), _modelCount: seedModels.length, _discovered: discovered },
    { status: 201 },
  );
}
