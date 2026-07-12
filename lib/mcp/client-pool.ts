import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { mcpServers } from "@/db/schema";

export type McpServerRow = typeof mcpServers.$inferSelect;

export type McpTestResult = {
  ok: boolean;
  toolCount?: number;
  toolNames?: string[];
  instructions?: string;
  serverInfo?: { name: string; version: string };
  error?: string;
};

export type McpToolEntry = {
  serverName: string;
  namespacedName: string;
  tool: Record<string, unknown>;
};

/**
 * Create an MCP client from a database server row.
 */
export async function createClientFromRow(
  server: McpServerRow,
): Promise<MCPClient> {
  if (server.transport === "stdio") {
    if (!server.command) throw new Error("stdio server requires a command");
    const transport = new StdioMCPTransport({
      command: server.command,
      args: (server.args as string[] | undefined) ?? undefined,
      env: (server.env as Record<string, string> | undefined) ?? undefined,
    });
    return createMCPClient({ transport });
  } else {
    // HTTP/SSE transport
    if (!server.url) throw new Error("http server requires a url");
    return createMCPClient({
      transport: {
        type: "http",
        url: server.url,
        headers: (server.headers as Record<string, string> | undefined) ?? undefined,
      },
    });
  }
}

/**
 * Test connection to an MCP server. Creates client, fetches tools, then closes.
 * Returns a summary of the result, never throws.
 */
export async function testConnection(server: McpServerRow): Promise<McpTestResult> {
  let client: MCPClient | undefined;
  try {
    client = await createClientFromRow(server);
    const tools = await client.tools();
    const toolEntries = Object.entries(tools);
    return {
      ok: true,
      toolCount: toolEntries.length,
      toolNames: toolEntries.map(([name]) => name),
      instructions: client.instructions ?? undefined,
      serverInfo: {
        name: client.serverInfo.name,
        version: client.serverInfo.version,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Fetch tools from a single MCP server, namespaced by server name.
 * Returns an array of tool entries, never throws (returns empty on error).
 */
export async function getNamespacedTools(
  server: McpServerRow,
): Promise<McpToolEntry[]> {
  let client: MCPClient | undefined;
  try {
    client = await createClientFromRow(server);
    const tools = await client.tools();
    return Object.entries(tools).map(([name, tool]) => ({
      serverName: server.name,
      namespacedName: `${server.name}__${name}`,
      tool: tool as Record<string, unknown>,
    }));
  } catch {
    return [];
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Fetch tools from multiple MCP servers, namespaced by server name.
 * Each server's tools are wrapped in try/catch — one failure doesn't break others.
 */
export async function getAllNamespacedTools(
  servers: McpServerRow[],
): Promise<Record<string, any>> {
  const results = await Promise.allSettled(
    servers.map((server) => getNamespacedTools(server)),
  );

  const merged: Record<string, unknown> = {};
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const entry of result.value) {
        merged[entry.namespacedName] = entry.tool;
      }
    }
  }
  return merged;
}
