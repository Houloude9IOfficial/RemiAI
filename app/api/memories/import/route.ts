import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";
import { MEMORY_CATEGORIES, MEMORY_DATE_RE } from "@/lib/memory-categories";
import { normalizeImportedMemory } from "@/lib/memory-import";

const schema = z.object({ memories: z.array(z.object({
  content: z.string().min(1).max(500),
  category: z.enum(MEMORY_CATEGORIES).default("general"),
  memoryDate: z.string().regex(MEMORY_DATE_RE).nullable().default(null),
})) });

async function resolveModel() {
  const preferred = await db.select({ provider: providers, modelId: providerModels.modelId })
    .from(providerModels).innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(eq(providerModels.enabled, true), eq(providerModels.isDefault, true))).get();
  if (preferred) return preferred;
  const fallback = await db.select({ provider: providers, modelId: providerModels.modelId })
    .from(providerModels).innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(eq(providerModels.enabled, true), eq(providers.enabled, true))).get();
  return fallback ?? null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return NextResponse.json({ error: "Paste an export to import." }, { status: 400 });
  if (text.length > 100_000) return NextResponse.json({ error: "This export is too large. Split it into smaller imports." }, { status: 413 });
  const selected = await resolveModel();
  if (!selected) return NextResponse.json({ error: "Configure an enabled AI model before importing memories." }, { status: 400 });

  try {
    const model = getLanguageModel(selected.provider, selected.modelId, "medium");
    const chunks = text.length <= 24_000 ? [text] : text.match(/[\s\S]{1,24000}(?:\n|$)/g) ?? [text];
    const results = await Promise.all(chunks.map((chunk) => generateObject({
      model,
      schema,
      system: "Extract only durable user memories from a RemiAI migration export. Ignore headings, instructions, summaries, and transient context. Preserve wording, normalize categories, and use null for unknown or invalid dates.",
      prompt: chunk,
    })));
    const seen = new Set<string>();
    const memories = results.flatMap((result) => result.object.memories.map(normalizeImportedMemory).filter(Boolean)).filter((memory) => {
      if (!memory) return false;
      const key = `${memory.category}|${memory.memoryDate ?? ""}|${memory.content.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return NextResponse.json({ memories });
  } catch (error) {
    console.error("[memories import] extraction failed", error);
    return NextResponse.json({ error: "The AI could not parse this export. Check the format and try again." }, { status: 502 });
  }
}
