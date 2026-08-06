import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { AVATAR_DIR } from "@/lib/paths";

// Store avatars in a dedicated directory

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * POST /api/profile/avatar
 *
 * Accepts multipart/form-data with:
 *   - avatar: File (single image file)
 *
 * Returns:
 *   { url: "/api/profile/avatar/{filename}" }
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No avatar file provided" },
        { status: 400 },
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum 5 MB." },
        { status: 400 },
      );
    }

    // Ensure avatar directory exists
    await fs.mkdir(AVATAR_DIR, { recursive: true });

    // Generate a unique filename
    const ext = file.name.split(".").pop() ?? "jpg";
    const uuid = crypto.randomUUID();
    const safeName = `${uuid}.${ext.replace(/[^a-zA-Z0-9]/g, "")}`;
    const filePath = path.join(AVATAR_DIR, safeName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Build the serving URL
    const url = `/api/profile/avatar/${encodeURIComponent(safeName)}`;

    return NextResponse.json({ url });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return NextResponse.json(
      { error: "Internal server error during avatar upload" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/profile/avatar
 *
 * Deletes the current avatar file.
 * Expects JSON body: { url: string }
 */
export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url) {
      return NextResponse.json({ error: "No avatar URL provided" }, { status: 400 });
    }

    // Extract filename from URL
    const segments = body.url.split("/");
    const filename = segments[segments.length - 1];
    if (!filename) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const filePath = path.join(AVATAR_DIR, decodeURIComponent(filename));

    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist — that's fine
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Avatar delete error:", err);
    return NextResponse.json(
      { error: "Internal server error during avatar deletion" },
      { status: 500 },
    );
  }
}
