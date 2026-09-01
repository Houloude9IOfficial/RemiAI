import { NextResponse } from "next/server";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { demoBlockedResponse, isDemoMode } from "@/lib/demo-policy";
import { eq } from "drizzle-orm";
import { TOOL_CATALOG, type ToolDefinition } from "@/lib/tools/catalog";

export type ToolWithConfig = ToolDefinition & {
  config: {
    enabled: boolean;
    apiKey: string | null; // masked preview
    hasApiKey: boolean;
    apiKeyValue?: string | null; // only used for saving, never displayed
    extraValues?: Record<string, string>; // values for extraFields (toggles, selects, etc.)
  };
};

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

export async function GET() {
  if (isDemoMode()) return NextResponse.json([]);
  const configs = await db.select().from(toolConfigs).all();
  const configMap = new Map(configs.map((c) => [c.toolId, c]));

  const tools: ToolWithConfig[] = TOOL_CATALOG.map((def) => {
    const saved = configMap.get(def.id);
    return {
      ...def,
      config: {
        enabled: saved?.enabled ?? false,
        apiKey: maskKey(saved?.apiKey ?? null),
        hasApiKey: !!saved?.apiKey,
        apiKeyValue: saved?.apiKey ?? null, // kept for save flow, never rendered
        extraValues: (saved?.config as Record<string, string>) ?? {},
      },
    };
  });

  return NextResponse.json(tools);
}

export async function PATCH(req: Request) {
  if (isDemoMode()) return demoBlockedResponse();
  const body = (await req.json()) as {
    toolId: string;
    enabled?: boolean;
    apiKey?: string | null;
    config?: Record<string, string>;
  };

  const def = TOOL_CATALOG.find((t) => t.id === body.toolId);
  if (!def) {
    return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, body.toolId))
    .get();

  // Merge the existing config JSON with any new config values
  let mergedConfig = (existing?.config as Record<string, string>) ?? {};
  if (body.config) {
    mergedConfig = { ...mergedConfig, ...body.config };
  }

  const data: Record<string, any> = {};
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.apiKey !== undefined) data.apiKey = body.apiKey || null;
  if (body.config !== undefined) data.config = mergedConfig;
  data.updatedAt = new Date().toISOString();

  if (existing) {
    await db
      .update(toolConfigs)
      .set(data)
      .where(eq(toolConfigs.toolId, body.toolId));
  } else {
    await db.insert(toolConfigs).values({
      toolId: body.toolId,
      enabled: body.enabled ?? false,
      apiKey: body.apiKey ?? null,
      config: mergedConfig,
    });
  }

  return NextResponse.json({ ok: true });
}
