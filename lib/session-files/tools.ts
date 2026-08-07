import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import {
  listSessionFiles,
  readSessionFile,
  readSessionFileMedia,
  writeSessionFile,
  editSessionFile,
  deleteSessionFile,
  createSessionFolder,
  moveSessionFile,
  buildSessionFileUrl,
  type SessionFileEntry,
} from "./storage";

// ---------------------------------------------------------------------------
// Session files tools — a private, per-conversation file sandbox
//
// Each conversation has its own sandbox directory. Files the AI creates
// here are shown to the user in a side panel and can be downloaded as a
// single .zip archive (e.g. a whole generated website).
//
// Every file in the sandbox also has a canonical URL of the form
//   /api/chat/{conversationId}/session-files/{path}
// which the AI can embed in markdown (e.g. ![img](/api/chat/5/session-files/img.png))
// or hand to URL-based tools (read_file, read_media, web_fetch, read_document).
//
// The shared schemas/descriptions below are reused by the builder, which
// binds every tool to the specific conversation's sandbox directory.
// ---------------------------------------------------------------------------

/**
 * Serialise an entry for the model (keep the payload compact) and include
 * the canonical URL so the AI can reference the file in the chat.
 */
function toModelEntry(e: SessionFileEntry, conversationId: number) {
  return {
    path: e.path,
    name: e.name,
    isDirectory: e.isDirectory,
    size: e.isDirectory ? null : e.size,
    url: e.isDirectory ? null : buildSessionFileUrl(conversationId, e.path),
  };
}

const sessionFileListSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Optional subdirectory to list (forward slashes); empty lists everything"),
});

const sessionFileReadSchema = z.object({
  path: z
    .string()
    .describe("Path to the file in the session sandbox (forward slashes)"),
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
    .max(1_000_000)
    .optional()
    .describe("Max bytes to read (max 1,000,000, default: 100,000)"),
});

const sessionFileReadMediaSchema = z.object({
  path: z.string().describe("Path to an image/video in the session sandbox (forward slashes)"),
});

const sessionFileDownloadSchema = z.object({
  path: z.string().describe("Path to the file the user should download (forward slashes)"),
});

const sessionFileWriteSchema = z.object({
  path: z
    .string()
    .describe("Path to the file in the session sandbox (forward slashes); creates parent folders automatically"),
  content: z.string().describe("Text content to write"),
  mode: z
    .enum(["overwrite", "append"])
    .optional()
    .describe("'overwrite' replaces (default), 'append' appends"),
});

const sessionFileEditSchema = z.object({
  path: z.string().describe("Path within the session sandbox (forward slashes)"),
  old_str: z.string().describe("Exact text that occurs exactly once in the file"),
  new_str: z.string().describe("Replacement text; empty string deletes the match"),
});

const sessionFileDeleteSchema = z.object({
  path: z
    .string()
    .describe("Path of the file or directory to delete in the session sandbox (forward slashes); deleting a directory removes everything inside it"),
});

const sessionFileMoveSchema = z.object({
  from: z.string().describe("Current path of the file/folder (forward slashes)"),
  to: z
    .string()
    .describe("New path (forward slashes); creates parent folders; fails if destination exists"),
});

const sessionFileMkdirSchema = z.object({
  path: z.string().describe("Path of the folder to create (forward slashes); creates missing parents"),
});

const sessionPresentFilesSchema = z.object({
  paths: z
    .array(z.string())
    .optional()
    .describe("Optional paths to highlight (defaults to all files)"),
  message: z
    .string()
    .max(500)
    .optional()
    .describe("Optional short note shown with the file panel"),
});

const sessionPresentFileSchema = z.object({
  path: z
    .string()
    .describe("Path of the file to open in the side panel viewer (forward slashes)"),
  message: z
    .string()
    .max(500)
    .optional()
    .describe("Optional short note shown with the file panel"),
});

// ---------------------------------------------------------------------------
// Builder — binds every tool to a conversation's sandbox
// ---------------------------------------------------------------------------

/**
 * Build the session file tool set for a conversation.
 * Every tool is bound to the conversation's own sandbox directory.
 */
export function buildSessionFileTools(
  conversationId: number,
): Record<string, any> {
  const sandbox = {
    list: (relPath: string | null) => listSessionFiles(conversationId, relPath),
    read: (relPath: string, offset?: number | null, limit?: number | null) =>
      readSessionFile(conversationId, relPath, offset, limit),
    readMedia: (relPath: string) => readSessionFileMedia(conversationId, relPath),
    write: (
      relPath: string,
      content: string,
      mode?: "overwrite" | "append" | null,
    ) => writeSessionFile(conversationId, relPath, content, mode),
    delete: (relPath: string) => deleteSessionFile(conversationId, relPath),
    mkdir: (relPath: string) => createSessionFolder(conversationId, relPath),
    move: (from: string, to: string) => moveSessionFile(conversationId, from, to),
    listAll: () => listSessionFiles(conversationId, null),
    url: (relPath: string) => buildSessionFileUrl(conversationId, relPath),
  };

  return {
    session_file_list: {
      description: `List files in this conversation's private session sandbox (files you or the user created for this chat). Returns paths, sizes, and file/directory flags. User uploads live under an "uploads/" folder. Each entry includes a 'url' (/api/chat/${conversationId}/session-files/{path}) you can embed in your reply or pass to URL-based tools. Pass an optional 'path' to list a subdirectory.`,
      parameters: sessionFileListSchema,
      execute: async ({ path: relPath }: { path?: string | null }) => {
        const entries = await sandbox.list(
          relPath && relPath.trim() ? relPath : null,
        );
        return truncateToolResult({
          root: relPath && relPath.trim() ? relPath : "/",
          count: entries.length,
          files: entries.map((e) => toModelEntry(e, conversationId)),
        });
      },
    },
    session_file_read: {
      description: `Read the text content of a file in this conversation's session sandbox. Supports byte offset/limit pagination for large files. For images/videos use session_file_read_media — this returns text only.`,
      parameters: sessionFileReadSchema,
      execute: async ({
        path: relPath,
        offset,
        limit,
      }: {
        path: string;
        offset?: number | null;
        limit?: number | null;
      }) => {
        const result = await sandbox.read(relPath, offset, limit);
        return truncateToolResult({ path: relPath, ...result });
      },
    },
    session_file_read_media: {
      description: `Read an image/video from the session sandbox so you can see it. Returns a base64 data URL of the pixels (plus the canonical 'url'). Supported: images (.jpg, .png, .gif, .webp, .svg, .avif), videos (.mp4, .webm, .mov, .avi, .mkv). Max 20MB.`,
      parameters: sessionFileReadMediaSchema,
      execute: async ({ path: relPath }: { path: string }) => {
        const result = await sandbox.readMedia(relPath);
        // Intentionally NOT truncated: clipping a base64 dataUrl mid-string
        // would produce an invalid image (same rule as the read_media tool).
        return {
          path: relPath,
          type: result.type,
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
          url: result.url,
          ...(result.dataUrl ? { dataUrl: result.dataUrl } : {}),
        };
      },
    },
    session_file_download: {
      description: `Get a download link for a single file in the session sandbox. Present the returned 'url' as a markdown link in your reply. (The whole sandbox can be downloaded as a .zip via session_present_files.)`,
      parameters: sessionFileDownloadSchema,
      execute: async ({ path: relPath }: { path: string }) => {
        // Verify the file exists before handing out the link
        const entries = await sandbox.listAll();
        const target = entries.find((e) => e.path === relPath && e.isFile);
        if (!target) {
          return truncateToolResult({
            error: `File not found in session sandbox: "${relPath}"`,
            availableFiles: entries.map((e) => e.path),
          });
        }
        return truncateToolResult({
          path: relPath,
          filename: target.name,
          size: target.size,
          url: `${sandbox.url(relPath)}?download=1`,
          markdown: `[${target.name}](${sandbox.url(relPath)}?download=1)`,
        });
      },
    },
    session_file_write: {
      description: `Write content to a file in the session sandbox (e.g. building a website, writing scripts, drafting documents). Creates parent folders automatically. Use forward slashes (/) in 'path'. Overwrites by default; use mode='append' to append. ⚠️ After you finish writing files, you MUST present them: call session_present_file for a single file, or session_present_files for multiple — otherwise the user never sees them.`,
      parameters: sessionFileWriteSchema,
      execute: async ({
        path: relPath,
        content,
        mode,
      }: {
        path: string;
        content: string;
        mode?: "overwrite" | "append" | null;
      }) => {
        const result = await sandbox.write(
          relPath,
          content,
          mode ?? "overwrite",
        );
        return {
          path: result.relativePath,
          bytesChanged: result.wrote,
          created: result.created,
          linesAdded: result.linesAdded,
          linesRemoved: result.linesRemoved,
          createdDirectories: result.createdDirectories,
        };
      },
    },
    session_file_edit: {
      description: `Edit a session file without rewriting it. old_str must match exactly once; if it matches 0 or multiple times the result returns current content to retry with a more specific anchor. Empty new_str deletes text. ⚠️ After your edits are final, present the file: session_present_file for a single file, or session_present_files for multiple.`,
      parameters: sessionFileEditSchema,
      execute: async ({ path: relPath, old_str, new_str }: { path: string; old_str: string; new_str: string }) => {
        const result = await editSessionFile(conversationId, relPath, old_str, new_str);
        if ("relativePath" in result) {
          return {
            path: result.relativePath,
            bytesChanged: result.bytesChanged,
            linesAdded: result.linesAdded,
            linesRemoved: result.linesRemoved,
          };
        }
        return truncateToolResult(result);
      },
    },
    session_file_mkdir: {
      description: `Create a folder in the session sandbox (creates missing parents). Usually unnecessary — session_file_write creates folders automatically. Use only for empty folders.`,
      parameters: sessionFileMkdirSchema,
      execute: async ({ path: relPath }: { path: string }) => {
        const entry = await sandbox.mkdir(relPath);
        return truncateToolResult({
          path: entry.path,
          created: true,
          url: sandbox.url(entry.path),
        });
      },
    },
    session_file_move: {
      description: `Rename or move a file/folder within the session sandbox. Creates destination parent folders; fails if the destination exists or moving a folder into its own subfolder.`,
      parameters: sessionFileMoveSchema,
      execute: async ({ from, to }: { from: string; to: string }) => {
        const entry = await sandbox.move(from, to);
        return truncateToolResult({
          from,
          to: entry.path,
          name: entry.name,
          isDirectory: entry.isDirectory,
          url: entry.isDirectory ? null : sandbox.url(entry.path),
        });
      },
    },
    session_file_delete: {
      description: `⚠️ Permanently delete a file (or directory and contents) from the session sandbox. Cannot be undone. Only delete when the user asks or the file is clearly obsolete; if in doubt, keep it.`,
      parameters: sessionFileDeleteSchema,
      execute: async ({ path: relPath }: { path: string }) => {
        const result = await sandbox.delete(relPath);
        return truncateToolResult({
          path: relPath,
          deleted: result.deleted,
        });
      },
    },
    session_present_file: {
      description: `Open the session files panel straight to one file, shown in the built-in viewer. Use to highlight a single file you created/modified (e.g. 'Here's the updated index.html'). Use session_present_files for the whole set.`,
      parameters: sessionPresentFileSchema,
      execute: async ({
        path: relPath,
        message,
      }: {
        path: string;
        message?: string | null;
      }) => {
        const all = await sandbox.listAll();
        const target = all.find((e) => e.path === relPath && e.isFile);
        if (!target) {
          return truncateToolResult({
            error: `File not found in session sandbox: "${relPath}"`,
            availableFiles: all.map((e) => e.path),
          });
        }
        return truncateToolResult({
          type: "session_file" as const,
          path: target.path,
          name: target.name,
          size: target.size,
          url: sandbox.url(target.path),
          message: message ?? null,
        });
      },
    },
    session_present_files: {
      description: `Present the session files to the user — opens a side panel with the file list, a viewer, and a "Download .zip" button. Call after you've finished writing files the user should see (e.g. a whole website). Pass optional 'paths' to highlight specific files; defaults to all. For one file use session_present_file.`,
      parameters: sessionPresentFilesSchema,
      execute: async ({
        paths,
        message,
      }: {
        paths?: string[] | null;
        message?: string | null;
      }) => {
        const all = await sandbox.listAll();
        const presented = (
          paths && paths.length > 0
            ? all.filter((f) => paths.includes(f.path))
            : all
        ).filter((f) => f.isFile);
        return truncateToolResult({
          type: "session_files" as const,
          message: message ?? null,
          count: presented.length,
          files: presented.map((e) => toModelEntry(e, conversationId)),
        });
      },
    },
  };
}
