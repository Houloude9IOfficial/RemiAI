import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, projects } from "@/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const project = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const chats = await db.select().from(conversations).where(eq(conversations.projectId, id)).orderBy(desc(conversations.updatedAt), desc(conversations.id));
  return NextResponse.json(chats);
}
