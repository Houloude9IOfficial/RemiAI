import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { DEMO_PROVIDER_MODEL, ensureDemoProvider } from "@/lib/demo-provider";
import { isDemoMode } from "@/lib/demo-policy";

const createSchema = z.object({
  providerId: z.number().int().optional().nullable(),
  modelId: z.string().optional().nullable(),
  isTemporary: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
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

  const demoProvider = isDemoMode() ? ensureDemoProvider() : null;
  const row = await db
    .insert(conversations)
    .values({
      providerId: demoProvider?.id ?? body.providerId ?? null,
      modelId: demoProvider ? DEMO_PROVIDER_MODEL ?? null : body.modelId ?? null,
      // Temporary chats default to memory ENABLED (the two toggles are fully
      // independent — the user can flip either one from the chat menu).
      isTemporary: body.isTemporary ?? false,
      memoryEnabled: body.memoryEnabled ?? true,
      // Use ISO dates consistently — SQLite's CURRENT_TIMESTAMP lacks
      // timezone info and causes inconsistent sort/display behavior
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
