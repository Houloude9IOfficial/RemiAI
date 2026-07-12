import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { directories } from "@/db/schema";
import { directoryCreateSchema } from "@/lib/validation/schemas";
import { resolveDirectoryPath, DirectoryPathError } from "@/lib/fs/paths";
import { jsonError } from "@/lib/validation/api";

export async function GET() {
  const rows = await db.select().from(directories).orderBy(directories.createdAt);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let body: ReturnType<typeof directoryCreateSchema.parse>;
  try {
    body = directoryCreateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  let resolvedPath: string;
  try {
    resolvedPath = await resolveDirectoryPath(body.path);
  } catch (err) {
    if (err instanceof DirectoryPathError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const existing = await db
    .select()
    .from(directories)
    .where(eq(directories.path, resolvedPath))
    .get();
  if (existing) {
    return NextResponse.json(
      { error: "This directory is already added" },
      { status: 409 },
    );
  }

  const row = await db
    .insert(directories)
    .values({
      path: resolvedPath,
      label: body.label,
      canRead: body.canRead,
      canWrite: body.canWrite,
    })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
