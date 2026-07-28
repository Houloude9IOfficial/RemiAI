import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

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
  // Otherwise wrap in a minimal HTML document with transparent body
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    min-height: 100%;
    background: transparent !important;
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
  description: `Create a dynamic visual (SVG chart/diagram or HTML card/dashboard) and render it directly in the chat.

Use this tool whenever you want to show the user a visual representation of data, concepts, or comparisons — instead of plain text. This is great for:
- **Data charts**: Bar charts, line charts, pie charts, bubble charts for numerical data
- **Metrics cards**: Clean KPI cards with numbers, labels, and sparklines
- **Timelines / Process steps**: Vertical or horizontal step-by-step visuals
- **Comparison tables**: Side-by-side cards or comparison matrices
- **Flow diagrams**: Process flows, decision trees, architecture diagrams
- **Any other visual**: Dynamic, context-based visuals

## CRITICAL: Design principles — NO AI SLOP

You are the design lead for a small studio. The user has already rejected templated visuals. Every visual you create MUST feel intentional and distinctive — NOT like an AI default. Follow these rules strictly:

### 1. No templated defaults
AI-generated design currently clusters around three looks that you MUST avoid unless the brief explicitly calls for them:
- A warm cream background (#F4F1EA) with serif display and terracotta accent
- A near-black background with acid-green or vermilion accent
- A broadsheet layout with hairline rules and dense columns

### 2. No purple gradients
Do NOT use purple/violet gradients. This is the most overused "AI slop" visual. If you need color, pick something specific to the data or context — not the default gradient palette.

### 3. Ground it in the subject
Before designing, think about what the data or concept is about. Let the subject inform your choices:
- Financial data → greens, blues, clean sans-serif
- Creative work → warmer tones, playful shapes
- Technical content → structured layouts, monospace accents
- Nature/environment → earth tones, organic shapes

### 4. Use transparent backgrounds
**Always use a TRANSPARENT background** by default so the visual blends into the chat theme. Do NOT add background rectangles, fills, or colors to the root SVG or HTML body unless the user explicitly asks for colored backgrounds.

### 5. Keep it clean and intentional
- Use whitespace generously — don't cram elements
- Pick 2-3 colors max (not counting grays) and use them deliberately
- Typography: choose one display face (for titles/metrics) and one body face
- Keep borders/subtle — use opacity, not heavy lines
- If you use numbered markers (01, 02, 03), only do so if the content is actually a sequential process
- Cut any decoration that does not serve the information

### 6. Type-specific guidance
- **SVG** (for charts/diagrams): use viewBox for scaling, include axis labels, pick distinct but harmonious bar/line colors
- **HTML** (for cards/dashboards): use flexbox/grid, subtle box-shadows, rounded corners (8-12px), light borders
- Font sizes: 14-16px body, 20-32px headings/metrics
- Use responsive widths (100%) and auto height`,

  inputSchema: z.object({
    type: z
      .enum(["svg", "html"])
      .describe(
        'The format of the visual content. Use "svg" for charts, diagrams, graphs, and 2D graphics. Use "html" for rich cards, dashboards, stats panels, and layout-heavy content.',
      ),
    title: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "A short, descriptive title for the visual. This appears as a header above the rendered content.",
      ),
    content: z
      .string()
      .min(1)
      .max(50_000)
      .describe(
        "The SVG or HTML markup to render. For SVG: include the <svg> tag with a viewBox attribute. For HTML: can be a full document, a fragment, or standalone elements. Keep backgrounds transparent unless the user requests otherwise.",
      ),
    options: z
      .object({
        width: z
          .string()
          .optional()
          .describe(
            "Optional CSS width value (e.g. '100%', '600px'). Defaults to '100%'.",
          ),
        height: z
          .string()
          .optional()
          .describe(
            "Optional CSS height value (e.g. 'auto', '400px'). Defaults to 'auto'.",
          ),
        caption: z
          .string()
          .max(300)
          .optional()
          .describe(
            "Optional caption or footnote displayed below the visual.",
          ),
      })
      .optional()
      .describe("Optional display options for the visual."),
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
      note: "Visual rendered with transparent background. Use get_tool_help({ topic: 'create-visual' }) for design guidelines.",
    };

    return truncateToolResult(result);
  },
};
