import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import type { UserContext } from "@/lib/geo";

// NewsAPI's top-headlines `country` parameter only supports these countries.
// The user's derived country is used as a default only when it's supported,
// otherwise the API would return a 400.
const NEWSAPI_SUPPORTED_COUNTRIES = new Set([
  "ae", "ar", "at", "au", "be", "bg", "br", "ca", "ch", "cn", "co",
  "cu", "cz", "de", "eg", "fr", "gb", "gr", "hk", "hu", "id", "ie",
  "il", "in", "it", "jp", "kr", "lt", "lv", "ma", "mx", "my", "ng",
  "nl", "no", "nz", "ph", "pl", "pt", "ro", "rs", "ru", "sa", "se",
  "sg", "si", "sk", "th", "tr", "tw", "ua", "us", "ve", "za",
]);

function mapArticles(
  articles: Array<{
    title?: string;
    description?: string;
    url?: string;
    urlToImage?: string;
    publishedAt?: string;
    source?: { id?: string | null; name?: string };
    author?: string | null;
  }>,
) {
  return articles.map((a) => ({
    title: a.title ?? "",
    description: a.description ?? "",
    url: a.url ?? "",
    imageUrl: a.urlToImage ?? null,
    publishedAt: a.publishedAt ?? null,
    source: a.source?.name ?? null,
    author: a.author ?? null,
  }));
}

export function buildNewsApiTool(apiKey: string, userContext?: UserContext) {
  return {
    // ── news_search: search all articles ──
    news_search: {
      description:
        "Search news articles from thousands of sources worldwide using NewsAPI. Returns matching headlines with descriptions, URLs, publication dates, source names, and authors. Supports keyword operators (\"exact phrase\", +include, -exclude, AND/OR/NOT), language filtering, date range, and sorting by relevancy/popularity/date.\n\nThe language parameter defaults to the user's browser language. To personalise results further, call get_profile to discover their location/language and tailor your query.",
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "Keywords or phrases to search for. Supports operators: \"exact phrase\", +include, -exclude, AND/OR/NOT.",
          ),
        language: z
          .string()
          .length(2)
          .optional()
          .describe("2-letter ISO-639-1 language code for results. Defaults to the user's browser language (usually 'en'). Check the user's profile first to pick the right language."),
        sortBy: z
          .enum(["relevancy", "popularity", "publishedAt"])
          .default("publishedAt")
          .describe("Sort order: relevancy (most relevant), popularity (most discussed), or publishedAt (newest first)"),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of results to return (max 100, default 10)"),
        from: z
          .string()
          .optional()
          .describe(
            "ISO 8601 date to filter articles from (e.g. 2025-01-01). Only returns articles published on or after this date.",
          ),
      }),
      execute: async ({
        query,
        language,
        sortBy = "publishedAt",
        pageSize = 10,
        from,
      }: {
        query: string;
        language?: string;
        sortBy?: string;
        pageSize?: number;
        from?: string;
      }) => {
        const resolvedLanguage = language ?? userContext?.language ?? "en";
        const url = new URL("https://newsapi.org/v2/everything");
        url.searchParams.set("q", query);
        url.searchParams.set("language", resolvedLanguage);
        url.searchParams.set("sortBy", sortBy);
        url.searchParams.set("pageSize", String(pageSize));
        if (from) url.searchParams.set("from", from);
        url.searchParams.set("apiKey", apiKey);

        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          return truncateToolResult({
            error: `NewsAPI error: ${res.status} ${res.statusText}`,
          });
        }

        const body = await res.json();

        if (body.status === "error") {
          return truncateToolResult({
            error: `NewsAPI error: ${body.code} — ${body.message}`,
          });
        }

        return truncateToolResult({
          query,
          totalResults: body.totalResults ?? 0,
          count: (body.articles ?? []).length,
          articles: mapArticles(body.articles ?? []),
        });
      },
    },

    // ── news_top_headlines: get top/breaking headlines ──
    news_top_headlines: {
      description:
        "Get the top headlines and breaking news from NewsAPI. You can filter by country, category, or keyword.\n\nWhen no country is given, headlines default to the user's country (derived from their browser locale/timezone). You can still pass an explicit country to override. For example, if the user is in 'San Francisco, CA', country='us'; if 'Paris, France', country='fr'.\n\nAvailable categories: business, entertainment, general, health, science, sports, technology.\n\nNOTE: The country and sources parameters cannot be used together. If you want a specific source, use the sources parameter instead of country.",
      parameters: z.object({
        country: z
          .string()
          .length(2)
          .optional()
          .describe(
            "2-letter ISO 3166-1 country code for country-specific headlines (e.g. 'us', 'gb', 'fr', 'de', 'jp'). Derive this from the user's profile location by first calling get_profile. Cannot be used with 'sources'.",
          ),
        category: z
          .enum([
            "business",
            "entertainment",
            "general",
            "health",
            "science",
            "sports",
            "technology",
          ])
          .optional()
          .describe(
            "Category to get headlines for. Cannot be used with 'sources'.",
          ),
        query: z
          .string()
          .max(500)
          .optional()
          .describe(
            "Keywords to search for within headlines. Use this to narrow down top headlines to a specific topic.",
          ),
        sources: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of source identifiers to get headlines from (e.g. 'bbc-news,cnn,techcrunch'). Cannot be used with 'country' or 'category'.",
          ),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of headlines to return (max 100, default 10)"),
      }),
      execute: async ({
        country,
        category,
        query,
        sources,
        pageSize = 10,
      }: {
        country?: string;
        category?: string;
        query?: string;
        sources?: string;
        pageSize?: number;
      }) => {
        const defaultCountry =
          userContext?.country && NEWSAPI_SUPPORTED_COUNTRIES.has(userContext.country)
            ? userContext.country
            : undefined;
        const resolvedCountry = country ?? defaultCountry;
        const url = new URL("https://newsapi.org/v2/top-headlines");
        if (resolvedCountry) url.searchParams.set("country", resolvedCountry);
        if (category) url.searchParams.set("category", category);
        if (query) url.searchParams.set("q", query);
        if (sources) url.searchParams.set("sources", sources);
        url.searchParams.set("pageSize", String(pageSize));
        url.searchParams.set("apiKey", apiKey);

        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          return truncateToolResult({
            error: `NewsAPI error: ${res.status} ${res.statusText}`,
          });
        }

        const body = await res.json();

        if (body.status === "error") {
          return truncateToolResult({
            error: `NewsAPI error: ${body.code} — ${body.message}`,
          });
        }

        return truncateToolResult({
          query: query ?? null,
          country: country ?? null,
          category: category ?? null,
          sources: sources ?? null,
          totalResults: body.totalResults ?? 0,
          count: (body.articles ?? []).length,
          articles: mapArticles(body.articles ?? []),
        });
      },
    },
  };
}
