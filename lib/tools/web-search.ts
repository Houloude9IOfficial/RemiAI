import { z } from "zod";
import { Firecrawl } from "firecrawl";
import { truncateToolResult } from "@/lib/utils";
import type { UserContext } from "@/lib/geo";

const SEARXNG_TIMEOUT_MS = 4_000;
const BRAVE_TIMEOUT_MS = 8_000;
const FIRECRAWL_TIMEOUT_MS = 15_000;
const DEFAULT_SEARXNG_URL = "http://127.0.0.1:3105";

type SearchCategory = "general" | "news" | "images";
type SearchOptions = {
  query: string;
  count?: number;
  category?: SearchCategory;
  language?: string;
  page?: number;
  timeRange?: "day" | "month" | "year";
  safeSearch?: 0 | 1 | 2;
};

type NormalizedResult = {
  title: string;
  url: string;
  description: string;
  age?: string | null;
  thumbnail?: { src: string; logo?: boolean } | null;
  thumbnailUrl?: string;
  imageUrl?: string;
  pageUrl?: string;
  source?: string;
};

type ProviderResult = {
  results: NormalizedResult[];
  provider: "searxng" | "brave" | "firecrawl";
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isSearxngEnabled(): boolean {
  const value = process.env.SEARXNG?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

function searxngUrl(): string {
  return (
    process.env.SEARXNG_URL?.trim().replace(/\/+$/, "") || DEFAULT_SEARXNG_URL
  );
}

function searxngParams(options: SearchOptions): URLSearchParams {
  const params = new URLSearchParams({
    q: options.query,
    format: "json",
    pageno: String(options.page ?? 1),
    safesearch: String(options.safeSearch ?? 1),
  });
  if (options.category && options.category !== "general") {
    params.set("categories", options.category);
  }
  if (options.language) params.set("language", options.language);
  if (options.timeRange) params.set("time_range", options.timeRange);
  return params;
}

function normalizeSearxng(body: unknown, options: SearchOptions): NormalizedResult[] {
  if (!body || typeof body !== "object") return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  return results.slice(0, options.count ?? 10).flatMap<NormalizedResult>((raw): NormalizedResult[] => {
    if (!raw || typeof raw !== "object") return [];
    const result = raw as Record<string, unknown>;
    const url = typeof result.url === "string" ? result.url : "";
    const title = typeof result.title === "string" ? result.title : "";
    const description =
      typeof result.content === "string"
        ? result.content
        : typeof result.description === "string"
          ? result.description
          : "";
    const thumbnail =
      typeof result.thumbnail === "string"
        ? result.thumbnail
        : typeof result.img_src === "string"
          ? result.img_src
          : "";
    const imageResult = options.category === "images";
    if (imageResult) {
      const pageUrl = url;
      return [
        {
          title,
          url: pageUrl || thumbnail,
          pageUrl,
          description,
          thumbnailUrl: thumbnail,
          imageUrl: thumbnail || pageUrl,
          source: typeof result.source === "string" ? result.source : "",
        },
      ];
    }

    if (!url && !title && !description) return [];
    return [
      {
        title,
        url,
        description,
        age:
          typeof result.publishedDate === "string"
            ? result.publishedDate
            : null,
        thumbnail: thumbnail ? { src: thumbnail } : null,
        source: typeof result.engine === "string" ? result.engine : "",
      },
    ];
  });
}

async function searchSearxng(options: SearchOptions): Promise<ProviderResult> {
  const url = `${searxngUrl()}/search?${searxngParams(options).toString()}`;
  const body = await fetchJson(url, SEARXNG_TIMEOUT_MS);
  const results = normalizeSearxng(body, options);
  if (results.length === 0) throw new Error("SearXNG returned no usable results");
  return { provider: "searxng", results };
}

function braveParams(
  options: SearchOptions,
  userContext?: UserContext,
): Record<string, string> {
  const params: Record<string, string> = {
    q: options.query,
    count: String(options.count ?? 10),
  };
  if (userContext?.country) params.country = userContext.country;
  const language = options.language ?? userContext?.language;
  if (language) params.search_lang = language;
  params.safesearch = options.safeSearch === 0
    ? "off"
    : options.safeSearch === 2
      ? "strict"
      : "moderate";
  if (options.timeRange) {
    params.freshness = options.timeRange === "day"
      ? "pd"
      : options.timeRange === "month"
        ? "pm"
        : "py";
  }
  if ((options.page ?? 1) > 1) {
    params.offset = String(((options.page ?? 1) - 1) * (options.count ?? 10));
  }
  return params;
}

function normalizeBrave(body: unknown, options: SearchOptions): NormalizedResult[] {
  if (!body || typeof body !== "object") return [];
  const rawResults = options.category === "images"
    ? (body as { results?: unknown }).results
    : options.category === "news"
      ? (body as { results?: unknown }).results
      : (body as { web?: { results?: unknown } }).web?.results;
  if (!Array.isArray(rawResults)) return [];

  return rawResults.slice(0, options.count ?? 10).flatMap<NormalizedResult>((raw): NormalizedResult[] => {
    if (!raw || typeof raw !== "object") return [];
    const result = raw as Record<string, unknown>;
    const title = typeof result.title === "string" ? result.title : "";
    const description = typeof result.description === "string" ? result.description : "";

    if (options.category === "images") {
      const thumbnail = result.thumbnail && typeof result.thumbnail === "object"
        ? result.thumbnail as Record<string, unknown>
        : {};
      const properties = result.properties && typeof result.properties === "object"
        ? result.properties as Record<string, unknown>
        : {};
      const thumbnailUrl = typeof thumbnail.src === "string" ? thumbnail.src : "";
      const imageUrl = typeof properties.url === "string"
        ? properties.url
        : typeof result.url === "string"
          ? result.url
          : thumbnailUrl;
      const pageUrl = typeof result.page_url === "string" ? result.page_url : "";
      if (!title && !imageUrl && !pageUrl) return [];
      return [{
        title,
        url: pageUrl || imageUrl,
        pageUrl,
        description,
        thumbnailUrl,
        imageUrl,
        source: typeof result.source === "string" ? result.source : "",
      }];
    }

    const url = typeof result.url === "string" ? result.url : "";
    if (!title && !url && !description) return [];
    const thumbnail = result.thumbnail && typeof result.thumbnail === "object"
      ? result.thumbnail as Record<string, unknown>
      : {};
    return [{
      title,
      url,
      description,
      age: typeof result.page_age === "string" ? result.page_age : null,
      thumbnail: typeof thumbnail.src === "string"
        ? { src: thumbnail.src, logo: thumbnail.logo === true }
        : null,
    }];
  });
}

async function searchBrave(
  apiKey: string,
  options: SearchOptions,
  userContext?: UserContext,
): Promise<ProviderResult> {
  const endpoint = options.category === "images"
    ? "/images/search"
    : options.category === "news"
      ? "/news/search"
      : "/web/search";
  const url = new URL(`https://api.search.brave.com/res/v1${endpoint}`);
  for (const [key, value] of Object.entries(braveParams(options, userContext))) {
    url.searchParams.set(key, value);
  }
  const body = await fetchJson(url.toString(), BRAVE_TIMEOUT_MS, {
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": apiKey,
  });
  const results = normalizeBrave(body, options);
  if (results.length === 0) throw new Error("Brave returned no usable results");
  return { provider: "brave", results };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectFirecrawlRecords(
  value: unknown,
  output: Record<string, unknown>[] = [],
  depth = 0,
): Record<string, unknown>[] {
  if (depth > 6 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectFirecrawlRecords(item, output, depth + 1);
    return output;
  }
  if (!isRecord(value)) return output;
  if (typeof value.url === "string" || typeof value.link === "string") {
    output.push(value);
  }
  for (const child of Object.values(value)) {
    collectFirecrawlRecords(child, output, depth + 1);
  }
  return output;
}

function normalizeFirecrawl(body: unknown, options: SearchOptions): NormalizedResult[] {
  const seen = new Set<string>();
  const records = collectFirecrawlRecords(body);
  return records.flatMap<NormalizedResult>((result): NormalizedResult[] => {
    const url = typeof result.url === "string"
      ? result.url
      : typeof result.link === "string"
        ? result.link
        : "";
    const metadata = isRecord(result.metadata) ? result.metadata : {};
    const title = typeof result.title === "string"
      ? result.title
      : typeof metadata.title === "string"
        ? metadata.title
        : "";
    const description = typeof result.description === "string"
      ? result.description
      : typeof result.content === "string"
        ? result.content.slice(0, 500)
        : "";
    const key = url || `${title}:${description}`;
    if (seen.has(key)) return [];
    seen.add(key);

    if (options.category === "images") {
      const thumbnailUrl = typeof result.thumbnailUrl === "string"
        ? result.thumbnailUrl
        : typeof result.thumbnail === "string"
          ? result.thumbnail
          : "";
      const imageUrl = typeof result.imageUrl === "string"
        ? result.imageUrl
        : typeof result.image === "string"
          ? result.image
          : url;
      const pageUrl = typeof result.pageUrl === "string" ? result.pageUrl : url;
      if (!title && !imageUrl && !pageUrl) return [];
      return [{ title, url: pageUrl || imageUrl, pageUrl, description, thumbnailUrl, imageUrl }];
    }

    if (!title && !url && !description) return [];
    return [{
      title,
      url,
      description,
      age: typeof result.publishedAt === "string" ? result.publishedAt : null,
      source: typeof result.source === "string" ? result.source : "",
    }];
  }).slice(0, options.count ?? 10);
}

async function searchFirecrawl(
  apiKey: string,
  options: SearchOptions,
): Promise<ProviderResult> {
  const client = new Firecrawl({ apiKey });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await new Promise<unknown>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${FIRECRAWL_TIMEOUT_MS}ms`)),
      FIRECRAWL_TIMEOUT_MS,
    );
    client.search(options.query, {
      limit: options.count ?? 10,
      sources: [options.category === "images" ? "images" : options.category === "news" ? "news" : "web"],
    } as any)
      .then(resolve)
      .catch(reject);
  }).finally(() => {
    if (timer) clearTimeout(timer);
  });
  const results = normalizeFirecrawl(result, options);
  if (results.length === 0) throw new Error("Firecrawl returned no usable results");
  return { provider: "firecrawl", results };
}

function resultType(category: SearchCategory): "web_search" | "image_search" {
  return category === "images" ? "image_search" : "web_search";
}

/**
 * Build the single public web-search tool.
 *
 * Search is deliberately sequential and bounded: SearXNG is attempted first,
 * then optional Brave, then optional Firecrawl. This avoids three concurrent
 * requests and keeps memory/connection usage low on small VPS instances.
 */
export function buildWebSearchTool(options: {
  braveApiKey?: string;
  firecrawlApiKey?: string;
  userContext?: UserContext;
}) {
  return {
    description:
      "Search the web through a resilient provider chain: self-hosted SearXNG first, then configured Brave Search, then configured Firecrawl. Supports general web, news, and image searches with result count, language, pagination, freshness, and safe-search options. Use web_fetch on returned URLs when you need full page content.",
    inputSchema: z.object({
      query: z.string().min(1).max(500).describe("Specific web search query"),
      count: z.number().int().min(1).max(20).default(10).describe("Number of results, 1–20"),
      category: z.enum(["general", "news", "images"]).default("general").describe("Search category"),
      language: z.string().min(2).max(12).optional().describe("SearXNG language code, for example en or en-US"),
      page: z.number().int().min(1).max(5).default(1).describe("Result page number, 1–5"),
      timeRange: z.enum(["day", "month", "year"]).optional().describe("Restrict results by freshness"),
      safeSearch: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1).describe("Safe search level: 0 off, 1 moderate, 2 strict"),
    }),
    execute: async ({
      query,
      count = 10,
      category = "general",
      language,
      page = 1,
      timeRange,
      safeSearch = 1,
    }: SearchOptions) => {
      const searchOptions: SearchOptions = {
        query,
        count,
        category,
        language: language ?? options.userContext?.language,
        page,
        timeRange,
        safeSearch,
      };
      const attempts: Array<{ provider: string; error?: string }> = [];
      const providers: Array<[string, () => Promise<ProviderResult>]> = [];
      if (isSearxngEnabled()) {
        providers.push(["searxng", () => searchSearxng(searchOptions)]);
      }
      if (options.braveApiKey) {
        providers.push(["brave", () => searchBrave(options.braveApiKey!, searchOptions, options.userContext)]);
      }
      if (options.firecrawlApiKey) {
        providers.push(["firecrawl", () => searchFirecrawl(options.firecrawlApiKey!, searchOptions)]);
      }

      for (const [providerName, search] of providers) {
        try {
          const result = await search();
          return truncateToolResult({
            type: resultType(category),
            query,
            category,
            count: result.results.length,
            provider: result.provider,
            fallback: attempts.length > 0,
            results: result.results,
          });
        } catch (error) {
          attempts.push({ provider: providerName, error: errorMessage(error) });
        }
      }

      return truncateToolResult({
        type: resultType(category),
        query,
        category,
        count: 0,
        provider: null,
        results: [],
        error: "All configured web-search providers failed.",
        attempts,
        hint: "Check the SearXNG URL and provider configuration, then retry with a narrower query.",
      });
    },
  };
}
