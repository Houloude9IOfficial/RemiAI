import type { providers } from "@/db/schema";

type ProviderRow = typeof providers.$inferSelect;

export function maskApiKey(key: string | null): string | null {
  if (!key) return key;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

export function maskProvider(row: ProviderRow) {
  return { ...row, apiKey: maskApiKey(row.apiKey), hasApiKey: !!row.apiKey };
}
