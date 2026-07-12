import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { truncateToolResult } from "@/lib/utils";
import {
  getPermittedRoots,
  getRootById,
  resolvePath,
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
 * Read a document (PDF, DOCX, etc.) and extract its text content.
 * Works within permitted directory roots.
 */
export const readDocumentTool = {
  description: `Extract text content from a document file (PDF, DOCX, DOC, ODT, RTF, EPUB). Use this when the user asks you to read a document that isn't a plain text file (.md, .txt, .csv, etc.).

Supported formats:
- .pdf — Portable Document Format (extracts text content with pdf-parse)
- .docx / .doc — Microsoft Word documents (extracts raw text with mammoth)
- .odt — OpenDocument Text (read as plain text if possible)
- .rtf — Rich Text Format (read as plain text if possible)
- .epub — Electronic Publication (read as plain text if possible)

Max file size: 50 MB.

For images within documents (scanned PDFs), this tool extracts any embedded text but cannot perform OCR. If the document is scanned images, the user will need OCR software.

Usage: first use list_permitted_roots to discover available roots, then call this with the rootId and relativePath.`,
  parameters: z.object({
    rootId: z
      .coerce.number()
      .int()
      .positive()
      .describe(
        "ID of the permitted root directory (use list_permitted_roots to discover)",
      ),
    relativePath: z
      .string()
      .min(1)
      .describe(
        "Relative path to the document file within the root. Use forward slashes even on Windows.",
      ),
  }),
  execute: async ({
    rootId,
    relativePath,
  }: {
    rootId: number;
    relativePath: string;
  }) => {
    const roots = await getPermittedRoots();
    if (roots.length === 0) {
      throw new Error(
        "No directories configured. Add a directory in Settings > Directories first.",
      );
    }

    const root = await getRootById(rootId);
    const targetPath = await resolvePath(root, relativePath);
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

    return truncateToolResult({
      filename,
      format,
      size: stats.size,
      text,
      characters: text.length,
    });
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
 * Build document-reading tools. Returns an object with `read_document` if
 * at least one directory root is configured, otherwise an empty object.
 */
export async function buildDocumentReaderTools(): Promise<
  Record<string, any>
> {
  const roots = await getPermittedRoots();
  if (roots.length === 0) return {};

  return {
    read_document: readDocumentTool,
  };
}
