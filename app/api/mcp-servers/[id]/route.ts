import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpServers } from "@/db/schema";
import { mcpServerUpdateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: ReturnType<typeof mcpServerUpdateSchema.parse>;
  try {
    body = mcpServerUpdateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const row = await db
    .update(mcpServers)
    .set(body)
    .where(eq(mcpServers.id, Number(id)))
    .returning()
    .get();

  if (!row) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(mcpServers).where(eq(mcpServers.id, Number(id)));
  return NextResponse.json({ ok: true });
}
