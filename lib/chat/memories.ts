import { desc } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/memory-categories";

/**
 * Relevance-based memory retrieval.
 *
 * The old behaviour injected the 10 most recent memories into every system
 * prompt regardless of whether they were relevant to the current request —
 * wasting tokens and drowning out the useful memories. This module instead
 * scores memories against the user's latest message (keyword overlap +
 * recency), dedupes near-identical entries, and returns only what fits inside
 * a hard character budget.
 *
 * Memories that don't make the cut are still reachable on demand via the
 * `search_memories` / `get_recent_memories` tools, so nothing is lost.
 */

/** Hard character budget for the injected memory block (~2k chars ≈ 500 tok). */
export const MEMORY_BUDGET_CHARS = 2000;

/** Never inject more than this many memories regardless of budget. */
export const MEMORY_MAX_ITEMS = 12;

/** Minimum word length to count as a signal token (skips stopwords/noise). */
const MIN_WORD_LEN = 3;

const STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "from", "have", "has", "was", "were",
  "you", "your", "what", "when", "where", "which", "who", "whom", "will",
  "would", "could", "should", "can", "may", "might", "must", "not", "for",
  "but", "are", "all", "any", "about", "into", "them", "they", "their",
  "there", "here", "than", "then", "just", "like", "very", "really", "also",
  "some", "such", "only", "because", "been", "being", "does", "did", "doing",
]);

function significantTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= MIN_WORD_LEN && !STOPWORDS.has(word)) {
      tokens.add(word);
    }
  }
  return tokens;
}

function tokenOverlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) {
    if (b.has(t)) overlap++;
  }
  return overlap / Math.sqrt(a.size * b.size);
}

/** Skip memories that are near-duplicates of an already-selected one. */
function isNearDuplicate(content: string, selected: string[]): boolean {
  const words = significantTokens(content);
  if (words.size < 4) return false;
  for (const existing of selected) {
    const overlap = tokenOverlapScore(words, significantTokens(existing));
    if (overlap > 0.75) return true;
  }
  return false;
}

export interface MemoryRow {
  id: number;
  content: string;
  category: MemoryCategory;
  memoryDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Retrieve the memories most relevant to `query`, capped by a char budget.
 *
 * Ranking: keyword overlap with the query dominates; recency is a light
 * tie-breaker so newer facts surface before older ones at equal relevance.
 * When nothing overlaps (e.g. a brand-new topic), falls back to the most
 * recent memories within budget so the model still has *some* user context.
 */
export async function retrieveRelevantMemories(
  query: string,
  opts: { maxChars?: number; maxItems?: number; category?: MemoryCategory } = {},
): Promise<MemoryRow[]> {
  const maxChars = opts.maxChars ?? MEMORY_BUDGET_CHARS;
  const maxItems = opts.maxItems ?? MEMORY_MAX_ITEMS;

  let rows: MemoryRow[];
  try {
    rows = (await db
      .select()
      .from(memories)
      .orderBy(desc(memories.createdAt))
      .limit(200)
      .all()) as MemoryRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
    if (msg.includes("no such column") || msg.includes("has no column")) {
      const { ensureMemoryColumns } = await import("@/db");
      ensureMemoryColumns();
      rows = (await db
        .select()
        .from(memories)
        .orderBy(desc(memories.createdAt))
        .limit(200)
        .all()) as MemoryRow[];
    } else throw e;
  }

  if (rows.length === 0) return [];

  // Optional server-side category pre-filter (keep scoring but limit pool)
  let pool = rows;
  if (opts.category) {
    const filtered = rows.filter((r) => r.category === opts.category);
    if (filtered.length > 0) pool = filtered;
  }

  const queryTokens = significantTokens(query);
  const scored = pool.map((row, index) => {
    const overlap = tokenOverlapScore(queryTokens, significantTokens(row.content));
    const recency = Math.max(0.6, 1 - index / 250);
    return { row, score: overlap + (queryTokens.size === 0 ? recency : recency * 0.15) };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: MemoryRow[] = [];
  const selectedContents: string[] = [];
  let used = 0;

  for (const { row } of scored) {
    if (selected.length >= maxItems) break;
    if (isNearDuplicate(row.content, selectedContents)) continue;
    // Estimate cost includes category + date prefix
    const prefixLen = row.category !== "general" ? row.category.length + 4 : 0;
    const dateLen = row.memoryDate ? row.memoryDate.length + 3 : 0;
    const cost = row.content.length + 4 + prefixLen + dateLen;
    if (used + cost > maxChars) continue;
    // Normalize missing fields from old DBs
    const normalized: MemoryRow = {
      id: row.id,
      content: row.content,
      category: (row.category as MemoryCategory) ?? "general",
      memoryDate: row.memoryDate ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    selected.push(normalized);
    selectedContents.push(row.content);
    used += cost;
  }

  return selected;
}

/** Format a single memory line for the prompt / export. */
export function formatMemoryLine(m: MemoryRow | { content: string; memoryDate?: string | null; category?: string }): string {
  const date = (m as any).memoryDate ?? null;
  const cat = (m as any).category ?? "general";
  const showCat = cat !== "general";
  const datePart = date ? `[${date}]` : "";
  const catPart = showCat ? `[${cat}]` : "";
  const prefix = [datePart, catPart].filter(Boolean).join(" ");
  return prefix ? `- ${prefix} ${m.content}` : `- ${m.content}`;
}

/** Group memories by category in MEMORY_CATEGORIES order and render. */
export function formatGroupedMemories(memories: MemoryRow[]): string {
  if (memories.length === 0) return "";
  const byCat = new Map<string, MemoryRow[]>();
  for (const m of memories) {
    const cat = m.category ?? "general";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(m);
  }
  const orderedCats = MEMORY_CATEGORIES.filter((c) => byCat.has(c));
  // Include any unexpected categories at the end
  for (const c of byCat.keys()) if (!orderedCats.includes(c as any)) orderedCats.push(c as any);

  if (orderedCats.length === 1) {
    // Single category — compact list (no headings)
    return memories.map(formatMemoryLine).join("\n");
  }
  const sections: string[] = [];
  for (const cat of orderedCats) {
    const group = byCat.get(cat)!;
    const heading = cat.charAt(0).toUpperCase() + cat.slice(1);
    sections.push(`### ${heading}\n${group.map(formatMemoryLine).join("\n")}`);
  }
  return sections.join("\n\n");
}

export function buildMemoryPromptBlock(memories: MemoryRow[]): string {
  if (memories.length === 0) return "";
  const body = formatGroupedMemories(memories);
  return `\n\n## Saved memories\nThings you have remembered about the user across conversations, grouped by category and ranked by relevance to the current request. Use them to personalize responses. Dates in [YYYY-MM-DD] are event dates (when the fact became true); if absent, the memory's save time is the only date.\n${body}`;
}
