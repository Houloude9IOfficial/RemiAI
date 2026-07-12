import { NextResponse } from "next/server";
import { db } from "@/db";
import { providers } from "@/db/schema";
import { providerCreateSchema } from "@/lib/validation/schemas";
import { jsonError } from "@/lib/validation/api";
import { maskProvider } from "@/lib/providers/mask";

export async function GET() {
  const rows = await db.select().from(providers).orderBy(providers.createdAt);
  return NextResponse.json(rows.map(maskProvider));
}

export async function POST(req: Request) {
  let body: ReturnType<typeof providerCreateSchema.parse>;
  try {
    body = providerCreateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  if ((body.kind === "ollama" || body.kind === "openai-compatible") && !body.baseUrl) {
    return NextResponse.json(
      { error: "A base URL is required for this provider kind" },
      { status: 400 },
    );
  }

  const row = await db
    .insert(providers)
    .values({
      kind: body.kind,
      isPreset: body.isPreset,
      label: body.label,
      baseUrl: body.baseUrl ?? null,
      apiKey: body.apiKey ?? null,
    })
    .returning()
    .get();

  return NextResponse.json(maskProvider(row), { status: 201 });
}
