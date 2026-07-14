import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

const UPLOAD_BASE = path.join(process.cwd(), "data", "uploads");

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".js": "text/javascript",
  ".ts": "text/plain",
  ".py": "text/x-python",
  ".html": "text/html",
  ".css": "text/css",
  ".md": "text/markdown",
  ".xml": "application/xml",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".log": "text/plain",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "text/toml",
};

/**
 * GET /api/chat/uploads/{conversationId}/{filename}
 *
 * Serves an uploaded file from disk. Security:
 * - Validates conversationId is numeric
 * - Prevents path traversal (no ".." or "/" in the filename segment)
 * - Only serves files from within the designated upload directory
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string; path: string[] }> },
) {
  try {
    const { conversationId: convId, path: segments } = await params;

    // Validate conversationId is numeric
    if (!convId || !/^\d+$/.test(convId)) {
      return new NextResponse("Invalid conversation ID", { status: 400 });
    }

    // Reconstruct filename (decode URI components)
    const filename = segments.map((s) => decodeURIComponent(s)).join("/");

    // Security: prevent path traversal
    if (filename.includes("..") || filename.startsWith("/")) {
      return new NextResponse("Access denied", { status: 403 });
    }

    const filePath = path.join(UPLOAD_BASE, convId, filename);

    // Verify the resolved path is still within the upload directory
    const resolvedPath = path.resolve(filePath);
    const normalizedBase = path.resolve(UPLOAD_BASE, convId);
    if (!resolvedPath.startsWith(normalizedBase + path.sep)) {
      return new NextResponse("Access denied", { status: 403 });
    }

    // Read and serve the file
    const buffer = await fs.readFile(resolvedPath);
    const stat = await fs.stat(resolvedPath);

    const ext = path.extname(filename).toLowerCase();
    const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=3600",
        // Prevent browser navigation for non-media types
        ...(mimeType.startsWith("image/") || mimeType.startsWith("video/")
          ? {}
          : { "Content-Disposition": "inline" }),
      },
    });
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return new NextResponse("File not found", { status: 404 });
    }
    console.error("Upload serving error:", err);
    return new NextResponse(`Server error`, { status: 500 });
  }
}
