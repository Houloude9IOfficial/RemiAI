import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import {
  createCanvas,
  getCanvas,
  listCanvases,
  normalizeCanvasPath,
  type CanvasInfo,
} from "./storage";

/**
 * Canvas tools — let the AI establish a named, self-contained multi-file web
 * project (index.html + style.css + script.js + assets) and open it in the
 * interactive canvas panel (live preview + code editor).
 *
 * The project's files themselves are written with the existing session file
 * tools (session_file_write / session_file_edit / session_file_mkdir)
 * automatically scoped under canvas/{slug}/. canvas_create establishes the
 * project + writes a starter entry file; canvas_open presents it in the panel;
 * canvas_add_file scaffolds a sibling file so the AI can then fill it.
 */

const canvasRefSchema = z
  .string()
  .min(1)
  .max(120)
  .describe("Canvas name or slug to create (for canvas_create) or open (for canvas_open)");

export interface BuildCanvasToolsOptions {
  conversationId: number;
  sourceRunId?: string;
}

/** Compact serialisation of a canvas for the model + present card. */
function toModelCanvas(info: CanvasInfo) {
  return {
    type: "canvas" as const,
    slug: info.slug,
    name: info.name,
    description: info.description,
    entryFile: info.entryFile,
    fileCount: info.files.filter((f) => f.isFile).length,
    files: info.files.map((f) => ({
      path: f.path,
      name: f.name,
      isDirectory: f.isDirectory,
      size: f.isDirectory ? null : f.size,
    })),
  };
}

export function buildCanvasTools(opts: BuildCanvasToolsOptions) {
  const { conversationId } = opts;

  return {
    canvas_create: {
      description:
        "Create a new interactive canvas — a self-contained multi-file web project (HTML/CSS/JS) that opens in a live-preview + code-editor panel the user can run and edit. " +
        "Use for buildable, interactive deliverables: websites, small apps, calculators, games, dashboards, interactive docs, prototypes. " +
        "This establishes the project (starter HTML entry file + manifest). The actual content (index.html, style.css, script.js, assets) is then written " +
        "with session_file_write / session_file_edit using paths under the canvas/{slug}/... prefix. " +
        "After writing the files, call the canvas_open tool to present it in the panel.",
      inputSchema: z.object({
        name: canvasRefSchema.describe("User-visible name for the canvas (also becomes its folder slug under canvas/)."),
        description: z
          .string()
          .max(300)
          .optional()
          .describe("Short description of what the canvas is/does."),
        entryFile: z
          .string()
          .max(200)
          .optional()
          .describe("Entry file relative path (default: index.html)."),
      }),
      execute: async ({
        name,
        description,
        entryFile,
      }: {
        name: string;
        description?: string;
        entryFile?: string;
      }) => {
        const info = await createCanvas(conversationId, {
          name,
          description,
          entryFile,
        });
        return truncateToolResult({
          ...toModelCanvas(info),
          message: `Created canvas "${info.name}".`,
          note:
            "Write the project files with session_file_write / session_file_edit under the canvas/" +
            info.slug +
            "/ prefix (e.g. canvas/" +
            info.slug +
            "/index.html, canvas/" +
            info.slug +
            "/style.css, canvas/" +
            info.slug +
            "/script.js). Then call canvas_open to present it in the panel.",
        });
      },
    },

    canvas_add_file: {
      description:
        "Scaffold a new (likely empty) file inside an existing canvas project under canvas/{slug}/. " +
        "Creates the file if it doesn't exist (parents included) so you can then fill it with session_file_edit. " +
        "Usually unnecessary — session_file_write creates files directly. Use when you want to establish a placeholder " +
        "the user expects (e.g. style.css, script.js) before writing it.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Canvas slug (the folder name under canvas/)."),
        name: z.string().min(1).describe("File name relative to the canvas root, e.g. style.css."),
      }),
      execute: async ({ slug, name }: { slug: string; name: string }) => {
        const info = await getCanvas(conversationId, slug);
        if (!info) {
          return truncateToolResult({ error: `No canvas found for "${slug}". Call canvas_create first.` });
        }
        const path = normalizeCanvasPath(info.slug, name);
        return truncateToolResult({ slug, path, created: true });
      },
    },

    canvas_list: {
      description:
        "List every canvas project in this conversation: name, slug, entry file, and file count. " +
        "Use to find an existing canvas to iterate on before canvas_open.",
      inputSchema: z.object({}),
      execute: async () => {
        const canvases = await listCanvases(conversationId);
        return truncateToolResult({
          count: canvases.length,
          canvases: canvases.map((c) => ({
            slug: c.slug,
            name: c.name,
            description: c.description,
            entryFile: c.entryFile,
            fileCount: c.files.filter((f) => f.isFile).length,
          })),
        });
      },
    },

    canvas_open: {
      description:
        "Open an existing canvas in the interactive panel (live preview + code editor). " +
        "Call AFTER creating a canvas and writing its files with session_file_* under canvas/{slug}/. " +
        "Pass the canvas slug or name. The panel opens with the entry file previewed; the user can edit code and re-run.",
      inputSchema: z.object({
        slug: canvasRefSchema.describe("Canvas slug or name to open."),
      }),
      execute: async ({ slug }: { slug: string }) => {
        const info = await getCanvas(conversationId, slug);
        if (!info) {
          return truncateToolResult({
            error: `No canvas found for "${slug}".`,
            available: (await listCanvases(conversationId)).map((c) => c.slug),
          });
        }
        return truncateToolResult({
          ...toModelCanvas(info),
          message: `Opened canvas "${info.name}" in the panel.`,
        });
      },
    },
  };
}

// Re-export so callers can reference the slug helper without importing storage.
export { slugify } from "./storage";