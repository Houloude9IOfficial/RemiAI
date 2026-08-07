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
  editFile,
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
 * List all configured directory roots the AI can actually access, with permissions.
 *
 * Roots where BOTH `canRead` and `canWrite` are false are fully locked and are
 * deliberately OMITTED — the AI must not attempt to access directories it has
 * no permission for. Only roots the AI has at least some access to are listed.
 */
export const listPermittedRootsTool = {
  description:
    "List all directory roots you can access, with read/write permissions for each. Only roots you have at least read or write access to are returned — roots you have NO access to are intentionally omitted, so never guess or attempt to use a rootId that is not listed here. Use this first to discover available roots before accessing files.",
  parameters: z.object({}),
  execute: async () => {
    const roots = await getPermittedRoots();
    // Filter out fully-locked roots (no read AND no write access): listing them
    // only invites the model to attempt calls that are guaranteed to be denied.
    return roots
      .filter((r) => r.canRead || r.canWrite)
      .map((r) => ({
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
    "List files and directories inside a permitted root directory (or subdirectory). Returns entries sorted with directories first, then alphabetically, with file sizes and types.\n\n**Workflow:** Call `list_permitted_roots` first to discover available rootIds, then pass the numeric rootId here to browse its contents. Leave relativePath empty to list the root itself. Pass a relativePath to browse a subdirectory.\n\n**Only use rootIds returned by `list_permitted_roots`** — roots you have no access to are not listed there, and attempting them will fail with an access-denied error.",
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
    "Read the text content of a file. Supports a chat file URL or a root file path. Max 100KB per read.\n\n**Calling conventions:**\n1. Pass `url` for chat file URLs — user uploads (e.g. /api/chat/uploads/123/notes.txt) or session sandbox files (e.g. /api/chat/5/session-files/src/app.js) — no directory root needed.\n2. Pass `rootId` + `relativePath` for files in configured directories.",
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
          "Chat file URL — a user upload (e.g. `/api/chat/uploads/123/notes.txt`) or a session sandbox file (e.g. `/api/chat/5/session-files/notes.txt`). Use this instead of rootId + relativePath for files tied to the chat.",
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
          "Either `url` (for chat file URLs) or both `rootId` and `relativePath` (for directory files) are required.",
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
      // Read from chat file URL
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
    "Search for a text string inside files within a permitted root. Uses ripgrep if available (much faster), otherwise falls back to a Node.js line-by-line search. Optionally filter by glob pattern.\n\n**Workflow:** Call `list_permitted_roots` first for the rootId, then search with your query. Use the pattern parameter to narrow by file extension (e.g. \"*.ts\", \"*.md\").",
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
    "Read a media file and return a `dataUrl` (base64 pixels) you can examine. **NOTE: Chat-uploaded images are ALREADY visible to you natively via your vision encoder — do NOT use this tool for those.** Use this tool for: media in configured directory roots (`rootId` + `relativePath`), session sandbox files via URL (e.g. `/api/chat/5/session-files/assets/earth.jpg`), or video metadata from chat uploads. For sandbox images, `session_file_read_media` is the more direct option. Supported formats: images (.jpg, .png, .gif, .webp, .svg, .avif) and videos (.mp4, .webm, .mov, .avi, .mkv). Max file size: 20 MB.",
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
          "Chat file URL — a user upload (e.g. `/api/chat/uploads/123/filename.png`) or a session sandbox file (e.g. `/api/chat/5/session-files/assets/earth.jpg`). Use this instead of rootId + relativePath for files tied to the chat. For sandbox images you can also use `session_file_read_media`.",
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
          "Either `url` (for chat file URLs) or both `rootId` and `relativePath` (for directory files) are required.",
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
      // Read from chat file URL
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
    "Create one or more directories (folders) at the specified path within a permitted root. Creates parent directories automatically if they don't exist. Requires write permission on the root.\n\n**Note:** Most of the time you don't need this — `write_file` already creates parent directories automatically. Only use `create_directory` when the user explicitly asks for an empty folder that won't have files written to it yet.",
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
    "Write content to a file within a permitted root. **Creates parent directories automatically** — no need to call create_directory first. By default overwrites the file; use mode='append' to append instead.\n\n**Workflow:** Call `list_permitted_roots` to get the rootId, then write files directly. write_file handles all directory creation automatically.",
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
    // Keep result deliberately compact. The model can call read_file when it
    // actually needs content; echoing it here wastes context on every write.
    return {
      bytesChanged: result.wrote,
      path: result.relativePath,
      created: result.created,
      linesAdded: result.linesAdded,
      linesRemoved: result.linesRemoved,
      createdDirectories: result.createdDirectories,
    };
  },
};

/** Make a targeted, uniquely anchored edit to a permitted-root file. */
export const editFileTool = {
  description:
    "Edit a file without rewriting it. `old_str` must appear exactly once in the current file; if it appears zero or multiple times, the result includes the current content so you can retry with a more specific anchor. Set `new_str` to an empty string to delete the matched text. Use this for changes to existing files; use write_file to create a new file.",
  parameters: z.object({
    rootId: z.coerce.number().int().positive().describe("ID of the permitted writable root"),
    relativePath: z.string().describe("Path within the root, using forward slashes"),
    old_str: z.string().describe("Exact, uniquely occurring text to replace"),
    new_str: z.string().describe("Replacement text; empty string deletes the match"),
  }),
  execute: async ({ rootId, relativePath, old_str, new_str }: {
    rootId: number; relativePath: string; old_str: string; new_str: string;
  }) => {
    await ensureRoots();
    const root = await getRootById(rootId);
    const result = await editFile(root, relativePath, old_str, new_str);
    if ("relativePath" in result) {
      indexFile(rootId, relativePath, result.path).catch((err) =>
        console.error("[fs-tools] Failed to index edited file:", err),
      );
      return {
        path: result.relativePath,
        bytesChanged: result.bytesChanged,
        linesAdded: result.linesAdded,
        linesRemoved: result.linesRemoved,
      };
    }
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
    // read_media intentionally skips truncation — the AI needs the full base64
    // dataUrl to examine image content. Truncation would produce an invalid
    // data URL that neither the AI nor the UI can render.
    tools.read_media = readMediaTool;
    tools.search_files = withTruncation(searchFilesTool);
    tools.glob_files = withTruncation(globFilesTool);
    tools.write_file = withTruncation(writeFileTool);
    tools.edit_file = withTruncation(editFileTool);
    tools.create_directory = withTruncation(createDirectoryTool);
    tools.delete_directory = withTruncation(deleteDirectoryTool);
    tools.rename_item = withTruncation(renameItemTool);
  }

  return tools;
}
