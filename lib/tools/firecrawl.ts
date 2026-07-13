import { z } from "zod";
import { Firecrawl } from "firecrawl";
import { truncateToolResult } from "@/lib/utils";

/**
 * Build Firecrawl integration tools — search, crawl, scrape, interact, and
 * stop interaction. All tools use the shared Firecrawl client instance.
 */
export function buildFirecrawlTools(apiKey: string) {
  const client = new Firecrawl({ apiKey });

  // ── fc_search ──────────────────────────────────────────────────────────
  const fcSearchTool = {
    description:
      "Search the web using Firecrawl. Returns search results with titles, URLs, descriptions, and optional scraped content. Supports filtering by sources (web, news, images) and limiting results.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe("The search query. Be specific for best results."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of search results to return (default: 10, max: 50)"),
      sources: z
        .array(z.enum(["web", "news", "images"]))
        .optional()
        .describe("Optional sources to search: web, news, images. Defaults to all."),
    }),
    execute: async ({
      query,
      limit = 10,
      sources,
    }: {
      query: string;
      limit?: number;
      sources?: ("web" | "news" | "images")[];
    }) => {
      try {
        const result = await client.search(query, {
          limit,
          sources: sources as any,
        });

        return truncateToolResult({
          query,
          results: result,
        });
      } catch (err) {
        return truncateToolResult({
          query,
          error: `Firecrawl search failed: ${(err as Error).message}`,
          hint: "Verify your Firecrawl API key in Settings > Tools.",
        });
      }
    },
  };

  // ── fc_scrape ──────────────────────────────────────────────────────────
  const fcScrapeTool = {
    description:
      "Scrape a single URL using Firecrawl. Returns the page content as markdown along with metadata (title, description, language, etc.). Supports optional formats like screenshot, links extraction, and JSON extraction with a custom schema.",
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe("The URL to scrape (e.g. https://example.com/page)"),
      formats: z
        .array(
          z.enum([
            "markdown",
            "html",
            "rawHtml",
            "links",
            "screenshot",
            "json",
          ]),
        )
        .optional()
        .default(["markdown"])
        .describe(
          "Output formats. Default: ['markdown']. Options: markdown, html, rawHtml, links, screenshot, json.",
        ),
      onlyMainContent: z
        .boolean()
        .optional()
        .default(true)
        .describe("Extract only the main content, stripping navigation and ads (default: true)"),
    }),
    execute: async ({
      url,
      formats = ["markdown"],
      onlyMainContent = true,
    }: {
      url: string;
      formats?: string[];
      onlyMainContent?: boolean;
    }) => {
      try {
        const result = await client.scrapeUrl(url, {
          formats: formats as any,
          onlyMainContent,
        } as any);

        return truncateToolResult({
          url,
          success: true,
          ...result,
        });
      } catch (err) {
        return truncateToolResult({
          url,
          error: `Firecrawl scrape failed: ${(err as Error).message}`,
          hint: "Verify your Firecrawl API key in Settings > Tools.",
        });
      }
    },
  };

  // ── fc_crawl ───────────────────────────────────────────────────────────
  const fcCrawlTool = {
    description:
      "Crawl a website starting from a URL using Firecrawl. Returns all discovered pages with their content. Supports limiting crawl depth and page count. Use this for documentation sites, blogs, or multi-page websites.",
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe("The URL to start crawling from (e.g. https://example.com)"),
      maxPages: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(50)
        .describe("Maximum number of pages to crawl (default: 50, max: 500)"),
      includePaths: z
        .array(z.string())
        .optional()
        .describe("Only crawl URLs matching these path patterns (e.g. ['/docs/*'])"),
      excludePaths: z
        .array(z.string())
        .optional()
        .describe("Skip URLs matching these path patterns"),
      sitemap: z
        .enum(["skip", "include", "only"])
        .optional()
        .describe("Sitemap mode: 'skip' to skip sitemap discovery, 'include' to use it, 'only' to only crawl sitemap URLs"),
    }),
    execute: async ({
      url,
      maxPages = 50,
      includePaths,
      excludePaths,
      sitemap,
    }: {
      url: string;
      maxPages?: number;
      includePaths?: string[];
      excludePaths?: string[];
      sitemap?: "skip" | "include" | "only";
    }) => {
      try {
        // Use the convenience crawl() method that polls until completion
        const result = await client.crawl(url, {
          limit: maxPages,
          includePaths,
          excludePaths,
          sitemap,
          scrapeOptions: {
            formats: ["markdown"],
            onlyMainContent: true,
          },
        });

        const docs = result.data ?? [];
        return truncateToolResult({
          url,
          status: result.status,
          totalPages: result.total,
          completedPages: result.completed,
          pages: docs.map((d) => ({
            url: d.metadata?.url ?? "unknown",
            title: d.metadata?.title ?? "",
            description: d.metadata?.description ?? "",
            contentLength: d.markdown?.length ?? 0,
          })),
          summary: `Crawled ${docs.length} page(s) from ${url}. Status: ${result.status}.`,
        });
      } catch (err) {
        return truncateToolResult({
          url,
          error: `Firecrawl crawl failed: ${(err as Error).message}`,
          hint: "Verify your Firecrawl API key in Settings > Tools. The crawl may have timed out — try with fewer pages.",
        });
      }
    },
  };

  // ── fc_interact ────────────────────────────────────────────────────────
  const fcInteractTool = {
    description:
      "Interact with a live browser session associated with a Firecrawl scrape. You can send prompts (e.g. 'click the login button') or execute Playwright code on the page. The session is started by first calling fc_scrape — use the scrapeId from its metadata. Sessions persist across multiple interact calls, allowing chained interactions.",
    inputSchema: z.object({
      scrapeId: z
        .string()
        .min(1)
        .describe(
          "The scrape ID from a previous fc_scrape call's metadata.scrapeId. Required to identify the browser session.",
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          "A natural language prompt describing what to do on the page, e.g. 'Click the login button and fill in the email field with test@example.com'",
        ),
      code: z
        .string()
        .optional()
        .describe(
          "Playwright JavaScript code to execute. The `page` variable is available globally. Use this for precise control, e.g. `await page.click('#button')`",
        ),
      language: z
        .enum(["python", "node", "bash"])
        .optional()
        .default("node")
        .describe("Language for the code parameter (default: 'node')"),
    }),
    execute: async ({
      scrapeId,
      prompt,
      code,
      language = "node",
    }: {
      scrapeId: string;
      prompt?: string;
      code?: string;
      language?: string;
    }) => {
      if (!prompt && !code) {
        return truncateToolResult({
          error: "Either `prompt` or `code` must be provided to interact with the page.",
        });
      }

      try {
        const args: any = { language };
        if (prompt) args.prompt = prompt;
        if (code) args.code = code;

        const result = await client.interact(scrapeId, args);

        return truncateToolResult({
          output: result.output ?? null,
          stdout: result.stdout ?? null,
          stderr: result.stderr ?? null,
          exitCode: result.exitCode ?? null,
          killed: result.killed ?? false,
          liveViewUrl: (result as any).liveViewUrl ?? null,
          note: "The browser session is still active. Chain more interactions or call fc_stop_interaction to end it.",
        });
      } catch (err) {
        return truncateToolResult({
          scrapeId,
          error: `Firecrawl interact failed: ${(err as Error).message}`,
          hint: "Make sure the scrapeId is valid and the browser session is still active. Call fc_scrape first to get a scrapeId.",
        });
      }
    },
  };

  // ── fc_stop_interaction ────────────────────────────────────────────────
  const fcStopInteractionTool = {
    description:
      "Stop an active browser interaction session started with fc_scrape. Call this when you are done interacting with a page to free resources and clean up the browser session.",
    inputSchema: z.object({
      scrapeId: z
        .string()
        .min(1)
        .describe(
          "The scrape ID of the interaction session to stop. This is the scrapeId from fc_scrape's metadata.",
        ),
    }),
    execute: async ({ scrapeId }: { scrapeId: string }) => {
      try {
        const result = await client.stopInteraction(scrapeId);

        return truncateToolResult({
          success: true,
          sessionDurationMs: (result as any)?.sessionDurationMs ?? null,
          creditsBilled: (result as any)?.creditsBilled ?? null,
          note: "Browser interaction session has been stopped and cleaned up.",
        });
      } catch (err) {
        return truncateToolResult({
          scrapeId,
          error: `Failed to stop interaction: ${(err as Error).message}`,
          hint: "The session may have already been closed or timed out.",
        });
      }
    },
  };

  return {
    fc_search: fcSearchTool,
    fc_scrape: fcScrapeTool,
    fc_crawl: fcCrawlTool,
    fc_interact: fcInteractTool,
    fc_stop_interaction: fcStopInteractionTool,
  };
}
