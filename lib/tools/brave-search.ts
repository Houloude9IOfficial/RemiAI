import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

export function buildBraveSearchTool(apiKey: string) {
  return {
    brave_web_search: {
      description:
        "Search the web using Brave Search. Use this to find current information, news, documentation, and answers from the internet. Returns relevant web results with titles, URLs, and descriptions.",
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

        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey,
          },
        });

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
