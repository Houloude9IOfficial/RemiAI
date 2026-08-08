import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// SVG wrapper — minimal, transparent-friendly shell
// ---------------------------------------------------------------------------

function wrapSvg(svgContent: string): string {
  // If it's already a full <svg> document, use as-is
  if (/<svg[\s>]/i.test(svgContent.trim())) {
    return svgContent;
  }
  // Otherwise wrap in a minimal SVG container
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">${svgContent}</svg>`;
}

// ---------------------------------------------------------------------------
// HTML wrapper — sandboxed document shell with transparent bg
// ---------------------------------------------------------------------------

function wrapHtml(htmlContent: string): string {
  const lower = htmlContent.toLowerCase();
  // If it already looks like a full HTML document, use as-is
  if (/<!doctype\s+html|<html[\s>]/i.test(lower)) {
    return htmlContent;
  }
  // Otherwise wrap in a minimal HTML document with transparent body + chat theme vars
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --chat-bg: transparent;
    --chat-fg: inherit;
    --chat-muted: inherit;
    --chat-border: transparent;
    --chat-primary: inherit;
    --background: transparent;
    --foreground: inherit;
  }
  html, body {
    min-height: 100%;
    background: transparent !important;
    background-color: transparent !important;
    color: var(--chat-fg, inherit);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Content type detection helper
// ---------------------------------------------------------------------------

function detectAndWrap(type: "svg" | "html", content: string): string {
  if (type === "svg") return wrapSvg(content);
  return wrapHtml(content);
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const createVisualTool = {
  description: `Create a dynamic visual (SVG chart/diagram or HTML card/dashboard) and render it inline in the chat. Use whenever a visual helps the user understand faster than text: data charts (bar/line/pie), KPI metrics cards, timelines/process steps, comparison tables, flow diagrams.

## Design rules — NO AI SLOP
- **Never** use purple/violet gradients; avoid the overused AI looks (cream+serif+terracotta, near-black+acid green, broadsheet hairline columns) unless the brief demands them.
- Ground colors in the subject: financial → greens/blues; technical → structured/monospace; nature → earth tones.
- **Always transparent background** — no fills on the root SVG/HTML body. Use chat theme vars when needed: \`var(--chat-bg)\`, \`var(--chat-fg)\`, \`var(--chat-muted)\`, \`var(--chat-border)\`, \`var(--chat-primary)\`.
- Clean and intentional: whitespace, 2-3 colors max, subtle borders, 8-12px radius.
- SVG: use viewBox, include axis labels. HTML: flexbox/grid, subtle shadows. Fonts: 14-16px body, 20-32px headings. Responsive width 100%.`,

  inputSchema: z.object({
    type: z
      .enum(["svg", "html"])
      .describe('Format: "svg" for charts/diagrams/2D graphics; "html" for cards/dashboards/stats panels'),
    title: z
      .string()
      .min(1)
      .max(120)
      .describe("Short title shown as a header above the visual"),
    content: z
      .string()
      .min(1)
      .max(50_000)
      .describe("SVG or HTML markup to render. For SVG include the <svg> tag with viewBox. Keep backgrounds transparent unless the user requests otherwise."),
    options: z
      .object({
        width: z
          .string()
          .optional()
          .describe("CSS width (e.g. '100%', '600px'). Default '100%'"),
        height: z
          .string()
          .optional()
          .describe("CSS height (e.g. 'auto', '400px'). Default 'auto'"),
        caption: z
          .string()
          .max(300)
          .optional()
          .describe("Optional caption displayed below the visual"),
        align: z
          .enum(["center", "left", "right"])
          .optional()
          .describe("Alignment within the chat: 'center' (default), 'left', or 'right'"),
      })
      .optional()
      .describe("Optional display options"),
  }),

  execute: async ({
    type,
    title,
    content,
    options,
  }: {
    type: "svg" | "html";
    title: string;
    content: string;
    options?: {
      width?: string;
      height?: string;
      caption?: string;
      align?: "center" | "left" | "right";
    };
  }) => {
    // Wrap content in appropriate document shell
    const finalContent = detectAndWrap(type, content);

    const result = {
      type: "visual" as const,
      visualType: type,
      title,
      content: finalContent,
      width: options?.width ?? "100%",
      height: options?.height ?? "auto",
      caption: options?.caption ?? null,
      align: options?.align ?? "center",
      note: "Visual rendered with transparent background. Use get_tool_help({ topic: 'create-visual' }) for design guidelines.",
    };

    return truncateToolResult(result);
  },
};

// ---------------------------------------------------------------------------
// Builder function for the chat route
// ---------------------------------------------------------------------------

/**
 * Build the create_visual tool. Respects the user's toggle setting in DB.
 * Enabled by default for backward compatibility (was previously always-on).
 */
export async function buildCreateVisualTool(): Promise<Record<string, any>> {
  const config = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "create_visual"))
    .get();

  // Default to enabled if no config exists (backward compatible)
  if (config && !config.enabled) {
    return {};
  }

  return {
    create_visual: createVisualTool,
  };
}
