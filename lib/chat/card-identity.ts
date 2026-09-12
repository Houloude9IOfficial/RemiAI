import type { UIMessage } from "ai";

/**
 * Stable identity helpers for inline cards.
 *
 * Keep this deliberately envelope-based: new card tools only need to return
 * `{ type: "remi_card", card, query, ... }` to participate in deduplication
 * and conversation inventory automatically.
 */
function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== null && item !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function isRemiCardOutput(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).type === "remi_card" &&
      typeof (value as Record<string, unknown>).card === "string",
  );
}

/** Identity of a completed card envelope. Display-only fields are ignored. */
export function remiCardOutputIdentity(value: unknown): string | null {
  if (!isRemiCardOutput(value)) return null;
  const record = value as Record<string, unknown>;
  const card = String(record.card).trim().toLowerCase();
  const query = record.query && typeof record.query === "object" ? record.query as Record<string, unknown> : {};
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};

  // Different tools/steps may identify the same resolved target differently
  // (for example weather by browser coordinates in one call and by "Nicosia"
  // in another). Prefer the resolved canonical target when it is available.
  const resolved = (() => {
    if (card === "weather") {
      const latitude = data.latitude ?? query.latitude;
      const longitude = data.longitude ?? query.longitude;
      if (latitude != null && longitude != null) return { latitude, longitude };
      return { location: data.location ?? query.location ?? null };
    }
    if (card === "timezone") return { timezone: data.timezone ?? query.timezone ?? data.location ?? query.location ?? null };
    if (card === "map") {
      const latitude = data.latitude ?? query.latitude;
      const longitude = data.longitude ?? query.longitude;
      if (latitude != null && longitude != null) return { latitude, longitude };
      return { query: data.query ?? query.query ?? data.display_name ?? null };
    }
    if (card === "crypto") return { coin: query.coin ?? data.coin ?? null, vs: query.vs ?? query.vs_currency ?? data.vs_currency ?? null };
    if (card === "currency") return { from: query.from ?? data.from ?? null, to: query.to ?? data.to ?? null, amount: query.amount ?? data.amount ?? null };
    if (card === "stock") return { symbol: query.symbol ?? data.symbol ?? null, range: query.range ?? data.range ?? null };
    if (card === "news") return { query: query.query ?? data.query ?? null, category: query.category ?? data.category ?? null, count: query.count ?? data.count ?? null };
    return query;
  })();
  return `remi:${card}:${stableJson(resolved)}`;
}

/** Identity of a card request, usable before its output is available. */
export function remiCardRequestIdentity(toolName: string, input: unknown): string {
  const cleanName = toolName.toLowerCase().replace(/^.*__/, "");
  const args = input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : input;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    delete (args as Record<string, unknown>).description;
    delete (args as Record<string, unknown>).cardOnly;
  }
  return `request:${cleanName}:${stableJson(args ?? {})}`;
}

function partToolName(part: Record<string, unknown>): string | null {
  if (typeof part.type === "string" && part.type.startsWith("tool-") && part.type !== "tool-invocation") {
    return part.type.slice("tool-".length);
  }
  if (part.type === "tool-invocation") {
    const invocation = part.toolInvocation;
    if (invocation && typeof invocation === "object" && typeof (invocation as Record<string, unknown>).toolName === "string") {
      return (invocation as Record<string, unknown>).toolName as string;
    }
  }
  return null;
}

function partInput(part: Record<string, unknown>): unknown {
  if (part.input !== undefined) return part.input;
  const invocation = part.toolInvocation;
  return invocation && typeof invocation === "object"
    ? (invocation as Record<string, unknown>).args
    : undefined;
}

function partOutput(part: Record<string, unknown>): unknown {
  if (part.output !== undefined) return part.output;
  const invocation = part.toolInvocation;
  return invocation && typeof invocation === "object"
    ? ((invocation as Record<string, unknown>).output ?? (invocation as Record<string, unknown>).result)
    : undefined;
}

export function remiCardPartIdentity(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const record = part as Record<string, unknown>;
  const outputIdentity = remiCardOutputIdentity(partOutput(record));
  if (outputIdentity) return outputIdentity;
  const name = partToolName(record);
  if (!name || !name.toLowerCase().endsWith("_card")) return null;
  return remiCardRequestIdentity(name, partInput(record));
}

export function existingRemiCardInventory(messages: UIMessage[]): string {
  const entries = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const rawPart of message.parts ?? []) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      const output = partOutput(part);
      if (!isRemiCardOutput(output)) continue;
      const identity = remiCardOutputIdentity(output);
      if (!identity) continue;
      const card = String(output.card);
      const query = output.query && typeof output.query === "object" ? stableJson(output.query) : "{}";
      entries.set(identity, `${card} ${query}`);
    }
  }
  return [...entries.values()].slice(-24).join("\n");
}
