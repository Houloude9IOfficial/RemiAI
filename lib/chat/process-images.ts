import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_BASE } from "@/lib/fs/access";

// Matches image markdown references for chat uploads:
//   ![filename](/api/chat/uploads/123/uuid_filename.png)
//   ![filename](http://localhost:3000/api/chat/uploads/123/uuid_filename.png)
const IMAGE_UPLOAD_RE =
  /!\[([^\]]*)\]\((?:https?:\/\/[^\/]+)?\/api\/chat\/uploads\/(\d+)\/([^)]+)\)/g;

// Map of recognised image extensions to MIME types
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

export type ImageAttachment = {
  /** The full markdown match (e.g. `![name](/api/chat/uploads/1/file.png)`) */
  markdown: string;
  /** Raw file buffer read from disk */
  buffer: Buffer;
  /** MIME type derived from file extension */
  mimeType: string;
  /** Display filename */
  filename: string;
  /** Server-accessible URL */
  url: string;
};

/**
 * Scan a text string for image upload markdown references and return the
 * matched markdown + raw file data for each found image.
 *
 * Images that fail to read (file not found, unreadable) are silently skipped.
 * Path-traversal attempts are also rejected.
 */
export async function extractImageAttachments(
  text: string,
): Promise<ImageAttachment[]> {
  const attachments: ImageAttachment[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(IMAGE_UPLOAD_RE)) {
    const [, altText, conversationId, rawFilename] = match;
    const filename = decodeURIComponent(rawFilename);

    // Deduplicate: same conversation + same filename
    const key = `${conversationId}/${filename}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Security: prevent path traversal
    if (filename.includes("..") || filename.startsWith("/")) continue;

    const filePath = path.join(UPLOAD_BASE, conversationId, filename);
    const resolvedPath = path.resolve(filePath);
    const normalizedBase = path.resolve(UPLOAD_BASE, conversationId);
    if (!resolvedPath.startsWith(normalizedBase + path.sep)) continue;

    // Determine MIME type from extension
    const ext = path.extname(filename).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) continue; // not a recognised image type

    try {
      const stat = await fs.stat(resolvedPath);
      // Enforce the same 20 MB limit as the upload route
      if (stat.size > 20 * 1024 * 1024) continue;

      const buffer = await fs.readFile(resolvedPath);
      const url = `/api/chat/uploads/${conversationId}/${rawFilename}`;
      attachments.push({
        markdown: match[0],
        buffer,
        mimeType,
        filename: altText || filename,
        url,
      });
    } catch {
      // File not found or unreadable — skip silently
    }
  }

  return attachments;
}

/**
 * Remove image markdown references from a text string so the AI doesn't
 * see duplicate markdown when the image is already passed natively.
 *
 * Only removes references that match chat upload URLs.
 */
export function stripImageMarkdown(text: string): string {
  return text.replace(IMAGE_UPLOAD_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}
