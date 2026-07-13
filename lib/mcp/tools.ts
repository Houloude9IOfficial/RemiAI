import {
  createClientFromRow,
  type McpServerRow,
  type MCPClient,
} from "./client-pool";

/**
 * Create MCP clients and return both the namespaced tools and a cleanup
 * function to close them after streaming completes.
 *
 * IMPORTANT: The tool definitions returned by `client.tools()` contain
 * `execute` callbacks that reference the live client. The clients MUST
 * stay open until the AI finishes calling tools — close them via the
 * returned cleanup function when done.
 */
export async function createMcpToolsManager(servers: McpServerRow[]): Promise<{
  tools: Record<string, any>;
  close: () => Promise<void>;
}> {
  const clients: MCPClient[] = [];
  const tools: Record<string, any> = {};

  for (const server of servers) {
    try {
      const client = await createClientFromRow(server);
      clients.push(client);
      const mcpTools = await client.tools();
      for (const [name, tool] of Object.entries(mcpTools)) {
        tools[`${server.name}__${name}`] = tool;
      }
    } catch (err) {
      console.warn(
        `[MCP] Failed to connect server "${server.name}":`,
        err instanceof Error ? err.message : err,
      );
      // One server failing shouldn't break others
    }
  }

  const close = async () => {
    await Promise.allSettled(clients.map((c) => c.close()));
  };

  return { tools, close };
}

/**
 * Get all MCP tools from enabled servers, namespaced and ready for use.
 *
 * @deprecated This function closes the MCP clients immediately after fetching
 * tool schemas, which means tools cannot be executed. Use
 * `createMcpToolsManager` instead and keep clients alive during streaming.
 */
export async function getMcpTools(
  servers: McpServerRow[],
): Promise<Record<string, any>> {
  const { tools, close } = await createMcpToolsManager(servers);
  await close();
  return tools;
}
