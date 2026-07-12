import { getAllNamespacedTools, type McpServerRow } from "./client-pool";

/**
 * Get all MCP tools from enabled servers, namespaced and ready for use.
 * This is a thin convenience wrapper around the client-pool.
 */
export async function getMcpTools(
  servers: McpServerRow[],
): Promise<Record<string, any>> {
  if (servers.length === 0) return {};
  return getAllNamespacedTools(servers);
}
