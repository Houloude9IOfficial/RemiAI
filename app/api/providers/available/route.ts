import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { contextWindowFor } from "@/lib/providers/catalog";

export async function GET() {
  const rows = await db
    .select({
      providerId: providers.id,
      providerLabel: providers.label,
      providerKind: providers.kind,
      modelId: providerModels.modelId,
      modelLabel: providerModels.label,
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
      // Approximate context-window size for the header usage meter.
      contextWindow: contextWindowFor(row.modelId),
    });
  }

  return NextResponse.json(Array.from(grouped.values()));
}
