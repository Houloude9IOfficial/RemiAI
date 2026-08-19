export type McpTransportKind = "stdio" | "http";

export type McpServer = {
  id: number;
  name: string;
  transport: McpTransportKind;
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  headers: Record<string, string> | null;
  enabled: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type McpServerInput = {
  name: string;
  transport: McpTransportKind;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  headers?: Record<string, string> | null;
};

export type McpTestResult = {
  ok: boolean;
  toolCount?: number;
  toolNames?: string[];
  instructions?: string;
  serverInfo?: { name: string; version: string };
  error?: string;
};

export type McpJsonServerConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
};

export type McpImportInput = {
  mcpServers: Record<string, McpJsonServerConfig>;
};

export type McpImportResult = {
  created: string[];
  updated: string[];
  errors: { name: string; error: string }[];
};

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const mcpServersApi = {
  list: (): Promise<McpServer[]> =>
    fetch("/api/mcp-servers").then((res) => unwrap<McpServer[]>(res)),

  create: (input: McpServerInput): Promise<McpServer> =>
    fetch("/api/mcp-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<McpServer>(res)),

  update: (
    id: number,
    input: Partial<McpServerInput & { enabled: boolean }>,
  ): Promise<McpServer> =>
    fetch(`/api/mcp-servers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<McpServer>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/mcp-servers/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),

  test: (id: number): Promise<McpTestResult> =>
    fetch(`/api/mcp-servers/${id}/test`, { method: "POST" }).then((res) =>
      unwrap<McpTestResult>(res),
    ),

  import: (input: McpImportInput): Promise<McpImportResult> =>
    fetch("/api/mcp-servers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((res) => unwrap<McpImportResult>(res)),
};
