import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import {
  listSessionFiles,
  readSessionFile,
  readSessionFileMedia,
  writeSessionFile,
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
    .describe(
      "Optional subdirectory to list (relative to the sandbox root, forward slashes). Leave empty to list everything.",
    ),
});

const sessionFileReadSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file within the session sandbox (forward slashes), e.g. 'index.html' or 'src/app.js'.",
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
    .max(1_000_000)
    .optional()
    .describe("Maximum number of bytes to read (max 1,000,000, default: 100,000)"),
});

const sessionFileReadMediaSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to an image or video in the session sandbox (forward slashes), e.g. 'assets/earth.jpg'.",
    ),
});

const sessionFileDownloadSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file the user should download (forward slashes), e.g. 'output/report.pdf'.",
    ),
});

const sessionFileWriteSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file within the session sandbox (forward slashes), e.g. 'index.html' or 'src/app.js'. Parent directories are created automatically.",
    ),
  content: z.string().describe("Text content to write to the file"),
  mode: z
    .enum(["overwrite", "append"])
    .optional()
    .describe(
      "Write mode: 'overwrite' replaces the file (default), 'append' appends to it.",
    ),
});

const sessionFileDeleteSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the file or directory to delete within the session sandbox (forward slashes). Deleting a directory removes everything inside it.",
    ),
});

const sessionFileMoveSchema = z.object({
  from: z
    .string()
    .describe(
      "Current relative path of the file or folder in the session sandbox (forward slashes), e.g. 'notes.txt'.",
    ),
  to: z
    .string()
    .describe(
      "New relative path for the file or folder (forward slashes), e.g. 'archive/notes.txt'. Parent directories are created automatically. Fails if the destination already exists.",
    ),
});

const sessionFileMkdirSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path of the folder to create in the session sandbox (forward slashes). Creates any missing parent folders too.",
    ),
});

const sessionPresentFilesSchema = z.object({
  paths: z
    .array(z.string())
    .optional()
    .describe(
      "Optional list of relative file paths to highlight (e.g. ['index.html', 'styles.css']). Defaults to all files.",
    ),
  message: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional short note shown with the file panel, e.g. 'Your website is ready to download!'.",
    ),
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
      description: `List files in this conversation's private session sandbox — files that you or the user have created for this chat (e.g. a generated website). Returns paths, sizes, and whether each entry is a file or directory.

Call this whenever you need to know what files exist in the session before reading, writing, or presenting them. Pass an optional 'path' to list only a subdirectory.

Each file entry includes a 'url' like '/api/chat/${conversationId}/session-files/{path}' — use that to embed the file in your reply (e.g. '![earth.jpg](/api/chat/${conversationId}/session-files/earth.jpg)') or to hand to URL-based tools.`,
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
      description: `Read the text content of a file in this conversation's session sandbox (files you or the user created for this chat). Supports optional byte offset/limit pagination for large files.

**Workflow:** Use 'session_file_list' first to discover file paths, then read the one you need. For images/videos use 'session_file_read_media' instead — this tool only returns text.`,
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
      description: `Read an image or video from this conversation's session sandbox so you can see it. For images, returns a base64 data URL of the actual pixels (plus the canonical 'url') — use this whenever you need to inspect a picture, screenshot, diagram, or other visual file the user or you placed in the sandbox.

**Workflow:** 'session_file_list' → find the image → 'session_file_read_media({ path })'. You can also embed the returned 'url' in your reply as '![name](url)' so the user sees the image in the chat.

Supported: images (.jpg, .png, .gif, .webp, .svg, .avif) and videos (.mp4, .webm, .mov, .avi, .mkv). Max 20 MB.`,
      parameters: sessionFileReadMediaSchema,
      execute: async ({ path: relPath }: { path: string }) => {
        const result = await sandbox.readMedia(relPath);
        return truncateToolResult({
          path: relPath,
          type: result.type,
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
          url: result.url,
          ...(result.dataUrl ? { dataUrl: result.dataUrl } : {}),
        });
      },
    },
    session_file_download: {
      description: `Get a download link for a file in this conversation's session sandbox. Returns a URL the user can click to download the file directly (e.g. '[download report.pdf](/api/chat/${conversationId}/session-files/output/report.pdf?download=1)').

**When to use:** When the user wants to grab a single file out of the sandbox (the whole sandbox can be downloaded as a .zip via 'session_present_files'). Present the returned 'url' as a markdown link in your reply.`,
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
      description: `Write content to a file in this conversation's private session sandbox. Use this to create and modify files for the user (e.g. building a website, writing scripts, drafting documents). Creates parent directories automatically — no separate mkdir step needed.

**Rules:**
- Always use forward slashes (/) in 'path', e.g. "src/styles.css".
- By default overwrites the file; use mode='append' to append instead.
- After writing files, call 'session_present_files' so the user can see them in the panel and download them.

**Example — building a small website:**
\`\`\`
session_file_write({ path: "index.html", content: "<!DOCTYPE html>..." })
session_file_write({ path: "styles.css", content: "body { ... }" })
session_file_write({ path: "app.js", content: "console.log('hi');" })
session_present_files()
\`\`\``,
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
        return truncateToolResult({
          path: result.relativePath,
          url: sandbox.url(result.relativePath),
          wrote: result.wrote,
          mode: result.mode,
          created: result.created,
          linesWritten: result.linesWritten,
          linesAdded: result.linesAdded,
          linesRemoved: result.linesRemoved,
        });
      },
    },
    session_file_mkdir: {
      description: `Create a folder inside this conversation's session sandbox. Creates any missing parent folders too.

**Note:** Usually you don't need this — 'session_file_write' already creates parent folders automatically. Use it only when you want an empty folder the user can see in the panel.`,
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
      description: `Rename or move a file or folder within this conversation's session sandbox. Creates the destination's parent folders automatically. Fails if a file already exists at the destination, or if you try to move a folder into its own subfolder.

**Example:** moving a draft into a subfolder — 'session_file_move({ from: "notes.md", to: "drafts/notes.md" })'.`,
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
      description: `⚠️ Permanently delete a file (or directory and its contents) from this conversation's session sandbox. This CANNOT be undone.

Only delete when the user asks to remove a file, or when you are certain a file is no longer needed (e.g. replacing a generated file entirely). If in doubt, keep the file and tell the user it's still there.`,
      parameters: sessionFileDeleteSchema,
      execute: async ({ path: relPath }: { path: string }) => {
        const result = await sandbox.delete(relPath);
        return truncateToolResult({
          path: relPath,
          deleted: result.deleted,
        });
      },
    },
    session_present_files: {
      description: `Present this conversation's session files to the user — opens a side panel in the chat showing the file list, with a viewer and a "Download .zip" button.

**When to use:** After you've written files the user should see or download (a generated website, scripts, documents, etc.). Call it once you've finished writing all the files.

Optionally pass 'paths' to highlight specific files (e.g. the main entry point). If omitted, all session files are shown.`,
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
