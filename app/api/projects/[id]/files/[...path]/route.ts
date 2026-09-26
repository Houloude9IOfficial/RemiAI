import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getMimeType } from "@/lib/session-files/storage";
import { projectFilePath } from "@/lib/projects/storage";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id: rawId, path: segments } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0 || !segments.length) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  const row = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const relativePath = segments.join("/");
    const target = await projectFilePath(id, relativePath);
    const stat = await fs.stat(target);
    if (!stat.isFile()) return NextResponse.json({ error: "Not a file" }, { status: 400 });
    const data = await fs.readFile(target);
    const filename = segments.at(-1) ?? "file";
    return new Response(new Uint8Array(data), { headers: { "Content-Type": getMimeType(filename), "Content-Length": String(stat.size), "Cache-Control": "no-store", ...(new URL(req.url).searchParams.get("download") === "1" ? { "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"` } : {}) } });
  } catch { return NextResponse.json({ error: "File not found" }, { status: 404 }); }
}
