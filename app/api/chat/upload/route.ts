import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import {
  listSessionFiles,
  resolveSessionPath,
  sanitizeUploadName,
} from "@/lib/session-files/storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILES_PER_REQUEST = 10;

/**
 * Pick a collision-free filename for a new upload inside the sandbox's
 * `uploads/` folder. Keeps the original (sanitized) name when possible so
 * the file manager shows friendly names — e.g. `report.pdf`, or
 * `report (1).pdf` when a file with the same name already exists.
 */
function uniqueUploadName(
  existingNames: Set<string>,
  filename: string,
): string {
  const base = sanitizeUploadName(filename);
  if (!existingNames.has(base)) return base;

  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * POST /api/chat/upload
 *
 * Accepts multipart/form-data with:
 *   - conversationId: string (number as string)
 *   - files: File[] (one or more files, keyed as "files")
 *
 * Files are saved into the conversation's session sandbox under the
 * `uploads/` folder (data/session-files/{conversationId}/uploads/), so they
 * automatically appear in the session files panel, can be managed there by
 * the user, and are accessible to the AI (via session_file_* tools and the
 * URL-based read_file/read_media/read_document/web_fetch tools).
 *
 * Returns:
 *   { files: [{ name, url, mimeType, size }] }
 * where `url` is the canonical session-file URL:
 *   /api/chat/{conversationId}/session-files/uploads/{filename}
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

    const convId = Number(conversationId);

    // Collect names already present in the uploads folder so each new file
    // gets a unique, human-friendly name (no uuid prefixes in the UI).
    let existingNames = new Set<string>();
    try {
      const existing = await listSessionFiles(convId, "uploads");
      existingNames = new Set(
        existing.filter((e) => e.isFile).map((e) => e.name),
      );
    } catch {
      // uploads/ folder doesn't exist yet — fine, all names are fresh
    }

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

      const buffer = Buffer.from(await file.arrayBuffer());

      // Write the file into the session sandbox uploads/ folder with an
      // exclusive create (`wx`). If a concurrent request already created the
      // same name in the tiny window after our list, we retry with the next
      // unique name instead of silently overwriting the other file.
      let name = uniqueUploadName(existingNames, file.name);
      existingNames.add(name);
      for (let attempt = 0; ; attempt++) {
        try {
          const targetPath = await resolveSessionPath(convId, `uploads/${name}`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, buffer, { flag: "wx" });
          break;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== "EEXIST") throw err;
          if (attempt > 50) {
            throw new Error(`Could not find a unique name for "${file.name}"`);
          }
          name = uniqueUploadName(existingNames, file.name);
          existingNames.add(name);
        }
      }

      // Build the serving URL (served by /api/chat/[id]/session-files/[...path])
      const url = `/api/chat/${convId}/session-files/uploads/${encodeURIComponent(name)}`;

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
