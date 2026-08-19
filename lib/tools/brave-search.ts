import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import type { UserContext } from "@/lib/geo";

const BRAVE_TIMEOUT_MS = 20_000;
const BRAVE_API_BASE = "https://api.search.brave.com/res/v1";

interface BraveError {
  message: string;
  hint?: string;
}

/**
 * Shared helper for hitting the Brave Search API with a timeout + the
 * subscription-token header. Both the web and image search endpoints use the
 * same request/error handling.
 */
async function braveGet(
  apiKey: string,
  path: string,
  params: Record<string, string>,
): Promise<{ res?: Response; error?: BraveError }> {
  const url = new URL(`${BRAVE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BRAVE_TIMEOUT_MS);
    try {
      res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      error: {
        message: isTimeout
          ? `Brave Search request timed out after ${BRAVE_TIMEOUT_MS}ms`
          : `Brave Search request failed: ${(err as Error).message}`,
        hint: isTimeout
          ? "Retry with a narrower query or try again shortly."
          : "Check connectivity and Brave API configuration.",
      },
    };
  }

  return { res };
}

/** Build the localization query params shared by both search endpoints. */
function localizationParams(userContext?: UserContext): Record<string, string> {
  const params: Record<string, string> = {};
  if (userContext?.country) params.country = userContext.country;
  if (userContext?.language) params.search_lang = userContext.language;
  return params;
}

/**
 * Build the Brave web + image search tools.
 *
 * @param apiKey - Brave Search API key.
 * @param userContext - Optional user context (country, language) used to
 *   localize results to the user's region.
 */
export function buildBraveSearchTool(apiKey: string, userContext?: UserContext) {
  return {
    brave_web_search: {
      description:
        "Search the web using Brave Search for current information, news, docs, and answers. Returns results with titles, URLs, and descriptions, localized to the user's region when known.",
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("The search query; be specific for best results"),
        count: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Number of results to return (max 20, default 10)"),
      }),
      execute: async ({
        query,
        count = 10,
      }: {
        query: string;
        count?: number;
      }) => {
        const { res, error } = await braveGet(apiKey, "/web/search", {
          q: query,
          count: String(count),
          ...localizationParams(userContext),
        });

        if (error) {
          return truncateToolResult({ error: error.message, hint: error.hint });
        }

        if (!res!.ok) {
          return truncateToolResult({
            error: `Brave Search API error: ${res!.status} ${res!.statusText}`,
          });
        }

        const body = await res!.json();

        const results =
          body.web?.results?.map(
            (r: {
              title?: string;
              url?: string;
              description?: string;
              page_age?: string;
              thumbnail?: { src?: string; logo?: boolean };
            }) => {
              // Only keep real content thumbnails — `logo: true` marks a
              // site favicon, which is noise when showing "images of results".
              const thumbnail = r.thumbnail?.src
                ? { src: r.thumbnail.src, logo: r.thumbnail.logo === true }
                : null;
              return {
                title: r.title ?? "",
                url: r.url ?? "",
                description: r.description ?? "",
                age: r.page_age ?? null,
                thumbnail,
              };
            },
          ) ?? [];

        return truncateToolResult({
          type: "web_search",
          query,
          count: results.length,
          results,
        });
      },
    },

    brave_image_search: {
      description:
        "Search for images across the web using Brave Search. Returns a gallery of image results with clickable thumbnails, full-size image URLs, source page URLs, and titles. Use this when the user wants to SEE pictures, photos, or visual examples of something (e.g. 'show me pictures of X', 'what does X look like'). Do NOT use it for ordinary text/web searches.",
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("The image search query; be specific for best results"),
        count: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Number of image results to return (max 20, default 10)"),
      }),
      execute: async ({
        query,
        count = 10,
      }: {
        query: string;
        count?: number;
      }) => {
        const { res, error } = await braveGet(apiKey, "/images/search", {
          q: query,
          count: String(count),
          ...localizationParams(userContext),
        });

        if (error) {
          return truncateToolResult({ error: error.message, hint: error.hint });
        }

        if (!res!.ok) {
          return truncateToolResult({
            error: `Brave Image Search API error: ${res!.status} ${res!.statusText}`,
          });
        }

        const body = await res!.json();

        const results =
          body.results?.map(
            (r: {
              title?: string;
              url?: string;
              source?: string;
              page_url?: string;
              thumbnail?: { src?: string };
              properties?: { url?: string; width?: number; height?: number };
            }) => {
              const thumbnailUrl = r.thumbnail?.src || r.url || "";
              const imageUrl = r.properties?.url || r.url || "";
              const pageUrl = r.page_url ?? "";
              return {
                title: r.title ?? "",
                thumbnailUrl,
                imageUrl,
                // `url` mirrors the source page so the research provenance
                // pipeline (source-storage) can record image results too.
                url: pageUrl,
                pageUrl,
                source: r.source ?? "",
                width: r.properties?.width ?? null,
                height: r.properties?.height ?? null,
              };
            },
          ) ?? [];

        return truncateToolResult({
          type: "image_search",
          query,
          count: results.length,
          results,
        });
      },
    },
  };
}
