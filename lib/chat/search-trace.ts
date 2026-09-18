import { normalizeUrlKey } from "./citations";

export type SearchTraceAction = "result" | "opened";

export interface SearchTraceEntry {
  /** Stable, normalized URL used to deduplicate entries across tool calls. */
  key: string;
  url: string;
  title: string;
  domain: string;
  action: SearchTraceAction;
  /** Search query that returned this result, when available. */
  query?: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function toolName(part: UnknownRecord): string | null {
  if (typeof part.toolName === "string") return part.toolName;
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  if (part.type === "tool-invocation") {
    const invocation = asRecord(part.toolInvocation);
    return typeof invocation?.toolName === "string" ? invocation.toolName : null;
  }
  return null;
}

function bareToolName(name: string | null): string {
  return (name ?? "").toLowerCase().replace(/^.*__/, "");
}

function toolInput(part: UnknownRecord): UnknownRecord | null {
  if (asRecord(part.input)) return asRecord(part.input);
  const invocation = asRecord(part.toolInvocation);
  return asRecord(invocation?.args) ?? asRecord(invocation?.input);
}

function toolOutput(part: UnknownRecord): UnknownRecord | null {
  const direct = asRecord(part.output);
  if (direct) return asRecord(direct.result) ?? direct;
  const invocation = asRecord(part.toolInvocation);
  const output = asRecord(invocation?.output) ?? asRecord(invocation?.result);
  return output ? asRecord(output.result) ?? output : null;
}

function toolProvenance(part: UnknownRecord): UnknownRecord | null {
  const direct = asRecord(part.output);
  if (direct) return direct;
  const invocation = asRecord(part.toolInvocation);
  return asRecord(invocation?.output) ?? asRecord(invocation?.result);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function stringField(record: UnknownRecord | null, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** True for tools whose URLs belong in the user-facing search-progress trace. */
export function isSearchTraceToolPart(part: unknown): boolean {
  const record = asRecord(part);
  if (!record) return false;
  return ["web_search", "web_fetch", "fc_scrape", "fc_crawl"].includes(
    bareToolName(toolName(record)),
  );
}

/**
 * Read web activity directly from AI SDK UI parts. This deliberately does not
 * use persisted provenance: the trace needs to appear as each tool result is
 * streamed and must preserve call order for its animation.
 */
export function extractSearchTrace(parts: readonly unknown[]): SearchTraceEntry[] {
  const entries: SearchTraceEntry[] = [];
  const seen = new Set<string>();

  const add = (
    url: unknown,
    title: unknown,
    action: SearchTraceAction,
    query?: string,
  ) => {
    if (typeof url !== "string" || !url.trim()) return;
    const key = normalizeUrlKey(url);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({
      key,
      url: url.trim(),
      title: typeof title === "string" && title.trim() ? title.trim() : domainOf(url),
      domain: domainOf(url),
      action,
      query,
    });
  };

  for (const part of parts) {
    const record = asRecord(part);
    if (!record) continue;
    const name = bareToolName(toolName(record));
    if (!isSearchTraceToolPart(record)) continue;
    const input = toolInput(record);
    const output = toolOutput(record);
    const provenance = toolProvenance(record);

    if (name === "web_search") {
      const query = stringField(input, "query") ?? stringField(output, "query");
      const results = output?.results;
      if (!Array.isArray(results)) continue;
      for (const result of results) {
        const item = asRecord(result);
        add(item?.url, item?.title, "result", query);
      }
      continue;
    }

    // The target URL is part of the request; fall back to provenance when a
    // legacy/persisted tool part no longer has its original input.
    const url = stringField(input, "url") ?? stringField(input, "startUrl");
    const source = Array.isArray(provenance?.sources)
      ? asRecord(provenance?.sources[0])
      : null;
    add(url ?? source?.url, stringField(output, "title") ?? source?.title, "opened");
  }

  return entries;
}
