import type { ToolWithConfig } from "@/app/api/tools/route";

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const toolsApi = {
  list: (): Promise<ToolWithConfig[]> =>
    fetch("/api/tools").then((res) => unwrap<ToolWithConfig[]>(res)),

  update: (
    toolId: string,
    input: { enabled?: boolean; apiKey?: string | null },
  ): Promise<{ ok: true }> =>
    fetch("/api/tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId, ...input }),
    }).then((res) => unwrap<{ ok: true }>(res)),
};
