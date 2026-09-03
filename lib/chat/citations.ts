import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Client-side citation helpers.
//
// The server attaches a `sources` array to the output of provenance-tracked
// tools (web_fetch, web_search, … — see lib/research/source-storage.ts).
// These helpers collect those sources per assistant message, number them in
// order of first appearance, and annotate the answer text so inline links to
// retrieved URLs render as numbered chips (Nexus-style).
// ---------------------------------------------------------------------------

export interface CitationRef {
  url: string;
  title: string;
  number: number;
  /** Best-effort publish date (ISO string or a raw relative age like "2 days ago"). */
  publishedAt?: string;
}

export interface MessageSources {
  /** Ordered, deduped sources — the full list shown in the Sources card. */
  list: CitationRef[];
  /** Normalized URL → citation (used to chip inline links). */
  byUrl: Map<string, CitationRef>;
}

/**
 * Normalize a URL for citation matching. The server sanitizes stored source
 * URLs (strips credentials/secret query params, hashes, lowercases the host);
 * this lighter normalizer only strips fragments and trailing slashes so the
 * model's markdown hrefs (`https://x.com/path/` vs `https://x.com/path`)
 * still match the same source.
 */
export function normalizeUrlKey(url: string): string {
  const value = (url ?? "").trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    const base = parsed.toString();
    // Trim the trailing slash on non-root paths (`https://x.com/p/` → `https://x.com/p`).
    return base.length > 0 && base !== parsed.origin && base.endsWith("/")
      ? base.slice(0, -1)
      : base;
  } catch {
    return value.replace(/\/+$/, "").toLowerCase();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Collect every source a message's tool parts actually retrieved, deduped by
 * URL and numbered in order of first appearance. The tool outputs carry the
 * server-persisted provenance (`{ id, url, title, status, … }` arrays).
 */
export function collectMessageSources(parts: UIMessage["parts"]): MessageSources {
  const list: CitationRef[] = [];
  const byUrl = new Map<string, CitationRef>();

  const add = (url: unknown, title: unknown, publishedAt?: unknown) => {
    if (typeof url !== "string" || !url.trim()) return;
    const key = normalizeUrlKey(url);
    if (byUrl.has(key)) return;
    const ref: CitationRef = {
      url,
      title: typeof title === "string" && title.trim() ? title.trim() : url,
      number: list.length + 1,
      publishedAt:
        typeof publishedAt === "string" && publishedAt.trim()
          ? publishedAt
          : undefined,
    };
    byUrl.set(key, ref);
    list.push(ref);
  };

  for (const rawPart of parts ?? []) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, unknown>;
    let output: unknown;

    // AI SDK v7 `tool-*` parts carry `output` directly.
    if (
      typeof part.type === "string" &&
      part.type.startsWith("tool-") &&
      part.type !== "tool-invocation"
    ) {
      output = part.output;
    }
    // Legacy `tool-invocation` parts carry the result in `toolInvocation`.
    else if (part.type === "tool-invocation") {
      const inv = isRecord(part.toolInvocation) ? part.toolInvocation : null;
      output = inv?.output ?? inv?.result;
    } else {
      continue;
    }

    if (!isRecord(output)) continue;
    const sources = output.sources;
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (!isRecord(source)) continue;
      add(source.url, source.title, source.publishedAt);
    }
  }

  return { list, byUrl };
}

/**
 * Remove a trailing "Sources" / "References" / "Links" section from the
 * answer text. The model is prompted to append a markdown-link list of its
 * sources, but the app renders the real (deduped, numbered) list itself —
 * keeping the model's copy would duplicate it.
 *
 * Only strips when the heading is followed by what looks like a source list:
 * every non-empty line either contains a URL (markdown links / bare URLs) or
 * is short trailing prose (e.g. "Hope this helps!"), and at least one URL is
 * present. A "## Sources" heading followed by real prose is never eaten.
 */
export function stripTrailingSourcesSection(text: string): string {
  const heading = /^(?:#{1,3}\s*)?(?:\*\*)?(?:Sources?|References?|Links?)(?:\*\*)?\s*[:：]?$/im;
  const urlRe = /https?:\/\/|\/api\//;
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (!heading.test(lines[i].trim())) continue;
    const rest = lines.slice(i + 1);
    const looksLikeSourceList = rest.every((line) => {
      const t = line.trim();
      if (!t) return true;
      if (urlRe.test(t)) return true; // list items carry a link
      return t.length <= 100 && !/^#{1,3}\s/.test(t); // short trailing prose only
    });
    const hasUrl = rest.some((line) => urlRe.test(line));
    if (looksLikeSourceList && hasUrl) {
      return lines.slice(0, i).join("\n").trimEnd();
    }
  }
  return text;
}

/** Strip trailing sentence punctuation so a bare URL matches its source. */
function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?]+$/, "").replace(/[)\]}>]+$/, "");
}

/**
 * Wrap bare source URLs in markdown link syntax so markdown-to-jsx turns them
 * into `<a>` elements — which the citation-aware renderer then chips. Links
 * already written as `[label](url)` are left alone (the destination is parsed
 * by the renderer directly). Only URLs preceded by whitespace or `>` are
 * wrapped so markdown link destinations (preceded by `(`) are never touched.
 */
export function wrapBareSourceUrls(text: string, byUrl: Map<string, CitationRef>): string {
  if (byUrl.size === 0) return text;
  return text.replace(
    /(^|[\s>])(https?:\/\/[^\s)<>]+)/g,
    (match, pre: string, rawUrl: string) => {
      const url = trimTrailingPunctuation(rawUrl);
      if (!byUrl.has(normalizeUrlKey(url))) return match;
      return `${pre}[${url}](${url})`;
    },
  );
}
