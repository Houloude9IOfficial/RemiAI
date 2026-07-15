import { z } from "zod";
import fs from "node:fs/promises";
import { truncateToolResult } from "@/lib/utils";
import {
  getPermittedRoots,
  getRootById,
  listDirectory,
  readFile,
  readMedia,
  readMediaFromUrl,
  resolveUploadUrl,
  searchFiles,
  globFiles,
  writeFile,
  createDirectory,
  deleteDirectory,
  renameItem,
  type PermittedRoot,
} from "./access";
import { indexFile, removeFromIndex } from "./file-index";

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
 * Supports either a chat upload URL or a root file path.
 */
export const readFileTool = {
  description:
    "Read the text content of a file. Supports either a chat upload URL or a root file path. Max 100KB per read.\n\n**Two calling conventions:**\n1. Pass `url` for chat-uploaded files (e.g. /api/chat/uploads/123/notes.txt) — no directory root needed.\n2. Pass `rootId` + `relativePath` for files in configured directories.",
  parameters: z
    .object({
      rootId: z
        .coerce.number()
        .int()
        .positive()
        .optional()
        .describe("ID of the permitted root directory (leave empty if using `url`)"),
      relativePath: z
        .string()
        .optional()
        .describe(
          "Relative path to the file within the root (leave empty if using `url`)",
        ),
      url: z
        .string()
        .optional()
        .describe(
          "Upload URL for a file the user attached via the chat input (e.g. `/api/chat/uploads/123/notes.txt`). Use this instead of rootId + relativePath for uploaded files.",
        ),
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
        .describe(
          "Maximum number of bytes to read (max 102400, default: entire file)",
        ),
    })
    .refine(
      (data) => {
        if (data.url) return true;
        return Boolean(data.rootId && data.relativePath);
      },
      {
        message:
          "Either `url` (for uploaded files) or both `rootId` and `relativePath` (for directory files) are required.",
      },
    ),
  execute: async ({
    rootId,
    relativePath,
    url,
    offset,
    limit,
  }: {
    rootId?: number;
    relativePath?: string;
    url?: string;
    offset?: number | null;
    limit?: number | null;
  }) => {
    if (url) {
      // Read from chat upload URL
      const { filename, resolvedPath } = await resolveUploadUrl(url);
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`File not found: "${filename}"`);
      }

      const effectiveOffset = offset ?? 0;
      const effectiveLimit = limit ?? stats.size;
      const bytesRemaining = Math.max(0, stats.size - effectiveOffset);
      const readLength = Math.min(effectiveLimit, bytesRemaining);
      const buffer = Buffer.alloc(readLength);
      const fd = await fs.open(resolvedPath, "r");
      try {
        const { bytesRead } = await fd.read(
          buffer,
          0,
          buffer.length,
          effectiveOffset,
        );
        return {
          content: buffer.toString("utf-8", 0, bytesRead),
          totalBytes: stats.size,
          offset: effectiveOffset,
          limit: effectiveLimit,
          isTruncated: bytesRead < bytesRemaining,
        };
      } finally {
        await fd.close();
      }
    }

    if (!rootId || !relativePath) {
      throw new Error(
        "Either `url` (for uploaded files) or both `rootId` and `relativePath` (for directory files) are required.",
      );
    }
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
  parameters: z
    .object({
      rootId: z
        .coerce.number()
        .int()
        .positive()
        .optional()
        .describe("ID of the permitted root directory (leave empty if using `url`)"),
      relativePath: z
        .string()
        .optional()
        .describe(
          "Relative path to the media file within the root (leave empty if using `url`)",
        ),
      url: z
        .string()
        .optional()
        .describe(
          "Upload URL for a file the user attached via the chat input (e.g. `/api/chat/uploads/123/filename.png`). Use this instead of rootId + relativePath when the user sends you an image/file via markdown in their message.",
        ),
    })
    .refine(
      (data) => {
        // Must provide either `url` OR both `rootId`+`relativePath`
        if (data.url) return true;
        return Boolean(data.rootId && data.relativePath);
      },
      {
        message:
          "Either `url` (for uploaded files) or both `rootId` and `relativePath` (for directory files) are required.",
      },
    ),
  execute: async ({
    rootId,
    relativePath,
    url,
  }: {
    rootId?: number;
    relativePath?: string;
    url?: string;
  }) => {
    if (url) {
      // Read from chat upload URL
      return await readMediaFromUrl(url);
    }
    if (!rootId || !relativePath) {
      throw new Error(
        "Either `url` (for uploaded files) or both `rootId` and `relativePath` (for directory files) are required.",
      );
    }
    await ensureRoots();
    const root = await getRootById(rootId);
    return await readMedia(root, relativePath);
  },
};

/**
 * Create a new directory (folder) within a permitted root.
 */
export const createDirectoryTool = {
  description:
    "Create one or more directories (folders) at the specified path within a permitted root. Creates parent directories automatically if they don't exist. Requires write permission on the root. Use this to organise files into folders or create project structures.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory (must have write permission)"),
    relativePath: z
      .string()
      .describe(
        "Relative path for the new directory within the root (use forward slashes even on Windows). Creates any missing parent directories automatically.",
      ),
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
    return await createDirectory(root, relativePath);
  },
};

/**
 * Rename or move a file or directory within a permitted root.
 */
export const renameItemTool = {
  description:
    "Rename or move a file or directory to a new location within the same permitted root. Works for both files and directories. For example, you can rename a file, move a file into a subfolder, or rename a directory. Requires write permission on the root. The destination parent directory is created automatically if it doesn't exist. This operation is reversible (you can rename it back).",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory (must have write permission)"),
    sourceRelativePath: z
      .string()
      .describe(
        "Current relative path of the file or directory within the root (use forward slashes even on Windows)",
      ),
    destRelativePath: z
      .string()
      .describe(
        "New relative path for the file or directory within the root (use forward slashes even on Windows). Parent directories are created automatically.",
      ),
  }),
  execute: async ({
    rootId,
    sourceRelativePath,
    destRelativePath,
  }: {
    rootId: number;
    sourceRelativePath: string;
    destRelativePath: string;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    const result = await renameItem(root, sourceRelativePath, destRelativePath);
    // Update file index: remove old path, index new path
    removeFromIndex(rootId, sourceRelativePath).catch(() => {});
    indexFile(rootId, destRelativePath, result.newPath).catch((err) =>
      console.error("[fs-tools] Failed to index renamed file:", err),
    );
    return result;
  },
};

/**
 * Delete a directory and all its contents within a permitted root.
 */
export const deleteDirectoryTool = {
  description:
    "⚠️ WARNING: This permanently deletes a directory and ALL of its contents (files, subdirectories, everything) within a permitted root. This action CANNOT be undone — the data is gone forever. Requires write permission on the root. ONLY proceed if you are absolutely certain the user wants to delete this directory and everything inside it. If you have ANY doubt, ask the user to confirm first before proceeding.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("ID of the permitted root directory (must have write permission)"),
    relativePath: z
      .string()
      .describe(
        "Relative path to the directory to delete within the root (use forward slashes even on Windows). This deletes the directory and everything inside it permanently.",
      ),
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
    return await deleteDirectory(root, relativePath);
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
    const result = await writeFile(root, relativePath, content, mode ?? "overwrite");
    // Auto-index the written file so the file index is immediately updated
    indexFile(rootId, relativePath, result.path).catch((err) =>
      console.error("[fs-tools] Failed to index written file:", err),
    );
    return result;
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

  // read_file is always included because it now supports URL-based usage
  tools.read_file = withTruncation(readFileTool);

  // Only expose root-dependent tools if at least one root is configured
  if (roots.length > 0) {
    tools.list_directory = withTruncation(listDirectoryTool);
    tools.read_media = withTruncation(readMediaTool);
    tools.search_files = withTruncation(searchFilesTool);
    tools.glob_files = withTruncation(globFilesTool);
    tools.write_file = withTruncation(writeFileTool);
    tools.create_directory = withTruncation(createDirectoryTool);
    tools.delete_directory = withTruncation(deleteDirectoryTool);
    tools.rename_item = withTruncation(renameItemTool);
  }

  return tools;
}
