import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

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

export function buildNewsApiTool(apiKey: string) {
  return {
    // ── news_search: search all articles ──
    news_search: {
      description:
        "Search news articles from thousands of sources worldwide using NewsAPI. Returns matching headlines with descriptions, URLs, publication dates, source names, and authors. Supports keyword operators (\"exact phrase\", +include, -exclude, AND/OR/NOT), language filtering, date range, and sorting by relevancy/popularity/date.\n\nTo personalise results for the user, first call get_profile to discover their location/language, then use that to tailor your query and language parameter.",
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
          .default("en")
          .describe("2-letter ISO-639-1 language code for results (default: en). Check the user's profile first to pick the right language."),
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
        language = "en",
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
        const url = new URL("https://newsapi.org/v2/everything");
        url.searchParams.set("q", query);
        url.searchParams.set("language", language);
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
        "Get the top headlines and breaking news from NewsAPI. You can filter by country, category, or keyword.\n\nTo personalise results for the user: call get_profile first to discover their location/country, then derive the 2-letter ISO 3166-1 country code and pass it as the country parameter. For example, if the user is in 'San Francisco, CA', use country='us'; if 'Paris, France', use country='fr'.\n\nAvailable categories: business, entertainment, general, health, science, sports, technology. If you omit country, the API returns global headlines.\n\nNOTE: The country and sources parameters cannot be used together. If you want a specific source, use the sources parameter instead of country.",
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
        const url = new URL("https://newsapi.org/v2/top-headlines");
        if (country) url.searchParams.set("country", country);
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
