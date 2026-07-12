import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mcpServers } from "@/db/schema";
import { testConnection } from "@/lib/mcp/client-pool";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const server = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.id, Number(id)))
    .get();

  if (!server) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }

  const result = await testConnection(server);

  // Update the server row with connection info
  const update: Record<string, unknown> = {};
  if (result.ok) {
    update.lastConnectedAt = new Date().toISOString();
    update.lastError = null;
  } else {
    update.lastError = result.error ?? null;
  }
  await db
    .update(mcpServers)
    .set(update)
    .where(eq(mcpServers.id, Number(id)));

  return NextResponse.json(result);
}
