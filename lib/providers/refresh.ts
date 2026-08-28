import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { discoverModels } from "./discover";
import { PROVIDER_MODEL_CATALOG } from "./catalog";

/**
 * Shared provider-model refresh logic (used by both the manual
 * `/refresh-models` API route and the background auto-refresh loop).
 *
 * Unlike the old delete-and-reinsert approach (which reset every model to
 * enabled), a refresh here:
 *   - keeps models that were already enabled enabled,
 *   - keeps models that were disabled disabled,
 *   - enables NEW models discovered from the provider,
 *   - removes models the provider no longer offers,
 *   - refreshes labels from discovery.
 */

export type RefreshResult = {
  count: number;
  discovered: boolean;
  added: number;
  removed: number;
  message: string;
};

export type RefreshOptions = {
  /**
   * When auto-discovery fails, fall back to the static catalog instead of
   * leaving the provider's models untouched. Enabled for the manual refresh
   * button (matches the old behavior); disabled for the background loop so
   * models a user deleted are not resurrected every 5 minutes.
   */
  fallbackToCatalog?: boolean;
};

export async function refreshProviderModels(
  providerId: number,
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const provider = await db
    .select()
    .from(providers)
    .where(eq(providers.id, providerId))
    .get();

  if (!provider) {
    throw new Error("Provider not found");
  }

  // Try auto-discovery
  const { models, discovered } = await discoverModels({
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  });

  let seedModels: { modelId: string; label: string | null; contextWindow: number | null }[];
  if (discovered) {
    seedModels = models;
  } else if (options.fallbackToCatalog) {
    seedModels = (PROVIDER_MODEL_CATALOG[provider.kind] ?? []).map((m) => ({
      modelId: m.modelId,
      label: m.label,
      contextWindow: null,
    }));
  } else {
    // Auto-refresh: discovery failed, so there is nothing to sync against —
    // leave the provider's models exactly as the user configured them.
    return {
      count: 0,
      discovered: false,
      added: 0,
      removed: 0,
      message: "Auto-discovery unavailable; models unchanged",
    };
  }

  if (seedModels.length === 0) {
    return {
      count: 0,
      discovered,
      added: 0,
      removed: 0,
      message: discovered
        ? "No models returned by the provider"
        : "Auto-discovery unavailable, and no default models exist",
    };
  }

  const existing = await db
    .select({ modelId: providerModels.modelId, enabled: providerModels.enabled, isDefault: providerModels.isDefault })
    .from(providerModels)
    .where(eq(providerModels.providerId, providerId))
    .all();

  const existingByModelId = new Map(existing.map((m) => [m.modelId, m]));
  const seedIds = new Set(seedModels.map((m) => m.modelId));

  const toRemove = existing
    .filter((m) => !seedIds.has(m.modelId))
    .map((m) => m.modelId);

  let added = 0;

  // Apply the sync in a transaction so a refresh can never leave the
  // provider in a half-migrated state (and concurrent refreshes stay safe).
  db.transaction((tx) => {
    if (toRemove.length > 0) {
      tx.delete(providerModels)
        .where(
          and(
            eq(providerModels.providerId, providerId),
            inArray(providerModels.modelId, toRemove),
          ),
        )
        .run();
    }

    for (const model of seedModels) {
      const prev = existingByModelId.get(model.modelId);
      if (prev) {
        // Keep the user's enabled/isDefault state; refresh label + context
        // window from the provider's latest metadata.
        tx.update(providerModels)
          .set({ label: model.label, contextWindow: model.contextWindow })
          .where(
            and(
              eq(providerModels.providerId, providerId),
              eq(providerModels.modelId, model.modelId),
            ),
          )
          .run();
      } else {
        // New model — enabled by default so it shows up in the picker.
        tx.insert(providerModels)
          .values({
            providerId,
            modelId: model.modelId,
            label: model.label,
            contextWindow: model.contextWindow,
            enabled: true,
          })
          .run();
        added++;
      }
    }
  });

  const detail: string[] = [];
  if (added > 0) detail.push(`${added} new`);
  if (toRemove.length > 0) detail.push(`${toRemove.length} removed`);
  const suffix = detail.length > 0 ? ` (${detail.join(", ")})` : "";
  const plural = seedModels.length === 1 ? "" : "s";

  return {
    count: seedModels.length,
    discovered,
    added,
    removed: toRemove.length,
    message: discovered
      ? `Discovered ${seedModels.length} model${plural}${suffix}`
      : `Added ${seedModels.length} default model${plural} (auto-discovery unavailable)${suffix}`,
  };
}

/**
 * Refresh models for every configured provider. Failures are logged and
 * skipped so one broken provider never blocks the others.
 */
export async function refreshAllProviderModels(
  options: RefreshOptions = {},
): Promise<Array<{ providerId: number; result: RefreshResult }>> {
  const allProviders = await db.select().from(providers).all();
  const results: Array<{ providerId: number; result: RefreshResult }> = [];

  for (const provider of allProviders) {
    try {
      const result = await refreshProviderModels(provider.id, options);
      results.push({ providerId: provider.id, result });
    } catch (err) {
      console.error(
        `[models] Refresh failed for provider #${provider.id} (${provider.label}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return results;
}

// ─── Background auto-refresh ────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background model auto-refresh. Called once at app startup from
 * `initializeApp()` (see `db/index.ts`). Runs an immediate sync at boot and
 * then refreshes all providers' models every 5 minutes so newly released
 * models appear (and removed ones drop out) automatically.
 */
export function startModelAutoRefresh() {
  if (intervalHandle) {
    return; // Already started
  }

  console.log("[models] Starting auto-refresh (every 5 minutes)");

  const run = () =>
    refreshAllProviderModels({ fallbackToCatalog: false }).catch((err) =>
      console.error("[models] Auto-refresh failed:", err),
    );

  intervalHandle = setInterval(run, AUTO_REFRESH_INTERVAL_MS);

  // Also run an immediate sync on startup.
  void run();
}

/** Stop the background auto-refresh. Called on shutdown. */
export function stopModelAutoRefresh() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[models] Auto-refresh stopped");
  }
}