import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { contextWindowFor } from "@/lib/providers/catalog";
import { isDemoMode } from "@/lib/demo-policy";
import { DEMO_PROVIDER_MODEL, ensureDemoProvider } from "@/lib/demo-provider";

export async function GET() {
  if (isDemoMode()) {
    const demoProvider = ensureDemoProvider();
    if (!demoProvider) return NextResponse.json([]);
    return NextResponse.json([{
      providerId: demoProvider.id,
      label: demoProvider.label,
      kind: demoProvider.kind,
      models: [{
        providerId: demoProvider.id,
        providerLabel: demoProvider.label,
        providerKind: demoProvider.kind,
        modelId: DEMO_PROVIDER_MODEL!,
        modelLabel: DEMO_PROVIDER_MODEL!,
        contextWindow: contextWindowFor(DEMO_PROVIDER_MODEL!),
        isDefault: true,
      }],
    }]);
  }
  const rows = await db
    .select({
      providerId: providers.id,
      providerLabel: providers.label,
      providerKind: providers.kind,
      modelId: providerModels.modelId,
      modelLabel: providerModels.label,
      // Provider-reported context window — the real value when the provider
      // publishes it, null otherwise.
      contextWindow: providerModels.contextWindow,
      isDefault: providerModels.isDefault,
    })
    .from(providers)
    .innerJoin(
      providerModels,
      and(eq(providerModels.providerId, providers.id), eq(providerModels.enabled, true)),
    )
    .where(eq(providers.enabled, true));

  type AvailableModelRow = (typeof rows)[number] & { contextWindow: number };
  const grouped = new Map<
    number,
    { providerId: number; label: string; kind: string; models: AvailableModelRow[] }
  >();
  for (const row of rows) {
    if (!grouped.has(row.providerId)) {
      grouped.set(row.providerId, {
        providerId: row.providerId,
        label: row.providerLabel,
        kind: row.providerKind,
        models: [],
      });
    }
    grouped.get(row.providerId)!.models.push({
      ...row,
      // Exact provider-reported context window when available; otherwise the
      // approximate heuristic from the static catalog (e.g. OpenAI/Ollama,
      // whose models APIs don't publish context sizes).
      contextWindow: row.contextWindow ?? contextWindowFor(row.modelId),
    });
  }

  return NextResponse.json(Array.from(grouped.values()));
}
