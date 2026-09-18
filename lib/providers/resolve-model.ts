import { asc, eq } from "drizzle-orm";
import type { LanguageModel } from "ai";
import { db } from "@/db";
import { providerModels, providers } from "@/db/schema";
import { isAutoModel } from "@/lib/chat/auto-model";
import type { QualityPolicy } from "@/lib/chat/quality-policy";
import { getAutoLanguageModel, getLanguageModel } from "./factory";

type ProviderRow = typeof providers.$inferSelect;

export type ModelCandidate = { provider: ProviderRow; modelId: string };

/**
 * Every enabled provider/model pair — the set Remi's virtual Auto model fails
 * over across. Ordered exactly like the chat route builds its Auto route:
 * providers by id, then models by id.
 */
export async function loadAutoModelCandidates(): Promise<ModelCandidate[]> {
  const enabledProviders = await db
    .select()
    .from(providers)
    .where(eq(providers.enabled, true))
    .orderBy(asc(providers.id))
    .all();
  if (enabledProviders.length === 0) return [];

  const byId = new Map(enabledProviders.map((provider) => [provider.id, provider]));
  const enabledModels = await db
    .select()
    .from(providerModels)
    .where(eq(providerModels.enabled, true))
    .orderBy(asc(providerModels.id))
    .all();

  return enabledModels
    .filter((model) => byId.has(model.providerId))
    .map((model) => ({ provider: byId.get(model.providerId)!, modelId: model.modelId }));
}

/**
 * Keep the caller's provider first so Auto honours the provider the
 * conversation was actually started on, then fail over across the rest.
 * Pure so the ordering is unit-testable without a database.
 */
export function preferProviderCandidates(
  candidates: ModelCandidate[],
  providerId: number | undefined,
): ModelCandidate[] {
  if (providerId === undefined) return candidates;
  const preferred = candidates.filter((candidate) => candidate.provider.id === providerId);
  if (preferred.length === 0) return candidates;
  return [...preferred, ...candidates.filter((candidate) => candidate.provider.id !== providerId)];
}

/**
 * Auto-aware counterpart of `getLanguageModel`.
 *
 * Every server-side path that builds a model from a stored conversation,
 * heartbeat, scheduled task, sub-agent, or client-supplied model id must go
 * through this instead of `getLanguageModel`: conversations can be pinned to
 * Remi's virtual Auto model (`__remi_auto__`), which is NOT a provider model
 * id — passing it straight to a provider produces
 * `Model '__remi_auto__' is not in the catalog`.
 */
export async function resolveLanguageModel(
  provider: ProviderRow,
  modelId: string,
  effort: QualityPolicy = "medium",
): Promise<LanguageModel> {
  if (!isAutoModel(modelId)) return getLanguageModel(provider, modelId, effort);

  const candidates = preferProviderCandidates(
    await loadAutoModelCandidates(),
    provider.id,
  );
  if (candidates.length === 0) {
    throw new Error(
      "Auto model is selected but no models are enabled. Enable at least one model in Settings → Models & Providers.",
    );
  }
  return getAutoLanguageModel(candidates, effort);
}
