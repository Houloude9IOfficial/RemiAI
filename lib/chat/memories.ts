import { desc } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

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

interface MemoryRow {
  id: number;
  content: string;
  createdAt: string | null;
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
  opts: { maxChars?: number; maxItems?: number } = {},
): Promise<MemoryRow[]> {
  const maxChars = opts.maxChars ?? MEMORY_BUDGET_CHARS;
  const maxItems = opts.maxItems ?? MEMORY_MAX_ITEMS;

  const rows = (await db
    .select()
    .from(memories)
    .orderBy(desc(memories.createdAt))
    .limit(200)
    .all()) as MemoryRow[];

  if (rows.length === 0) return [];

  const queryTokens = significantTokens(query);
  const scored = rows.map((row, index) => {
    const overlap = tokenOverlapScore(queryTokens, significantTokens(row.content));
    // Recency weight: newest (index 0) gets 1.0, decaying to ~0.6 at row 100.
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
    const cost = row.content.length + 4; // " - " prefix
    // Skip memories that don't fit — a shorter, lower-scored one later in the
    // list may still fit, so keep scanning rather than stopping outright.
    if (used + cost > maxChars) continue;
    selected.push(row);
    selectedContents.push(row.content);
    used += cost;
  }

  return selected;
}
