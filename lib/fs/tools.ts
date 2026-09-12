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
    "List directory roots you can access (read/write per root). Roots you have no access to are omitted — never guess a rootId that isn't listed here. Call this first before accessing files.",
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
    "List files/directories inside a permitted root (or subdirectory), with sizes and types. Pass the numeric rootId from list_permitted_roots; leave relativePath empty to list the root itself.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID (from list_permitted_roots)"),
    relativePath: z
      .string()
      .optional()
      .describe("Optional subdirectory to browse; empty lists the root. Use forward slashes (/)."),
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
 * Supports either a chat upload URL, a bare session sandbox path
 * (e.g. `canvas/movie-db/style.css` — resolved against this conversation's
 * sandbox), or a root file path.
 */
export const readFileTool = {
  description:
    "Read a file's text content (max 100KB per read). Pass `url` for chat/session files, a bare `relativePath` (no rootId) for a session sandbox file like `canvas/movie-db/style.css`, or `rootId` + `relativePath` for directory files. Supports byte offset/limit pagination.",
  parameters: z
    .object({
      rootId: z
        .coerce.number()
        .int()
        .positive()
        .optional()
        .describe("Permitted root ID (omit if using `url` or a bare session `relativePath`)"),
      relativePath: z
        .string()
        .optional()
        .describe("Path within the root when combined with rootId, OR a bare session sandbox path (e.g. `canvas/movie-db/style.css`) when rootId is omitted"),
      url: z
        .string()
        .optional()
        .describe("Chat file URL (upload or session sandbox file). Use instead of rootId+relativePath for chat files."),
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
        .describe("Max bytes to read (max 102400, default: entire file)"),
    })
    .refine(
      (data) => {
        // url alone, rootId+relativePath, or a bare session relativePath are all valid
        if (data.url) return true;
        return Boolean(data.relativePath);
      },
      {
        message:
          "Either `url` (for chat file URLs), a bare `relativePath` (for a session sandbox file like `canvas/movie-db/style.css`), or both `rootId` and `relativePath` (for directory files) are required.",
      },
    ),
  execute: async ({
    rootId,
    relativePath,
    url,
    offset,
    limit,
    _conversationId,
  }: {
    rootId?: number;
    relativePath?: string;
    url?: string;
    offset?: number | null;
    limit?: number | null;
    _conversationId?: number;
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

    if (rootId) {
      if (!relativePath) {
        throw new Error(
          "`rootId` requires a `relativePath` — pass the path within the root.",
        );
      }
      await ensureRoots();
      const root = await getRootById(rootId);
      return await readFile(root, relativePath, offset, limit);
    }

    // Bare relativePath (no rootId, no url) → a file in THIS conversation's
    // session sandbox (e.g. a canvas file like canvas/movie-db/style.css).
    // The conversation id is injected by buildFilesystemTools.
    if (relativePath) {
      if (!_conversationId) {
        throw new Error(
          "A bare `relativePath` refers to a session sandbox file, but no conversation is available here. Pass the file's `url` (e.g. /api/chat/{id}/session-files/...) or both `rootId` and `relativePath` instead.",
        );
      }
      const { readSessionFile } = await import("@/lib/session-files/storage");
      return await readSessionFile(_conversationId, relativePath, offset, limit);
    }

    throw new Error(
      "Either `url` (for chat file URLs), a bare `relativePath` (for a session sandbox file like `canvas/movie-db/style.css`), or both `rootId` and `relativePath` (for directory files) are required.",
    );
  },
};

/**
 * Search for text content inside files.
 */
export const searchFilesTool = {
  description:
    "Search for text inside files within a permitted root (ripgrep when available). Optionally filter by glob pattern (e.g. '*.ts').",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID"),
    query: z.string().min(1).describe("Text to search for (case-insensitive)"),
    pattern: z
      .string()
      .optional()
      .describe("Optional glob filter (e.g. '*.ts', '*.md'); defaults to all files"),
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
    "Find files matching a glob pattern inside a permitted root (e.g. '**/*.ts', 'src/**/*').",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID"),
    pattern: z
      .string()
      .min(1)
      .describe("Glob pattern (e.g. '**/*.ts', '*.json', 'src/**/*')"),
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
    "Read a media file (image/video) and return a `dataUrl` (base64 pixels) you can examine. NOTE: chat-uploaded images are already visible to you natively — do NOT use this for those. Use for media in directory roots (rootId+relativePath), session sandbox files (bare `relativePath` like `canvas/movie-db/logo.png`, or `url`). Images: .jpg/.png/.gif/.webp/.svg/.avif; videos: .mp4/.webm/.mov/.avi/.mkv. Max 20MB.",
  parameters: z
    .object({
      rootId: z
        .coerce.number()
        .int()
        .positive()
        .optional()
        .describe("Permitted root ID (omit if using `url` or a bare session `relativePath`)"),
      relativePath: z
        .string()
        .optional()
        .describe("Path to the media file within the root when combined with rootId, OR a bare session sandbox path (e.g. `canvas/movie-db/logo.png`) when rootId is omitted"),
      url: z
        .string()
        .optional()
        .describe("Chat file URL (upload or session sandbox file). Use instead of rootId+relativePath for chat files."),
    })
    .refine(
      (data) => {
        // url alone, rootId+relativePath, or a bare session relativePath are all valid
        if (data.url) return true;
        return Boolean(data.relativePath);
      },
      {
        message:
          "Either `url` (for chat file URLs), a bare `relativePath` (for a session sandbox file like `canvas/movie-db/logo.png`), or both `rootId` and `relativePath` (for directory files) are required.",
      },
    ),
  execute: async ({
    rootId,
    relativePath,
    url,
    _conversationId,
  }: {
    rootId?: number;
    relativePath?: string;
    url?: string;
    _conversationId?: number;
  }) => {
    if (url) {
      // Read from chat file URL
      return await readMediaFromUrl(url);
    }
    if (rootId) {
      if (!relativePath) {
        throw new Error(
          "`rootId` requires a `relativePath` — pass the path within the root.",
        );
      }
      await ensureRoots();
      const root = await getRootById(rootId);
      return await readMedia(root, relativePath);
    }
    // Bare relativePath (no rootId, no url) → session sandbox file
    if (relativePath) {
      if (!_conversationId) {
        throw new Error(
          "A bare `relativePath` refers to a session sandbox file, but no conversation is available here. Pass the file's `url` (e.g. /api/chat/{id}/session-files/...) or both `rootId` and `relativePath` instead.",
        );
      }
      const { readSessionFileMedia } = await import("@/lib/session-files/storage");
      return await readSessionFileMedia(_conversationId, relativePath);
    }
    throw new Error(
      "Either `url` (for chat file URLs), a bare `relativePath` (for a session sandbox file like `canvas/movie-db/logo.png`), or both `rootId` and `relativePath` (for directory files) are required.",
    );
  },
};

/**
 * Create a new directory (folder) within a permitted root.
 */
export const createDirectoryTool = {
  description:
    "Create a directory within a permitted root (parent directories are created automatically). Rarely needed — write_file already creates parent dirs. Use only for empty folders the user explicitly wants.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID (must have write permission)"),
    relativePath: z
      .string()
      .describe("Path for the new directory within the root (forward slashes); creates missing parents"),
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
    "Rename or move a file/directory within the same permitted root. Destination parent directories are created automatically. Requires write permission.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID (must have write permission)"),
    sourceRelativePath: z
      .string()
      .describe("Current relative path (forward slashes)"),
    destRelativePath: z
      .string()
      .describe("New relative path (forward slashes); creates parent directories"),
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
    "⚠️ PERMANENTLY deletes a directory and ALL its contents (cannot be undone). Requires write permission. Only proceed if you are certain the user wants this — if in doubt, ask to confirm first.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID (must have write permission)"),
    relativePath: z
      .string()
      .describe("Directory path to delete within the root (forward slashes); deletes everything inside it"),
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
    "Write content to a file within a permitted root. Creates parent directories automatically. Overwrites by default; use mode='append' to append.",
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe("Permitted root ID (must have write permission)"),
    relativePath: z.string().describe("File path within the root (forward slashes)"),
    content: z.string().describe("Text content to write"),
    mode: z
      .enum(["overwrite", "append"])
      .optional()
      .describe("'overwrite' replaces (default), 'append' appends"),
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
    "Edit a file without rewriting it. `old_str` must appear exactly once in the file; if it appears 0 or multiple times the result includes current content to retry with a more specific anchor. Empty `new_str` deletes the match. Use for existing files (write_file for new ones).",
  parameters: z.object({
    rootId: z.coerce.number().int().positive().describe("Permitted writable root ID"),
    relativePath: z.string().describe("Path within the root (forward slashes)"),
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
 *
 * When a `conversationId` is provided, URL-based read tools (read_file,
 * read_media) get the conversation id injected into their args so a bare
 * session-relative path (e.g. `canvas/movie-db/style.css`) can be resolved
 * against THIS conversation's sandbox.
 */
export async function buildFilesystemTools(
  conversationId?: number,
): Promise<Record<string, any>> {
  const roots = await getPermittedRoots();

  // Inject the conversation id so bare session-relative paths resolve inside
  // the right sandbox. Mirrors buildMediaTools' withConversation pattern.
  const withConversation = <T extends {
    description: string;
    parameters: any;
    execute: (...args: any[]) => any;
  }>(tool: T): T =>
    conversationId
      ? {
          ...tool,
          execute: (args: Record<string, unknown>) =>
            tool.execute({ ...args, _conversationId: conversationId }),
        }
      : tool;

  const tools: Record<string, any> = {
    list_permitted_roots: withTruncation(listPermittedRootsTool),
  };

  // read_file is always included because it now supports URL-based usage
  tools.read_file = withTruncation(withConversation(readFileTool));

  // Only expose root-dependent tools if at least one root is configured
  if (roots.length > 0) {
    tools.list_directory = withTruncation(listDirectoryTool);
    // read_media intentionally skips truncation — the AI needs the full base64
    // dataUrl to examine image content. Truncation would produce an invalid
    // data URL that neither the AI nor the UI can render.
    tools.read_media = withConversation(readMediaTool);
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
