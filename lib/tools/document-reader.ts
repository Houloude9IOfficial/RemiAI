import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { truncateToolResult } from "@/lib/utils";
import {
  getPermittedRoots,
  getRootById,
  resolvePath,
  resolveUploadUrl,
  type PermittedRoot,
} from "@/lib/fs/access";

// ---------------------------------------------------------------------------
// Supported formats
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".odt",
  ".rtf",
  ".epub",
] as const;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// Document extraction implementations
// ---------------------------------------------------------------------------

/**
 * Extract text from a PDF using pdf-parse.
 */
async function extractPdfText(filePath: string): Promise<string> {
  // pdf-parse is a dynamic import because it's a native-ish module
  const pdfParse = await importPdfParse();
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

/**
 * Extract text from a DOCX file using mammoth.
 */
async function extractDocxText(filePath: string): Promise<string> {
  const mammoth = await importMammoth();
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extract text from a document file, dispatching by extension.
 */
async function extractText(
  filePath: string,
  ext: string,
): Promise<{ text: string; format: string }> {
  switch (ext) {
    case ".pdf":
      return { text: await extractPdfText(filePath), format: "pdf" };
    case ".docx":
    case ".doc":
      return { text: await extractDocxText(filePath), format: "docx" };
    case ".odt":
    case ".rtf":
    case ".epub":
      // Fallback: try reading as plain text (some RTF/ODT files are readable)
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return { text: content, format: ext.slice(1) };
      } catch {
        throw new Error(
          `Cannot read .${ext} files directly. Try converting to PDF or DOCX first.`,
        );
      }
    default:
      throw new Error(`Unsupported document format: ${ext}`);
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

/**
 * Read a document file from a chat upload URL.
 *
 * Accepts URLs like `/api/chat/uploads/123/uuid_report.pdf` and extracts text
 * from the file directly on disk.
 */
export async function readDocumentFromUrl(uploadUrl: string): Promise<{
  filename: string;
  format: string;
  size: number;
  text: string;
  characters: number;
}> {
  const { filename, resolvedPath } = await resolveUploadUrl(uploadUrl);

  const stats = await fs.stat(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(`Uploaded document not found: "${filename}"`);
  }

  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `"${filename}" is ${(stats.size / 1024 / 1024).toFixed(1)} MB — exceeds the 50 MB limit`,
    );
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `Unsupported file type "${ext}". Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
  }

  const { text, format } = await extractText(resolvedPath, ext);

  return {
    filename,
    format,
    size: stats.size,
    text,
    characters: text.length,
  };
}

/**
 * Read a document (PDF, DOCX, etc.) and extract its text content.
 * Works with either a chat upload URL or within permitted directory roots.
 */
export const readDocumentTool = {
  description: `Extract text from a document (PDF, DOCX, DOC, ODT, RTF, EPUB). Use instead of read_file for non-plain-text documents. Max 50MB. No OCR for scanned PDFs.

Pass \`url\` for chat/session file URLs, a bare \`relativePath\` (no rootId) for a session sandbox file like \`canvas/movie-db/report.pdf\`, or \`rootId\` + \`relativePath\` for files in configured directories. Long documents are truncated at ~100k chars (≈25k tokens); ask the user to split the file or cite the section you need if more is required.`,
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
        .describe("Path to the document within the root when combined with rootId, OR a bare session sandbox path (e.g. `canvas/movie-db/report.pdf`) when rootId is omitted"),
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
          "Either `url` (for chat file URLs), a bare `relativePath` (for a session sandbox file like `canvas/movie-db/report.pdf`), or both `rootId` and `relativePath` (for directory files) are required.",
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
      // Read from chat upload URL. Documents have no pagination, so use a
      // larger cap (100k chars ≈ 25k tokens) than the default 50k.
      const result = await readDocumentFromUrl(url);
      return truncateToolResult(result, 100_000);
    }

    let targetPath: string;
    if (rootId) {
      if (!relativePath) {
        throw new Error(
          "`rootId` requires a `relativePath` — pass the path within the root.",
        );
      }
      const roots = await getPermittedRoots();
      if (roots.length === 0) {
        throw new Error(
          "No directories configured. Add a directory in Settings > Directories first.",
        );
      }
      const root = await getRootById(rootId);
      targetPath = await resolvePath(root, relativePath);
    } else if (relativePath) {
      // Bare relativePath (no rootId, no url) → session sandbox file
      if (!_conversationId) {
        throw new Error(
          "A bare `relativePath` refers to a session sandbox file, but no conversation is available here. Pass the file's `url` (e.g. /api/chat/{id}/session-files/...) or both `rootId` and `relativePath` instead.",
        );
      }
      const { resolveSessionPath } = await import("@/lib/session-files/storage");
      targetPath = await resolveSessionPath(_conversationId, relativePath);
    } else {
      throw new Error(
        "Either `url` (for chat file URLs), a bare `relativePath` (for a session sandbox file like `canvas/movie-db/report.pdf`), or both `rootId` and `relativePath` (for directory files) are required.",
      );
    }

    const stats = await fs.stat(targetPath);

    if (!stats.isFile()) {
      throw new Error(`"${relativePath}" is not a file`);
    }

    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(
        `"${relativePath}" is ${(stats.size / 1024 / 1024).toFixed(1)} MB — exceeds the 50 MB limit`,
      );
    }

    const ext = path.extname(targetPath).toLowerCase();

    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new Error(
        `Unsupported file type "${ext}". Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      );
    }

    const { text, format } = await extractText(targetPath, ext);
    // Normalize filename: handle Windows backslashes if the AI sends them
    const filename = path.basename(relativePath.replace(/\\/g, "/"));

    return truncateToolResult(
      {
        filename,
        format,
        size: stats.size,
        text,
        characters: text.length,
      },
      100_000,
    );
  },
};

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

/**
 * Lazy-import pdf-parse (native-ish module, avoid loading at startup).
 */
async function importPdfParse(): Promise<
  (dataBuffer: Buffer) => Promise<{ text: string; numpages: number }>
> {
  const mod = await import("pdf-parse");
  const fn = (mod as any).default ?? mod;
  return fn as any;
}

/**
 * Lazy-import mammoth (DOCX parser).
 */
async function importMammoth(): Promise<{
  extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string }>;
}> {
  const mod = await import("mammoth");
  return mod as any;
}

// ---------------------------------------------------------------------------
// Builder function for the chat route
// ---------------------------------------------------------------------------

/**
 * Build document-reading tools.
 *
 * `read_document` is always included because it now supports URL-based usage
 * (chat uploads) that doesn't require a directory root. When a
 * `conversationId` is provided, the conversation id is injected into the
 * tool's args so a bare session-relative path (e.g.
 * `canvas/movie-db/report.pdf`) can be resolved against this conversation's
 * sandbox.
 */
export async function buildDocumentReaderTools(
  conversationId?: number,
): Promise<Record<string, any>> {
  const tool =
    conversationId !== undefined
      ? {
          ...readDocumentTool,
          execute: (args: Record<string, unknown>) =>
            readDocumentTool.execute({ ...args, _conversationId: conversationId }),
        }
      : readDocumentTool;
  return {
    read_document: tool,
  };
}
