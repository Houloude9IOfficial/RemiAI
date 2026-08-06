import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import type { UserContext } from "@/lib/geo";

const BRAVE_TIMEOUT_MS = 20_000;

/**
 * Build the Brave web search tool.
 *
 * @param apiKey - Brave Search API key.
 * @param userContext - Optional user context (country, language) used to
 *   localize results to the user's region.
 */
export function buildBraveSearchTool(apiKey: string, userContext?: UserContext) {
  return {
    brave_web_search: {
      description:
        "Search the web using Brave Search. Use this to find current information, news, documentation, and answers from the internet. Returns relevant web results with titles, URLs, and descriptions. Results are automatically localized to the user's country/region and language when known.",
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .max(500)
          .describe("The search query. Be specific for best results."),
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
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(count));
        // Localize results to the user's region when known.
        if (userContext?.country) {
          url.searchParams.set("country", userContext.country);
        }
        if (userContext?.language) {
          url.searchParams.set("search_lang", userContext.language);
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
          return truncateToolResult({
            error: isTimeout
              ? `Brave Search request timed out after ${BRAVE_TIMEOUT_MS}ms`
              : `Brave Search request failed: ${(err as Error).message}`,
            hint: isTimeout
              ? "Retry with a narrower query or try again shortly."
              : "Check connectivity and Brave API configuration.",
          });
        }

        if (!res.ok) {
          return truncateToolResult({
            error: `Brave Search API error: ${res.status} ${res.statusText}`,
          });
        }

        const body = await res.json();

        const results =
          body.web?.results?.map(
            (r: {
              title?: string;
              url?: string;
              description?: string;
              page_age?: string;
            }) => ({
              title: r.title ?? "",
              url: r.url ?? "",
              description: r.description ?? "",
              age: r.page_age ?? null,
            }),
          ) ?? [];

        return truncateToolResult({
          query,
          count: results.length,
          results,
        });
      },
    },
  };
}
