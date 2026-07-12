import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import {
  getPermittedRoots,
  getRootById,
  listDirectory,
  readFile,
  readMedia,
  searchFiles,
  globFiles,
  writeFile,
  type PermittedRoot,
} from "./access";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function ensureRoots(): Promise<PermittedRoot[]> {
  const roots = await getPermittedRoots();
  if (roots.length === 0) {
    throw new Error(
      "No directories configured. Add a directory in Settings > Directories first.",
    );
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Tool definitions (plain objects — compatible with any AI SDK version)
// ---------------------------------------------------------------------------

/**
 * List all configured directory roots the AI can access, with permissions.
 */
export const listPermittedRootsTool = {
  description:
    "List all directory roots the user has granted access to, along with read/write permissions for each. Use this first to discover available roots before accessing files.",
  parameters: z.object({}),
  execute: async () => {
    const roots = await getPermittedRoots();
    return roots.map((r) => ({
      id: r.id,
      label: r.label,
      path: r.path,
      canRead: r.canRead,
      canWrite: r.canWrite,
    }));
  },
};

/**
 * List files and directories inside a root (or a subdirectory within it).
 */
export const listDirectoryTool = {
  description:
    "List files and directories inside a permitted root directory (or subdirectory). Returns entries sorted with directories first, then alphabetically, with file sizes and types.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory (use list_permitted_roots to discover)"),
    relativePath: z
      .string()
      .optional()
      .describe(
        "Optional relative path within the root. Leave empty to list the root itself. Use forward slashes (/) even on Windows.",
      ),
  }),
  execute: async ({
    rootId,
    relativePath,
  }: {
    rootId: number;
    relativePath?: string | null;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    const entries = await listDirectory(root, relativePath);
    return {
      root: root.label,
      rootId,
      path: relativePath || "/",
      entries,
    };
  },
};

/**
 * Read a file's text content with optional pagination.
 */
export const readFileTool = {
  description:
    "Read the text content of a file within a permitted root. Supports optional offset and limit for partial reads (useful for large files). Max 100KB per read.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory"),
    relativePath: z.string().describe("Relative path to the file within the root (use forward slashes even on Windows)"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Byte offset to start reading from (default: 0)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(102400)
      .optional()
      .describe("Maximum number of bytes to read (max 102400, default: entire file)"),
  }),
  execute: async ({
    rootId,
    relativePath,
    offset,
    limit,
  }: {
    rootId: number;
    relativePath: string;
    offset?: number | null;
    limit?: number | null;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    return await readFile(root, relativePath, offset, limit);
  },
};

/**
 * Search for text content inside files.
 */
export const searchFilesTool = {
  description:
    "Search for a text string inside files within a permitted root. Uses ripgrep if available (much faster), otherwise falls back to a Node.js line-by-line search. Optionally filter by glob pattern.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory"),
    query: z.string().min(1).describe("Text to search for (case-insensitive)"),
    pattern: z
      .string()
      .optional()
      .describe(
        "Optional glob pattern to filter files (e.g. '*.ts', '*.md'). Defaults to all files.",
      ),
  }),
  execute: async ({
    rootId,
    query,
    pattern,
  }: {
    rootId: number;
    query: string;
    pattern?: string | null;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    return await searchFiles(root, query, pattern);
  },
};

/**
 * Match files by glob pattern.
 */
export const globFilesTool = {
  description:
    "Find files matching a glob pattern inside a permitted root. Use this to discover files by name or extension (e.g. '**/*.ts', '*.md', 'docs/**/*').",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory"),
    pattern: z
      .string()
      .min(1)
      .describe("Glob pattern to match files against (e.g. '**/*.ts', '*.json', 'src/**/*')"),
  }),
  execute: async ({ rootId, pattern }: { rootId: number; pattern: string }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    return await globFiles(root, pattern);
  },
};

/**
 * Read a media file (image or video) and return metadata, a server URL
 * (for the UI), and optionally a small base64 data URL (for the model
 * to "see" the content of small images).
 */
export const readMediaTool = {
  description:
    "Read an image or video file and examine its content. The result has a `dataUrl` field (a base64 data URL you can look at to see the image) for images up to 128 KB. For larger images and all videos, `dataUrl` is absent and only `url` + metadata are returned. **If `dataUrl` is present, look at it and describe the image content. If `dataUrl` is absent, tell the user the file details (filename, type, size) and that it's too large to inline — offer to help with it in other ways. Always continue with a text response.** Supported formats: images (.jpg, .png, .gif, .webp, .svg, .avif) and videos (.mp4, .webm, .mov, .avi, .mkv). Max file size: 20 MB.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory"),
    relativePath: z
      .string()
      .describe("Relative path to the media file within the root (use forward slashes even on Windows)"),
  }),
  execute: async ({
    rootId,
    relativePath,
  }: {
    rootId: number;
    relativePath: string;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    return await readMedia(root, relativePath);
  },
};

/**
 * Write content to a file (creates or overwrites by default).
 */
export const writeFileTool = {
  description:
    "Write content to a file within a permitted root. Creates parent directories if needed. By default overwrites the file; use mode='append' to append instead.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory (must have write permission)"),
    relativePath: z.string().describe("Relative path to the file within the root (use forward slashes even on Windows)"),
    content: z.string().describe("Text content to write to the file"),
    mode: z
      .enum(["overwrite", "append"])
      .optional()
      .describe(
        "Write mode: 'overwrite' replaces the file (default), 'append' appends to it.",
      ),
  }),
  execute: async ({
    rootId,
    relativePath,
    content,
    mode,
  }: {
    rootId: number;
    relativePath: string;
    content: string;
    mode?: "overwrite" | "append" | null;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    return await writeFile(root, relativePath, content, mode ?? "overwrite");
  },
};

// ---------------------------------------------------------------------------
// Result truncation wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a tool definition's `execute` function so its return value is
 * automatically truncated if it exceeds {@link MAX_RESULT_CHARS}. This
 * prevents any single tool result from flooding the model's context window.
 */
function withTruncation(tool: {
  description: string;
  parameters: any;
  execute: (...args: any[]) => any;
}): typeof tool {
  const originalExecute = tool.execute;
  return {
    description: tool.description,
    parameters: tool.parameters,
    execute: async (...args: any[]) => {
      const result = await originalExecute(...args);
      return truncateToolResult(result);
    },
  };
}

// ---------------------------------------------------------------------------
// Combined tool set builder
// ---------------------------------------------------------------------------

/**
 * Build the filesystem tool set from the current DB configuration.
 * `list_permitted_roots` is always included so the model can discover
 * available roots (or find out none are configured).
 */
export async function buildFilesystemTools(): Promise<Record<string, any>> {
  const roots = await getPermittedRoots();

  const tools: Record<string, any> = {
    list_permitted_roots: withTruncation(listPermittedRootsTool),
  };

  // Only expose the rest if at least one root is configured
  if (roots.length > 0) {
    tools.list_directory = withTruncation(listDirectoryTool);
    tools.read_file = withTruncation(readFileTool);
    tools.read_media = withTruncation(readMediaTool);
    tools.search_files = withTruncation(searchFilesTool);
    tools.glob_files = withTruncation(globFilesTool);
    tools.write_file = withTruncation(writeFileTool);
  }

  return tools;
}
