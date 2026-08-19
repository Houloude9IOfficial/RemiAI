import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpServers } from "@/db/schema";
import { mcpServersImportSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";

/**
 * Import (create or update) MCP servers from a standard MCP client config:
 *
 * {
 *   "mcpServers": {
 *     "ntfy": { "command": "npx", "args": ["-y", "..."], "env": { "X": "Y" } },
 *     "remote": { "url": "http://localhost:3001", "headers": { ... } }
 *   }
 * }
 *
 * Servers are matched by name: existing servers are updated, new ones created.
 * Transport is inferred — a `url` means http, otherwise stdio (requires command).
 */
export async function POST(req: Request) {
  let body: ReturnType<typeof mcpServersImportSchema.parse>;
  try {
    body = mcpServersImportSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const created: string[] = [];
  const updated: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const [name, config] of Object.entries(body.mcpServers)) {
    const transport: "stdio" | "http" = config.url ? "http" : "stdio";

    const values = {
      name,
      transport,
      command: transport === "stdio" ? (config.command ?? null) : null,
      args: transport === "stdio" ? (config.args ?? null) : null,
      env: transport === "stdio" ? (config.env ?? null) : null,
      url: transport === "http" ? config.url! : null,
      headers: transport === "http" ? (config.headers ?? null) : null,
    };

    try {
      const existing = await db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .get();

      if (existing) {
        await db
          .update(mcpServers)
          .set(values)
          .where(eq(mcpServers.id, existing.id));
        updated.push(name);
      } else {
        await db.insert(mcpServers).values(values);
        created.push(name);
      }
    } catch (err) {
      errors.push({
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ created, updated, errors });
}
