import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import {
  listSessionFiles,
  readSessionFile,
  writeSessionFile,
  deleteSessionFile,
  type SessionFileEntry,
} from "./storage";

// ---------------------------------------------------------------------------
// Session files tools — a private, per-conversation file sandbox
//
// Each conversation has its own sandbox directory. Files the AI creates
// here are shown to the user in a side panel and can be downloaded as a
// single .zip archive (e.g. a whole generated website).
//
// The shared schemas/descriptions below are reused by the builder, which
// binds every tool to the specific conversation's sandbox directory.
// ---------------------------------------------------------------------------

/** Serialise an entry for the model (keep the payload compact). */
function toModelEntry(e: SessionFileEntry) {
  return {
    path: e.path,
    name: e.name,
    isDirectory: e.isDirectory,
    size: e.isDirectory ? null : e.size,
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
    write: (
      relPath: string,
      content: string,
      mode?: "overwrite" | "append" | null,
    ) => writeSessionFile(conversationId, relPath, content, mode),
    delete: (relPath: string) => deleteSessionFile(conversationId, relPath),
    listAll: () => listSessionFiles(conversationId, null),
  };

  return {
    session_file_list: {
      description: `List files in this conversation's private session sandbox — files that you or the user have created for this chat (e.g. a generated website). Returns paths, sizes, and whether each entry is a file or directory.

Call this whenever you need to know what files exist in the session before reading, writing, or presenting them. Pass an optional \`path\` to list only a subdirectory.`,
      parameters: sessionFileListSchema,
      execute: async ({ path: relPath }: { path?: string | null }) => {
        const entries = await sandbox.list(
          relPath && relPath.trim() ? relPath : null,
        );
        return truncateToolResult({
          root: relPath && relPath.trim() ? relPath : "/",
          count: entries.length,
          files: entries.map(toModelEntry),
        });
      },
    },
    session_file_read: {
      description: `Read the text content of a file in this conversation's session sandbox (files you or the user created for this chat). Supports optional byte offset/limit pagination for large files.

**Workflow:** Use \`session_file_list\` first to discover file paths, then read the one you need.`,
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
    session_file_write: {
      description: `Write content to a file in this conversation's private session sandbox. Use this to create and modify files for the user (e.g. building a website, writing scripts, drafting documents). Creates parent directories automatically — no separate mkdir step needed.

**Rules:**
- Always use forward slashes (/) in \`path\`, e.g. "src/styles.css".
- By default overwrites the file; use mode='append' to append instead.
- After writing files, call \`session_present_files\` so the user can see them in the panel and download them.

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
          path: relPath,
          wrote: result.wrote,
          mode: mode ?? "overwrite",
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

Optionally pass \`paths\` to highlight specific files (e.g. the main entry point). If omitted, all session files are shown.`,
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
          files: presented.map(toModelEntry),
        });
      },
    },
  };
}
