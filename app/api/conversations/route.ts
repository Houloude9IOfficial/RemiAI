import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";

const createSchema = z.object({
  providerId: z.number().int().optional().nullable(),
  modelId: z.string().optional().nullable(),
});

export async function GET() {
  const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return jsonError(err);
  }

  const row = await db
    .insert(conversations)
    .values({
      providerId: body.providerId ?? null,
      modelId: body.modelId ?? null,
      // Use ISO dates consistently — SQLite's CURRENT_TIMESTAMP lacks
      // timezone info and causes inconsistent sort/display behavior
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
