import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

// Store uploaded files alongside the SQLite database
const UPLOAD_BASE = path.join(process.cwd(), "data", "uploads");

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILES_PER_REQUEST = 10;

/**
 * POST /api/chat/upload
 *
 * Accepts multipart/form-data with:
 *   - conversationId: string (number as string)
 *   - files: File[] (one or more files, keyed as "files")
 *
 * Returns:
 *   { files: [{ name, url, mimeType, size }] }
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    // Accept conversationId from form body OR query parameter (query param is more reliable)
    const conversationId =
      (formData.get("conversationId") as string | null) ??
      new URL(request.url).searchParams.get("conversationId");
    const rawFiles = formData.getAll("files") as (File | string)[];

    // Validate conversationId
    if (!conversationId || !/^\d+$/.test(conversationId)) {
      return NextResponse.json(
        { error: "Invalid or missing conversationId" },
        { status: 400 },
      );
    }

    // Filter only actual File objects
    const files = rawFiles.filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 },
      );
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES_PER_REQUEST} files per request` },
        { status: 400 },
      );
    }

    // Ensure upload directory exists
    const uploadDir = path.join(UPLOAD_BASE, conversationId);
    await fs.mkdir(uploadDir, { recursive: true });

    const results: Array<{
      name: string;
      url: string;
      mimeType: string;
      size: number;
    }> = [];

    for (const file of files) {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        continue; // Skip files over the size limit
      }

      // Generate a unique filename to prevent collisions
      const uuid = crypto.randomUUID().slice(0, 8);
      const safeName = `${uuid}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(uploadDir, safeName);

      // Write file to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      // Build the serving URL
      const url = `/api/chat/uploads/${conversationId}/${encodeURIComponent(safeName)}`;

      results.push({
        name: file.name,
        url,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
    }

    return NextResponse.json({ files: results });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 },
    );
  }
}
