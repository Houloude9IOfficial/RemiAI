import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { buildWebSearchTool } from "./web-search";
import { buildNotionTools } from "./notion";
import { buildContext7Tool } from "./context7";
import { buildFirecrawlTools } from "./firecrawl";
import { buildNewsApiTool } from "./newsapi";
import type { UserContext } from "@/lib/geo";
import { isDemoMode } from "@/lib/demo-policy";

/**
 * Build integration tools based on saved configs from the DB.
 * Only enabled tools with valid API keys are included.
 *
 * @param userContext - Optional user context (timezone, country, language)
 *   used to localize search results (unified Web Search, NewsAPI) to the user's region.
 */
export async function buildIntegrationTools(
  userContext?: UserContext,
): Promise<Record<string, any>> {
  if (isDemoMode()) return {};
  const configs = await db.select().from(toolConfigs).all();
  const tools: Record<string, any> = {};
  const braveConfig = configs.find((config) => config.toolId === "brave_search");
  const firecrawlConfig = configs.find((config) => config.toolId === "firecrawl");

  // Web search is always available through the local SearXNG endpoint. The
  // optional API keys are passed only as fallbacks, in the requested order:
  // SearXNG → Brave → Firecrawl.
  tools.web_search = buildWebSearchTool({
    braveApiKey:
      braveConfig?.enabled && braveConfig.apiKey ? braveConfig.apiKey : undefined,
    firecrawlApiKey:
      firecrawlConfig?.enabled && firecrawlConfig.apiKey
        ? firecrawlConfig.apiKey
        : undefined,
    userContext,
  });

  for (const config of configs) {
    if (!config.enabled || !config.apiKey) continue;

    switch (config.toolId) {
      case "notion":
        Object.assign(tools, buildNotionTools(config.apiKey));
        break;
      case "context7":
        Object.assign(tools, buildContext7Tool(config.apiKey));
        break;
      case "firecrawl":
        Object.assign(tools, buildFirecrawlTools(config.apiKey));
        break;
      case "newsapi":
        Object.assign(tools, buildNewsApiTool(config.apiKey, userContext));
        break;
    }
  }

  return tools;
}
