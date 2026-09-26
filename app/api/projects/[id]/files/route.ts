import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { MAX_UPLOAD_SIZE } from "@/lib/session-files/storage";
import { deleteProjectFile, listProjectFiles, projectFileUrl, writeProjectFile } from "@/lib/projects/storage";

async function projectId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return (await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get())?.id ?? null;
}
const missing = () => NextResponse.json({ error: "Project not found" }, { status: 404 });
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await projectId(params);
  if (!id) return missing();
  const files = (await listProjectFiles(id)).map((file) => ({ ...file, url: file.isFile ? projectFileUrl(id, file.path) : null }));
  return NextResponse.json({ files });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await projectId(params);
  if (!id) return missing();
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
    if (file.size > MAX_UPLOAD_SIZE) return NextResponse.json({ error: "File exceeds the 25 MB limit" }, { status: 413 });
    const name = form.get("path");
    const target = typeof name === "string" && name.trim() ? name : file.name;
    await writeProjectFile(id, target, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await projectId(params);
  if (!id) return missing();
  const body = await req.json().catch(() => ({}));
  if (typeof body.path !== "string" || typeof body.content !== "string") return NextResponse.json({ error: "Path and content are required" }, { status: 400 });
  try { await writeProjectFile(id, body.path, Buffer.from(body.content)); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await projectId(params);
  if (!id) return missing();
  const body = await req.json().catch(() => ({}));
  if (typeof body.path !== "string") return NextResponse.json({ error: "Path is required" }, { status: 400 });
  try { await deleteProjectFile(id, body.path); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
