import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildBraveSearchTool } from "./brave-search";
import { buildNotionTools } from "./notion";
import { buildContext7Tool } from "./context7";
import { buildFirecrawlTools } from "./firecrawl";

/**
 * Build integration tools based on saved configs from the DB.
 * Only enabled tools with valid API keys are included.
 */
export async function buildIntegrationTools(): Promise<Record<string, any>> {
  const configs = await db.select().from(toolConfigs).all();
  const tools: Record<string, any> = {};

  for (const config of configs) {
    if (!config.enabled || !config.apiKey) continue;

    switch (config.toolId) {
      case "brave_search":
        Object.assign(tools, buildBraveSearchTool(config.apiKey));
        break;
      case "notion":
        Object.assign(tools, buildNotionTools(config.apiKey));
        break;
      case "context7":
        Object.assign(tools, buildContext7Tool(config.apiKey));
        break;
      case "firecrawl":
        Object.assign(tools, buildFirecrawlTools(config.apiKey));
        break;
    }
  }

  return tools;
}
