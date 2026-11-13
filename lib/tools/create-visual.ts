import { z } from "zod";
import { apiUsageVisual } from "@/lib/chat/api-usage-visual";
import { interactiveVisualSchema, parseInteractiveVisual } from "@/lib/chat/interactive-visual";
import { hasNegativeSvgRectSize, normalizeVisualSvg } from "@/lib/chat/visual-svg";
import { db } from "@/db";
import { toolConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";

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
// Tool definition
// ---------------------------------------------------------------------------

const barDataSchema = z.array(z.object({
  label: z.string().trim().min(1).max(120),
  value: z.number().finite(),
})).min(1).max(40);

const visualInputSchema = z.object({
  type: z
    .enum(["bar", "svg", "html", "interactive"])
    .describe('Use "bar" for bar charts, "svg" for custom diagrams, or "html" for cards and dashboards'),
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Short descriptive title for the visual"),
  content: z
    .string()
    .min(1)
    .max(50_000)
    .optional()
    .describe("Required for SVG and HTML. For SVG include the <svg> tag with viewBox. Keep backgrounds transparent unless the user requests otherwise."),
  data: barDataSchema.optional().describe("Required for bar charts. Supply rows in display order, including any zero values."),
  spec: interactiveVisualSchema.optional().describe("Version 1 interactive widget specification. Use either spec or preset with type interactive."),
  preset: z.literal("api_usage").optional().describe("Use for the sample API Usage Dashboard with two sliders and 7/30-day forecasts."),
  options: z
    .object({
      width: z
        .string()
        .optional()
        .describe("CSS width (e.g. '100%', '600px'). Default '100%'"),
      height: z
        .string()
        .optional()
        .describe("Initial CSS height for HTML visuals. Default 'auto'"),
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
});

type VisualInput = z.infer<typeof visualInputSchema>;

export const createVisualTool = {
  description: `Create a visual and render it inline in chat. Use type "bar" for comparisons across categories or periods, including counts by year. Pass data as ordered {label, value} rows. RemiAI renders bars, labels, and values automatically. Use type "interactive" for native widgets, calculators, charts with live controls, maps, media, and comparison tables. Use preset "api_usage" for the sample API Usage Dashboard. For other requests use spec.version = 1 and ordered spec.blocks. Define controls once, then include their IDs in controls blocks where they should appear. In calculations, a and b are numbers or IDs of numeric controls or earlier calculations. For round, b is the number of decimal places. In text lines and descriptions use {id} to interpolate a control or calculated result. In metrics and chart points use IDs directly in numeric fields. The UI evaluates these bindings locally. Use SVG for custom diagrams and HTML for static markup.

## Design rules — NO AI SLOP
- **Never** use purple/violet gradients; avoid the overused AI looks (cream+serif+terracotta, near-black+acid green, broadsheet hairline columns) unless the brief demands them.
- Ground colors in the subject: financial → greens/blues; technical → structured/monospace; nature → earth tones.
- **Always transparent background** — no fills on the root SVG/HTML body. Use chat theme vars when needed: \`var(--chat-bg)\`, \`var(--chat-fg)\`, \`var(--chat-muted)\`, \`var(--chat-border)\`, \`var(--chat-primary)\`.
- Clean and intentional: whitespace, 2-3 colors max, subtle borders, 8-12px radius.
- SVG: use viewBox, include axis labels. HTML: flexbox/grid, subtle shadows. Fonts: 14-16px body, 20-32px headings. Responsive width 100%.`,

  inputSchema: visualInputSchema,

  execute: async ({
    type,
    title,
    content,
    options,
    data,
    spec,
    preset,
  }: VisualInput) => {
    const display = {
      type: "visual" as const,
      title,
      width: options?.width ?? "100%",
      height: options?.height ?? "auto",
      caption: options?.caption ?? null,
      align: options?.align ?? "center",
    };

    if (type === "interactive") {
      if (Boolean(spec) === Boolean(preset)) return { error: "Supply exactly one interactive spec or preset." };
      const parsed = parseInteractiveVisual(preset ? apiUsageVisual : spec);
      if ("error" in parsed) return { error: parsed.error };
      return { ...display, visualType: type, spec: parsed.spec };
    }

    if (type === "bar") {
      const rows = barDataSchema.safeParse(data);
      if (!rows.success) return { error: "A bar chart requires 1–40 data rows with nonempty labels and finite numeric values." };
      return { ...display, visualType: type, data: rows.data };
    }

    if (!content?.trim()) return { error: "SVG and HTML visuals require markup in content." };
    const finalContent = type === "svg" ? normalizeVisualSvg(content) : wrapHtml(content);
    if (finalContent === null) {
      return { error: "The SVG markup is incomplete or invalid. Retry with a complete, well-formed <svg> document." };
    }
    if (type === "svg" && hasNegativeSvgRectSize(finalContent)) {
      return { error: 'SVG rectangles require nonnegative width and height. For a bar chart, retry with type "bar" and ordered data rows.' };
    }

    // Content is already bounded by the tool schema. Truncating XML or HTML
    // here would break the artifact that the chat renders and persists.
    return { ...display, visualType: type, content: finalContent };
  },
};

// ---------------------------------------------------------------------------
// Builder function for the chat route
// ---------------------------------------------------------------------------

/**
 * Build the create_visual tool. Respects the user's toggle setting in DB.
 * Enabled by default for backward compatibility (was previously always-on).
 */
export async function buildCreateVisualTool(): Promise<{ create_visual?: typeof createVisualTool }> {
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
