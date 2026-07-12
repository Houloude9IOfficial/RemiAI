import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");

  if (query) {
    // Fuzzy search using SQLite LIKE for simplicity
    const pattern = `%${query}%`;
    const rows = await db
      .select()
      .from(memories)
      .where(sql`${memories.content} LIKE ${pattern}`)
      .orderBy(memories.createdAt);
    return NextResponse.json(rows);
  }

  const rows = await db
    .select()
    .from(memories)
    .orderBy(memories.createdAt);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { content: string };

  if (!body.content?.trim()) {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 },
    );
  }

  const row = await db
    .insert(memories)
    .values({ content: body.content.trim() })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
