import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

export function buildContext7Tool(apiKey: string) {
  return {
    context7_get_docs: {
      description:
        "Fetch up-to-date documentation and code examples for libraries and frameworks using Context7. Use this when you need accurate, version-specific API docs, migration guides, or usage examples. Requires a Context7 API key (get one at https://context7.com/dashboard).",
      parameters: z.object({
        library: z
          .string()
          .min(1)
          .describe(
            "The library or framework to get documentation for, e.g. 'next.js', 'react', 'tailwindcss', 'prisma'.",
          ),
        query: z
          .string()
          .optional()
          .describe(
            "Optional specific question or topic about the library, e.g. 'App Router', 'server actions', 'middleware'.",
          ),
      }),
      execute: async ({
        library,
        query,
      }: {
        library: string;
        query?: string;
      }) => {
        try {
          const searchQuery = query ? `${library}: ${query}` : library;
          const res = await fetch("https://mcp.context7.com/mcp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: {
                name: "get_documentation",
                arguments: { query: searchQuery },
              },
            }),
          });

          if (!res.ok) {
            return truncateToolResult({
              error: `Context7 API error: ${res.status}`,
              hint: "Verify your API key at https://context7.com/dashboard",
            });
          }

          const body = await res.json();
          const content = body?.result?.content ?? body?.content ?? [];

          return truncateToolResult({
            library,
            query: query ?? null,
            documentation: Array.isArray(content)
              ? content.map((c: any) => ({
                  type: c.type ?? "text",
                  text: typeof c.text === "string" ? c.text : JSON.stringify(c),
                }))
              : [{ type: "text", text: JSON.stringify(content) }],
          });
        } catch (err) {
          return truncateToolResult({
            error: `Context7 request failed: ${(err as Error).message}`,
            hint: "Get a free API key at https://context7.com/dashboard",
          });
        }
      },
    },
  };
}
