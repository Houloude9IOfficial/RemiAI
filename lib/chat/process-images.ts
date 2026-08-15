import fs from "node:fs/promises";
import path from "node:path";
import { resolveUploadUrl } from "@/lib/fs/access";

// Matches image markdown references for chat-attached files, in both URL
// schemes the app uses:
//   ![filename](/api/chat/uploads/123/uuid_filename.png)             (legacy uploads)
//   ![filename](/api/chat/5/session-files/uploads/photo.png)         (session sandbox uploads)
// plus optional localhost origin prefixes.
const IMAGE_UPLOAD_RE =
  /!\[([^\]]*)\]\((?:https?:\/\/[^\/]+)?(\/api\/chat\/(?:uploads\/\d+\/[^)]+|(?:\d+)\/session-files\/[^)]+))\)/g;

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
  // iPhone's default camera format — high-quality photos from the photo
  // library arrive as HEIC and were silently skipped here before.
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export type ImageAttachment = {
  /** The full markdown match (e.g. `![name](/api/chat/5/session-files/uploads/file.png)`) */
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
 * Scan a text string for image markdown references of chat-attached files
 * (both legacy `/api/chat/uploads/...` and session sandbox
 * `/api/chat/{id}/session-files/...` URLs) and return the matched markdown +
 * raw file data for each found image.
 *
 * Paths are resolved through `resolveUploadUrl`, which validates containment
 * for both URL schemes. Images that fail to read (file not found, unreadable)
 * are silently skipped. Path-traversal attempts are also rejected.
 */
export async function extractImageAttachments(
  text: string,
): Promise<ImageAttachment[]> {
  const attachments: ImageAttachment[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(IMAGE_UPLOAD_RE)) {
    const [, altText, rawUrl] = match;

    // Resolve to disk — handles both URL schemes with path-traversal and
    // containment checks (throws on invalid/escaping URLs).
    let resolved;
    try {
      resolved = await resolveUploadUrl(rawUrl);
    } catch {
      continue;
    }

    const filePath = resolved.resolvedPath;
    const displayName = path
      .basename(resolved.filename.replace(/\\/g, "/"));

    // Deduplicate: same conversation + same file path
    const key = `${resolved.conversationId}/${resolved.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Determine MIME type from extension
    const ext = path.extname(displayName).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];
    if (!mimeType) continue; // not a recognised image type

    try {
      const stat = await fs.stat(filePath);
      // Enforce the same 20 MB limit as the upload route
      if (stat.size > 20 * 1024 * 1024) continue;

      const buffer = await fs.readFile(filePath);
      attachments.push({
        markdown: match[0],
        buffer,
        mimeType,
        filename: altText || displayName,
        url: rawUrl,
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
 * Only removes references that match chat upload / session-file URLs.
 */
export function stripImageMarkdown(text: string): string {
  return text.replace(IMAGE_UPLOAD_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}
