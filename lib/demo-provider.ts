import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";

export const DEMO_PROVIDER_KIND = process.env.DEMO_PROVIDER_KIND?.trim().toLowerCase();
export const DEMO_PROVIDER_MODEL = process.env.DEMO_PROVIDER_MODEL?.trim();
export const DEMO_PROVIDER_API_KEY = process.env.DEMO_PROVIDER_API_KEY;
export const DEMO_PROVIDER_BASE_URL = process.env.DEMO_PROVIDER_BASE_URL?.trim() || null;

export function ensureDemoProvider() {
  if (process.env.DEMO?.trim().toLowerCase() !== "true") return null;
  if (!DEMO_PROVIDER_KIND || !DEMO_PROVIDER_MODEL || !DEMO_PROVIDER_API_KEY) return null;

  let provider = db.select().from(providers).where(eq(providers.label, "Public Demo Provider")).get();
  if (!provider) {
    provider = db.insert(providers).values({
      kind: DEMO_PROVIDER_KIND as typeof providers.$inferInsert.kind,
      isPreset: true,
      label: "Public Demo Provider",
      baseUrl: DEMO_PROVIDER_BASE_URL,
      apiKey: DEMO_PROVIDER_API_KEY,
      enabled: true,
    }).returning().get();
  } else if (!provider.enabled || provider.apiKey !== DEMO_PROVIDER_API_KEY || provider.kind !== DEMO_PROVIDER_KIND) {
    provider = db.update(providers).set({
      kind: DEMO_PROVIDER_KIND as typeof providers.$inferInsert.kind,
      baseUrl: DEMO_PROVIDER_BASE_URL,
      apiKey: DEMO_PROVIDER_API_KEY,
      enabled: true,
    }).where(eq(providers.id, provider.id)).returning().get()!;
  }

  const existingModel = db.select().from(providerModels).where(and(
    eq(providerModels.providerId, provider.id),
    eq(providerModels.modelId, DEMO_PROVIDER_MODEL),
  )).get();
  if (!existingModel) {
    db.insert(providerModels).values({
      providerId: provider.id,
      modelId: DEMO_PROVIDER_MODEL,
      label: DEMO_PROVIDER_MODEL,
      enabled: true,
      isDefault: true,
    }).run();
  } else if (!existingModel.enabled || !existingModel.isDefault) {
    db.update(providerModels).set({ enabled: true, isDefault: true })
      .where(eq(providerModels.id, existingModel.id)).run();
  }

  return provider;
}
