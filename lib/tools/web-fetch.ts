import { parse, type DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";
import fs from "node:fs/promises";
import { truncateToolResult } from "@/lib/utils";
import {
  resolveUploadUrl,
  UPLOAD_URL_RE,
  SESSION_FILE_URL_RE,
} from "@/lib/fs/access";

const WEB_FETCH_TIMEOUT_MS = 20_000;

/**
 * Check if a URL is a local chat file path (either /api/chat/uploads/... or
 * /api/chat/{id}/session-files/... — with or without a localhost origin).
 * These are read directly from disk instead of making an HTTP request.
 */
function isLocalChatFileUrl(url: string): boolean {
  // Strip protocol + hostname if present
  const normalized = url.replace(/^https?:\/\/[^\/]+/i, "");
  return UPLOAD_URL_RE.test(normalized) || SESSION_FILE_URL_RE.test(normalized);
}

/**
 * Read an uploaded file from disk and return its text content.
 * Used when the URL points to the local uploads directory.
 */
async function readUpload(url: string, maxChars: number) {
  const { resolvedPath } = await resolveUploadUrl(url);
  // stat checks the file exists (throws if not)
  await fs.stat(resolvedPath);
  const text = await fs.readFile(resolvedPath, "utf-8");
  const contentLength = text.length;

  const truncated =
    text.length > maxChars
      ? text.slice(0, maxChars) +
        `\n\n[...truncated: ${(text.length - maxChars).toLocaleString()} more characters]`
      : text;

  return truncateToolResult({
    url,
    status: 200,
    statusText: "OK",
    contentType: "text/plain",
    contentLength,
    returnedLength: Math.min(contentLength, maxChars),
    truncated: contentLength > maxChars,
    source: "local_upload",
    content: truncated,
  });
}

const HTML_NOISE = new Set(["script", "style", "noscript", "template", "svg", "nav", "footer", "aside"]);
const HTML_BLOCKS = new Set(["article", "section", "main", "div", "p", "br", "li", "tr", "pre", "h1", "h2", "h3", "h4", "h5", "h6"]);

export function extractWebPageText(html: string, url: string) {
  const document = parse(html);
  let title = "";
  const links = new Set<string>();
  const chunks: string[] = [];

  function visit(node: DefaultTreeAdapterMap["node"], inBody = false) {
    if ("value" in node && node.nodeName === "#text") {
      if (inBody) chunks.push(node.value);
      return;
    }
    if ("tagName" in node) {
      const tag = node.tagName;
      if (tag === "title") {
        title = node.childNodes.map((child) => "value" in child ? child.value : "").join("").trim();
        return;
      }
      if (HTML_NOISE.has(tag) || node.attrs.some(({ name, value }) =>
        name === "hidden" || (name === "aria-hidden" && value === "true"))) return;
      if (tag === "a" && inBody && links.size < 25) {
        const href = node.attrs.find(({ name }) => name === "href")?.value;
        if (href && !href.startsWith("#")) {
          try {
            const target = new URL(href, url);
            if (target.protocol === "http:" || target.protocol === "https:") {
              target.hash = "";
              links.add(target.href);
            }
          } catch {
            // Ignore malformed links.
          }
        }
      }
      if (HTML_BLOCKS.has(tag)) chunks.push("\n");
      inBody ||= tag === "body";
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) visit(child, inBody);
    }
    if ("tagName" in node && HTML_BLOCKS.has(node.tagName)) chunks.push("\n");
  }

  visit(document);
  return {
    title,
    text: chunks.join("").replace(/[^\S\n]+/g, " ").replace(/ *\n[ \n]*/g, "\n").trim(),
    links: [...links],
  };
}

/**
 * web_fetch tool — fetch a specific URL and return its content as text.
 * Uses the native fetch() API for external URLs.
 * For chat upload URLs (e.g. /api/chat/uploads/...), reads directly from disk.
 */
function buildWebFetchTool(readableHtml: boolean) {
  return {
    description:
      "Fetch a URL (web page, REST API, raw text) and return its content as text. Also reads local chat/session file URLs directly from disk. Returns status code, content type, and body. Only fetch URLs you obtained from a search result, the user, or a previous tool result — never guess or invent a URL.",
    inputSchema: z.object({
      url: z
        .string()
        .min(1)
        .describe("Full URL (https://...), chat upload URL, or session-file URL"),
      ...(readableHtml ? { raw: z.boolean().optional().describe("Return raw HTML markup instead of readable page text") } : {}),
      maxChars: z
        .number()
        .int()
        .positive()
        .max(100_000)
        .default(20_000)
        .describe("Max chars of body to return (default: 20,000, max: 100,000); beyond this is truncated"),
    }),
    execute: async ({
      url,
      maxChars = 20_000,
      raw = false,
    }: {
      url: string;
      maxChars?: number;
      raw?: boolean;
    }) => {
      // For local chat file URLs, read directly from disk instead of making an HTTP request
      if (isLocalChatFileUrl(url)) {
        try {
          return await readUpload(url, maxChars);
        } catch {
          // Fall through to HTTP fetch if local read fails
        }
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), WEB_FETCH_TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch(url, {
            headers: {
              Accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*",
              "User-Agent":
                "Mozilla/5.0 (compatible; RemiAI/1.0; +https://remiai.crickdevs.com)",
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        const status = res.status;
        const statusText = res.statusText;
        const contentType = res.headers.get("content-type") ?? "unknown";
        const body = await res.text();
        const page = readableHtml && !raw && /^(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)
          ? extractWebPageText(body, res.url || url)
          : undefined;
        const text = page?.text ?? body;
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
          ...(page ? { title: page.title, links: page.links } : {}),
          source: status === 200 ? "http" : "http_error",
        });
      } catch (err) {
        const timeoutHint =
          err instanceof Error && err.name === "AbortError"
            ? `Request timed out after ${WEB_FETCH_TIMEOUT_MS}ms`
            : null;

        return truncateToolResult({
          url,
          error:
            timeoutHint ?? `Failed to fetch URL: ${(err as Error).message}`,
          hint:
            timeoutHint != null
              ? "The remote site is slow or unreachable. Retry later or fetch a smaller/specific endpoint."
              : "Make sure the URL is accessible and the server is reachable.",
        });
      }
    },
  };
}

export const webFetchTool = buildWebFetchTool(false);
export const chatWebFetchTool = buildWebFetchTool(true);
