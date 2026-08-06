import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { AVATAR_DIR } from "@/lib/paths";


const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

/**
 * GET /api/profile/avatar/{filename}
 *
 * Serves an avatar image from disk. Security:
 * - Prevents path traversal (no ".." or "/" in the filename segment)
 * - Only serves files from within the designated avatars directory
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;

    // Reconstruct filename (decode URI components)
    const filename = segments.map((s) => decodeURIComponent(s)).join("/");

    // Security: prevent path traversal
    if (filename.includes("..") || filename.startsWith("/")) {
      return new NextResponse("Access denied", { status: 403 });
    }

    const filePath = path.join(AVATAR_DIR, filename);

    // Verify the resolved path is still within the avatars directory
    const resolvedPath = path.resolve(filePath);
    const normalizedBase = path.resolve(AVATAR_DIR);
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
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return new NextResponse("Avatar not found", { status: 404 });
    }
    console.error("Avatar serving error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}
