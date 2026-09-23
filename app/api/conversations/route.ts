import { NextResponse } from "next/server";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, providers } from "@/db/schema";
import { jsonError } from "@/lib/validation/api";
import { DEMO_PROVIDER_MODEL, ensureDemoProvider } from "@/lib/demo-provider";
import { isDemoMode } from "@/lib/demo-policy";

const createSchema = z.object({
  providerId: z.number().int().optional().nullable(),
  modelId: z.string().optional().nullable(),
  isTemporary: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
});

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

type ConversationCursor = { updatedAt: string; id: number };

function decodeCursor(value: string): ConversationCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof parsed.updatedAt === "string" && Number.isSafeInteger(parsed.id)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;

  // Preserve the existing full-list response for consumers such as the command
  // palette and settings. The sidebar opts into this bounded page mode.
  if (!searchParams.has("limit") && !searchParams.has("cursor")) {
    const rows = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    return NextResponse.json(rows);
  }

  const parsed = pageSchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return jsonError(parsed.error);

  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) {
    return NextResponse.json({ error: "Invalid conversation cursor" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(cursor
      ? or(
          lt(conversations.updatedAt, cursor.updatedAt),
          and(eq(conversations.updatedAt, cursor.updatedAt), lt(conversations.id, cursor.id)),
        )
      : undefined)
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(parsed.data.limit + 1);

  const page = rows.slice(0, parsed.data.limit);
  const last = page.at(-1);
  return NextResponse.json({
    conversations: page,
    nextCursor: rows.length > parsed.data.limit && last
      ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
      : null,
  });
}

export async function POST(req: Request) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return jsonError(err);
  }

  const demoProvider = isDemoMode() ? ensureDemoProvider() : null;
  // The browser remembers its last model locally. A provider can be deleted
  // between sessions, leaving that cached numeric id dangling; never pass it
  // straight into the foreign-key column. A new chat without a usable model is
  // still useful (the composer asks the user to choose one) and is preferable
  // to making the entire New chat action fail with SQLite's raw FK error.
  const requestedProvider = !demoProvider && body.providerId !== undefined && body.providerId !== null
    ? await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.id, body.providerId))
      .get()
    : null;
  const previousConversation = await db
    .select({ bashMode: conversations.bashMode })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(1)
    .get();
  const row = await db
    .insert(conversations)
    .values({
      providerId: demoProvider?.id ?? requestedProvider?.id ?? null,
      modelId: demoProvider
        ? DEMO_PROVIDER_MODEL ?? null
        : requestedProvider
          ? body.modelId ?? null
          : null,
      // Temporary chats default to memory ENABLED (the two toggles are fully
      // independent — the user can flip either one from the chat menu).
      isTemporary: body.isTemporary ?? false,
      memoryEnabled: body.memoryEnabled ?? true,
      // Carry the unified Access tier into new chats so the user's choice is
      // remembered between conversations.
      bashMode: previousConversation?.bashMode ?? "sandboxed",
      // Use ISO dates consistently — SQLite's CURRENT_TIMESTAMP lacks
      // timezone info and causes inconsistent sort/display behavior
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  return NextResponse.json(row, { status: 201 });
}
