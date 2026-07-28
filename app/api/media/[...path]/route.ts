import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getPermittedRoots } from "@/lib/fs/access";

/**
 * Serve a media file from a permitted root directory.
 *
 * Route: GET /api/media/<rootId>/<relativePath...>
 *
 * This allows the UI to fetch media files (images/videos) that are too large
 * to inline as data URLs in tool results. Access is gated by the permitted
 * roots list — only files inside configured roots can be served.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  if (!segments || segments.length < 2) {
    return new NextResponse("Invalid path — expected /api/media/<rootId>/<relativePath>", {
      status: 400,
    });
  }

  const rootIdStr = segments[0];
  const rootId = Number(rootIdStr);
  if (!Number.isFinite(rootId) || rootId <= 0) {
    return new NextResponse("Invalid rootId", { status: 400 });
  }

  // Reconstruct the relative path (decode URI components)
  const relativePath = segments
    .slice(1)
    .map((s) => decodeURIComponent(s))
    .join("/");

  // Find the root
  const roots = await getPermittedRoots();
  const root = roots.find((r) => r.id === rootId);
  if (!root) {
    return new NextResponse("Root directory not found", { status: 404 });
  }
  if (!root.canRead) {
    return new NextResponse("Read access denied", { status: 403 });
  }

  // Resolve the file path and verify it's within the root
  const resolved = path.resolve(root.path, relativePath);
  const normalizedRoot = path.normalize(root.path);

  // Containment check
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    return new NextResponse("Access denied — path outside root", { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return new NextResponse("Not a file", { status: 400 });
    }

    // Determine MIME type from extension
    const ext = path.extname(resolved).toLowerCase();
    const mimeMap: Record<string, string> = {
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
    };
    const mimeType = mimeMap[ext] ?? "application/octet-stream";

    const buffer = await fs.readFile(resolved);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=3600",
        // Prevent the browser from navigating to this URL directly for non-media types
        ...(mimeType.startsWith("image/") && mimeType !== "image/svg+xml" || mimeType.startsWith("video/")
          ? {}
          : { "Content-Disposition": "attachment" }),
      },
    });
  } catch (err: unknown) {
    const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
    if (code === "ENOENT") {
      return new NextResponse("File not found", { status: 404 });
    }
    return new NextResponse("Server error", { status: 500 });
  }
}
