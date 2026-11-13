import { tool } from "ai";
import { z } from "zod";

export interface RecordedToolResult {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}

export function toolResultText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "";
}

export function buildReadToolResultTool(results: ReadonlyMap<string, RecordedToolResult>) {
  return tool({
    description: "Find or read earlier tool results from this run without executing the original tool again. Search by keyword or page through a known tool-call ID.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(300).optional(),
      toolCallId: z.string().min(1).optional(),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(8000).default(4000),
    }),
    execute: async ({ query, toolCallId, offset, limit }) => {
      if (toolCallId) {
        const result = results.get(toolCallId);
        if (!result) return { error: "No result with that ID in this run." };
        const content = toolResultText(result.output);
        const next = offset + limit;
        return {
          toolCallId, toolName: result.toolName, offset,
          content: content.slice(offset, next),
          nextOffset: next < content.length ? next : null,
        };
      }
      if (!query) return { error: "Provide a keyword query or a tool-call ID." };
      const keyword = query.toLowerCase();
      const matches = [];
      let skipped = 0;
      for (const result of results.values()) {
        const content = toolResultText(result.output);
        const match = content.toLowerCase().indexOf(keyword);
        const metadata = `${result.toolName} ${toolResultText(result.input)}`;
        if (match < 0 && !metadata.toLowerCase().includes(keyword)) continue;
        if (skipped++ < offset) continue;
        if (matches.length === 8) return { matches, nextOffset: offset + 8 };
        const start = Math.max(0, match - 80);
        matches.push({
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          excerpt: content.slice(start, start + 300),
        });
      }
      return { matches, nextOffset: null };
    },
  });
}
