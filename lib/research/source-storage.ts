import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceClaims, sources } from "@/db/schema";

type SourceStatus = "available" | "partial" | "failed";
type ExtractionStatus = "complete" | "partial" | "failed" | "unavailable";

type SourceCandidate = {
  url: string;
  title?: string | null;
  publisher?: string | null;
  content?: string | null;
  publishedAt?: string | null;
  sourceType?: "web" | "news" | "local" | "other";
  extractionStatus?: ExtractionStatus;
  status?: SourceStatus;
};

export type SourceRecordInput = {
  conversationId: number;
  sourceRunId?: string;
  toolName: string;
  candidate: SourceCandidate;
};

export type SourceProvenanceOptions = {
  conversationId: number;
  sourceRunId?: string;
};

const SENSITIVE_QUERY_KEY_RE = /^(?:api[-_]?key|key|token|secret|password|signature|sig|auth)$/i;

/** Remove credentials and common secret query parameters before persisting a URL. */
export function sanitizeSourceUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  try {
    const parsed = new URL(value, "http://remiai.local");
    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY_RE.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hash = "";
    if (parsed.origin === "http://remiai.local" && !/^https?:\/\//i.test(value)) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return value.slice(0, 2_000);
  }
}

function publisherFromUrl(url: string): string {
  try {
    return new URL(url, "http://remiai.local").hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function contentHash(content: string | null | undefined): string {
  if (!content) return "";
  return createHash("sha256").update(content).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function candidateFromRecord(
  record: Record<string, unknown>,
  fallbackType: SourceCandidate["sourceType"],
): SourceCandidate | null {
  const url = stringValue(record.url);
  if (!url || !/^https?:\/\//i.test(url) && !url.startsWith("/api/")) return null;

  const metadata = isRecord(record.metadata) ? record.metadata : null;
  const title =
    stringValue(record.title) ??
    stringValue(metadata?.title) ??
    stringValue(record.name);
  const publisher =
    stringValue(record.publisher) ??
    stringValue(record.source) ??
    stringValue(metadata?.publisher) ??
    stringValue(metadata?.siteName);
  const content =
    stringValue(record.content) ??
    stringValue(record.markdown) ??
    stringValue(record.description);
  const publishedAt =
    stringValue(record.publishedAt) ??
    stringValue(metadata?.publishedAt) ??
    stringValue(record.age);
  const isError = Boolean(record.error);

  return {
    url,
    title,
    publisher,
    content,
    publishedAt,
    sourceType: url.startsWith("/api/") ? "local" : fallbackType,
    extractionStatus: isError
      ? "failed"
      : content
        ? record.truncated || record._truncated
          ? "partial"
          : "complete"
        : "unavailable",
    status: isError ? "failed" : content ? "available" : "partial",
  };
}

/** Extract only URL-bearing records from structured search/fetch output. */
export function extractSourceCandidates(
  toolName: string,
  input: unknown,
  output: unknown,
): SourceCandidate[] {
  const fallbackType: SourceCandidate["sourceType"] =
    toolName.startsWith("news_") ? "news" : "web";
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();

  const add = (candidate: SourceCandidate | null) => {
    if (!candidate) return;
    const url = sanitizeSourceUrl(candidate.url);
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ ...candidate, url });
  };

  const walk = (value: unknown, depth: number) => {
    if (depth > 5 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    add(candidateFromRecord(value, fallbackType));
    for (const child of Object.values(value)) walk(child, depth + 1);
  };

  walk(output, 0);

  // A failed web_fetch still represents an attempted source and should be
  // visible as failed provenance rather than disappearing from the graph.
  if (candidates.length === 0 && toolName === "web_fetch" && isRecord(input)) {
    const inputUrl = stringValue(input.url);
    if (inputUrl) {
      add({
        url: inputUrl,
        sourceType: inputUrl.startsWith("/api/") ? "local" : "web",
        extractionStatus: "failed",
        status: "failed",
      });
    }
  }

  return candidates;
}

function freshnessStatus(
  publishedAt: string | null | undefined,
  retrievedAt: string,
): "fresh" | "stale" | "unknown" {
  if (!publishedAt) return "unknown";
  const publishedMs = Date.parse(publishedAt);
  const retrievedMs = Date.parse(retrievedAt);
  if (!Number.isFinite(publishedMs) || !Number.isFinite(retrievedMs)) return "unknown";
  const ageDays = Math.max(0, retrievedMs - publishedMs) / (24 * 60 * 60 * 1000);
  return ageDays <= 30 ? "fresh" : "stale";
}

function qualityScore(candidate: SourceCandidate, url: string): number {
  let score = 0;
  if (/^https:\/\//i.test(url)) score += 20;
  if (candidate.title?.trim()) score += 20;
  if (candidate.publisher?.trim()) score += 20;
  if (candidate.content?.trim()) score += 30;
  if (candidate.status === "available") score += 10;
  return score;
}

export async function saveSource(
  database: typeof db,
  input: SourceRecordInput,
) {
  const url = sanitizeSourceUrl(input.candidate.url);
  const now = new Date().toISOString();
  const existing = await database
    .select()
    .from(sources)
    .where(
      and(
        eq(sources.conversationId, input.conversationId),
        eq(sources.url, url),
      ),
    )
    .orderBy(desc(sources.updatedAt))
    .get();

  const values = {
    sourceRunId: input.sourceRunId ?? null,
    toolName: input.toolName,
    sourceType: input.candidate.sourceType ?? "web",
    title: input.candidate.title?.trim() || url,
    publisher:
      input.candidate.publisher?.trim() || publisherFromUrl(url),
    retrievedAt: now,
    publishedAt: input.candidate.publishedAt ?? null,
    qualityScore: qualityScore(input.candidate, url),
    freshnessStatus: freshnessStatus(input.candidate.publishedAt, now),
    contentHash: contentHash(input.candidate.content),
    extractionStatus: input.candidate.extractionStatus ?? "unavailable",
    status: input.candidate.status ?? "partial",
    metadata: {
      hasContent: Boolean(input.candidate.content),
    },
    updatedAt: now,
  } as const;

  if (existing) {
    return database
      .update(sources)
      .set(values)
      .where(eq(sources.id, existing.id))
      .returning()
      .get();
  }

  return database
    .insert(sources)
    .values({
      conversationId: input.conversationId,
      url,
      ...values,
      createdAt: now,
    })
    .returning()
    .get();
}

export async function recordToolSources(
  input: SourceProvenanceOptions & {
    toolName: string;
    toolInput: unknown;
    toolOutput: unknown;
  },
): Promise<Array<{
  id: number;
  url: string;
  title: string;
  status: SourceStatus;
  qualityScore: number;
  freshnessStatus: "fresh" | "stale" | "unknown";
}>> {
  const candidates = extractSourceCandidates(
    input.toolName,
    input.toolInput,
    input.toolOutput,
  );
  const records = await Promise.all(
    candidates.map((candidate) =>
      saveSource(db, {
        conversationId: input.conversationId,
        sourceRunId: input.sourceRunId,
        toolName: input.toolName,
        candidate,
      }),
    ),
  );
  return records.map((record) => ({
    id: record.id,
    url: record.url,
    title: record.title,
    status: record.status,
    qualityScore: record.qualityScore,
    freshnessStatus: record.freshnessStatus,
  }));
}

/** Wrap a research tool without changing its schema or execution contract. */
export function withSourceProvenance<T extends object & { execute?: unknown }>(
  tool: T,
  toolName: string,
  options: SourceProvenanceOptions,
): T {
  const execute = tool.execute;
  if (typeof execute !== "function") return tool;

  return {
    ...tool,
    execute: async (input: unknown) => {
      const output = await (execute as (value: unknown) => Promise<unknown>)(input);
      try {
        const sourceRecords = await recordToolSources({
          ...options,
          toolName,
          toolInput: input,
          toolOutput: output,
        });
        if (sourceRecords.length === 0) return output;
        if (isRecord(output)) {
          return {
            ...output,
            sources: sourceRecords,
          };
        }
        return { result: output, sources: sourceRecords };
      } catch (error) {
        // Provenance is best effort and must not turn a successful research
        // tool call into a failed model step.
        console.warn("[research] Failed to persist source provenance:", error);
        return output;
      }
    },
  } as T;
}

export function listConversationSources(conversationId: number) {
  return db
    .select()
    .from(sources)
    .where(eq(sources.conversationId, conversationId))
    .orderBy(desc(sources.updatedAt), desc(sources.id))
    .all();
}

function citationUrls(text: string): string[] {
  const urls = new Set<string>();
  const markdown = /\[[^\]]+\]\((https?:\/\/[^)\s]+|\/api\/[^)\s]+)\)/g;
  const bare = /(?<![\w"'=])(https?:\/\/[^\s)<>]+|\/api\/chat\/\d+\/session-files\/[^\s)<>]+)/g;
  for (const match of text.matchAll(markdown)) urls.add(sanitizeSourceUrl(match[1]));
  for (const match of text.matchAll(bare)) urls.add(sanitizeSourceUrl(match[1]));
  return [...urls];
}

function claimSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((claim) => claim.replace(/\s+/g, " ").trim())
    .filter((claim) => claim.length >= 20)
    .slice(0, 100);
}

/** Persist lightweight claim-to-source links from a completed research answer. */
export async function recordCitedClaims(input: {
  conversationId: number;
  sourceRunId?: string;
  answerText: string;
  database?: typeof db;
}) {
  const database = input.database ?? db;
  const availableSources = await database
    .select({ id: sources.id, url: sources.url, status: sources.status })
    .from(sources)
    .where(eq(sources.conversationId, input.conversationId))
    .all();
  const byUrl = new Map(availableSources.map((source) => [source.url, source]));
  const claims = claimSentences(input.answerText);
  const inserted: Array<{ id: number; supportStatus: string }> = [];
  const seen = new Set<string>();

  for (const rawClaim of claims) {
    const claimText = rawClaim
      .replace(/\[([^\]]+)\]\((?:https?:\/\/[^)\s]+|\/api\/[^)\s]+)\)/g, "$1")
      .replace(/https?:\/\/[^\s)<>]+|\/api\/chat\/\d+\/session-files\/[^\s)<>]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(claimText)) continue;
    seen.add(claimText);
    const ids = citationUrls(rawClaim)
      .map((url) => byUrl.get(url)?.id)
      .filter((id): id is number => typeof id === "number");
    const citedSources = ids.map((id) => availableSources.find((source) => source.id === id));
    const supportStatus = ids.length === 0
      ? "unsupported"
      : citedSources.every((source) => source?.status === "available")
        ? "supported"
        : "partial";
    const row = await database
      .insert(sourceClaims)
      .values({
        conversationId: input.conversationId,
        sourceRunId: input.sourceRunId ?? null,
        claimText,
        sourceIds: ids,
        supportStatus,
      })
      .returning({ id: sourceClaims.id, supportStatus: sourceClaims.supportStatus })
      .get();
    if (row) inserted.push(row);
  }

  return inserted;
}

export function listConversationClaims(conversationId: number) {
  return db
    .select()
    .from(sourceClaims)
    .where(eq(sourceClaims.conversationId, conversationId))
    .orderBy(desc(sourceClaims.createdAt), desc(sourceClaims.id))
    .all();
}
