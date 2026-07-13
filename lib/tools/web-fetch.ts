import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

/**
 * web_fetch tool — fetch a specific URL and return its content as text.
 * Uses the native fetch() API. Builtin, always available.
 */
export const webFetchTool = {
  description:
    "Fetch a specific URL and return its content as text. Use this to read web pages, REST APIs, raw text files, or any publicly accessible URL directly. Returns the status code, content type, and body content.",
  inputSchema: z.object({
    url: z.string().url().describe("The full URL to fetch (e.g. https://example.com/api/data)"),
    maxChars: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .default(20_000)
      .describe(
        "Maximum characters of body content to return (default: 20,000, max: 100,000). Content beyond this limit is truncated.",
      ),
  }),
  execute: async ({
    url,
    maxChars = 20_000,
  }: {
    url: string;
    maxChars?: number;
  }) => {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*",
          "User-Agent":
            "Mozilla/5.0 (compatible; RemiAI/1.0; +https://remiai.app)",
        },
      });

      const status = res.status;
      const statusText = res.statusText;
      const contentType = res.headers.get("content-type") ?? "unknown";
      const text = await res.text();
      const contentLength = text.length;

      const truncated =
        text.length > maxChars
          ? text.slice(0, maxChars) +
            `\n\n[...truncated: ${(text.length - maxChars).toLocaleString()} more characters. Use a more specific URL or endpoint to get less data.]`
          : text;

      return truncateToolResult({
        url,
        status,
        statusText,
        contentType,
        contentLength,
        returnedLength: Math.min(contentLength, maxChars),
        truncated: contentLength > maxChars,
        content: truncated,
      });
    } catch (err) {
      return truncateToolResult({
        url,
        error: `Failed to fetch URL: ${(err as Error).message}`,
        hint: "Make sure the URL is accessible and the server is reachable.",
      });
    }
  },
};
