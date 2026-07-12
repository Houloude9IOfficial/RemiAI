import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpServers } from "@/db/schema";
import { mcpServerCreateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";

export async function GET() {
  const rows = await db.select().from(mcpServers).orderBy(mcpServers.createdAt);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let body: ReturnType<typeof mcpServerCreateSchema.parse>;
  try {
    body = mcpServerCreateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  const existing = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.name, body.name))
    .get();
  if (existing) {
    return NextResponse.json(
      { error: "An MCP server with this name already exists" },
      { status: 409 },
    );
  }

  const row = await db
    .insert(mcpServers)
    .values({
      name: body.name,
      transport: body.transport,
      command: body.transport === "stdio" ? body.command! : null,
      args: body.transport === "stdio" ? (body.args ?? null) : null,
      env: body.transport === "stdio" ? (body.env ?? null) : null,
      url: body.transport === "http" ? body.url! : null,
      headers: body.transport === "http" ? (body.headers ?? null) : null,
    })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
