import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

const NOTION_VERSION = "2022-06-28";

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

export function buildNotionTools(token: string) {
  return {
    // ── Search pages ─────────────────────────────────────────────
    notion_search_pages: {
      description:
        "Search for pages in your Notion workspace. Returns matching pages with their titles, IDs, and URLs. IMPORTANT: each page result has an \`id\` field (a UUID like \`359eed26-0bc3-8148-bb31-cb5b182a3219\`). You MUST pass this \`id\` value as the \`pageId\` parameter to \`notion_get_page\` to read the page content. Do NOT make up or guess the ID — always use the one returned by this search tool.",
      parameters: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "Search query to find pages. Be specific for best results.",
          ),
      }),
      execute: async ({ query }: { query: string }) => {
        const res = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers: notionHeaders(token),
          body: JSON.stringify({
            query,
            filter: { property: "object", value: "page" },
            page_size: 20,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return truncateToolResult({
            error: `Notion API error: ${res.status} — ${(err as any).message ?? res.statusText}`,
          });
        }

        const body = await res.json();
        const results = body.results ?? [];

        if (results.length === 0) {
          return truncateToolResult({
            query,
            count: 0,
            pages: [],
            hint: "No pages found. The Notion integration needs to be granted access to specific pages. Tell the user to: 1) Open the Notion page they want to access, 2) Click 'Share' in the top-right corner, 3) Add their integration by name. Only pages shared with the integration will appear in search results.",
          });
        }

        const pages = results.map(
          (p: { id: string; url?: string; properties?: Record<string, any> }) => {
            const titleProp = p.properties?.title ?? p.properties?.Name ?? {};
            const title =
              titleProp.title
                ?.map((t: any) => t.plain_text)
                .join("") ?? "Untitled";
            return {
              id: p.id,
              title,
              url: p.url ?? null,
            };
          },
        );

        return truncateToolResult({
          query,
          count: pages.length,
          pages,
        });
      },
    },

    // ── Get page content ─────────────────────────────────────────
    notion_get_page: {
      description:
        "Get the full content of a Notion page by its ID. Returns the page's content as text blocks (headings, paragraphs, lists, code, etc.). CRITICAL: the \`pageId\` MUST be a real UUID string you got from \`notion_search_pages\`. Do NOT pass placeholder values, empty strings, or the word 'undefined'. If you don't have a valid page ID, call \`notion_search_pages\` first to get one.",
      parameters: z.object({
        pageId: z
          .string()
          .min(1)
          .regex(/^[a-fA-F0-9-]{32,36}$/, {
            message:
              "pageId must be a valid Notion page UUID (32-36 hex characters with optional hyphens), e.g. 359eed26-0bc3-8148-bb31-cb5b182a3219",
          })
          .describe(
            "The UUID of the Notion page to read. Get this from the \`id\` field of \`notion_search_pages\` results. Example: 359eed26-0bc3-8148-bb31-cb5b182a3219",
          ),
      }),
      execute: async ({ pageId }: { pageId: string }) => {
        // Normalize: remove hyphens for the API call (Notion accepts both)
        const normalizedId = pageId.replace(/-/g, "");

        // Fetch blocks (page content)
        const blocksRes = await fetch(
          `https://api.notion.com/v1/blocks/${normalizedId}/children?page_size=50`,
          { headers: notionHeaders(token) },
        );

        if (!blocksRes.ok) {
          const err = await blocksRes.json().catch(() => ({}));
          return truncateToolResult({
            error: `Notion API error: ${blocksRes.status} — ${(err as any).message ?? blocksRes.statusText}`,
            hint: "Make sure you're using a real page ID from notion_search_pages results, not a made-up value.",
          });
        }

        const blocksBody = await blocksRes.json();
        const blocks = (blocksBody.results ?? []).map(parseNotionBlock);

        return truncateToolResult({
          pageId,
          blocks,
        });
      },
    },
  };
}

function parseNotionBlock(block: any): Record<string, any> {
  const type = block.type ?? "unknown";
  const content = block[type];

  if (!content) return { type, content: null };

  switch (type) {
    case "paragraph":
      return { type, text: richText(content.rich_text) };
    case "heading_1":
      return { type: "h1", text: richText(content.rich_text) };
    case "heading_2":
      return { type: "h2", text: richText(content.rich_text) };
    case "heading_3":
      return { type: "h3", text: richText(content.rich_text) };
    case "bulleted_list_item":
      return { type: "list_item", text: richText(content.rich_text) };
    case "numbered_list_item":
      return { type: "numbered_item", text: richText(content.rich_text) };
    case "code":
      return {
        type: "code",
        language: content.language ?? null,
        text: richText(content.rich_text),
      };
    case "quote":
      return { type: "quote", text: richText(content.rich_text) };
    case "to_do":
      return {
        type: "todo",
        checked: content.checked ?? false,
        text: richText(content.rich_text),
      };
    case "divider":
      return { type: "divider" };
    case "callout":
      return { type: "callout", text: richText(content.rich_text) };
    default:
      return { type, text: richText(content?.rich_text) };
  }
}

function richText(richText: any[] | undefined): string {
  if (!richText) return "";
  return richText.map((t: any) => t.plain_text ?? "").join("");
}
