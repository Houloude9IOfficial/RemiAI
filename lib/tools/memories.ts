import { z } from "zod";
import { db, ensureMemoryColumns } from "@/db";
import { memories } from "@/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { truncateToolResult } from "@/lib/utils";
import {
  MEMORY_CATEGORIES,
  MEMORY_DATE_RE,
  normalizeCategory,
  normalizeMemoryDate,
  type MemoryCategory,
} from "@/lib/memory-categories";

function ensureMemoryColumnsIfNeeded(e: unknown): void {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes("no such column") || msg.includes("has no column")) {
    try {
      ensureMemoryColumns();
    } catch {}
  }
}

/**
 * Build memory tools that allow the AI to save and recall structured memories.
 * Each memory has content + category + optional event date (memoryDate).
 */
export function buildMemoryTools(): Record<string, any> {
  const tools: Record<string, any> = {};

  // -----------------------------------------------------------------------
  // remember
  // -----------------------------------------------------------------------
  tools.remember = {
    description:
      "Save a durable fact about the user that persists across ALL conversations. Every memory has a category and an optional event date. Pick the best category from: general, work, personal, health, finance, learning, social, projects, other. Use memoryDate (YYYY-MM-DD) when the fact is tied to a specific date (e.g. started job, diagnosis, trip). If you don't know the date, omit it — the save time is recorded automatically. Call it in the SAME response as your text reply — it does not block your answer. Examples: 'The user loves NodeJS.' (work), 'The user runs 5k every morning.' (health, 2024-03-10).",
    parameters: z.object({
      content: z.string().min(1).max(500).describe("A concise sentence describing what to remember"),
      category: z
        .enum(MEMORY_CATEGORIES)
        .optional()
        .describe("Category for this memory. One of: general, work, personal, health, finance, learning, social, projects, other. Defaults to general."),
      memoryDate: z
        .string()
        .regex(MEMORY_DATE_RE, "Use YYYY-MM-DD")
        .optional()
        .nullable()
        .describe("Optional event date for this memory in YYYY-MM-DD (when it happened / became true). Omit if unknown. Distinct from when it was saved."),
    }),
    execute: async ({
      content,
      category,
      memoryDate,
    }: {
      content: string;
      category?: string;
      memoryDate?: string | null;
    }) => {
      const cat = normalizeCategory(category);
      const md = normalizeMemoryDate(memoryDate);
      try {
        const row = await db
          .insert(memories)
          .values({ content: content.trim(), category: cat as any, memoryDate: md })
          .returning()
          .get();
        return truncateToolResult({
          ok: true,
          id: row.id,
          category: row.category,
          memoryDate: row.memoryDate,
          message: `Saved memory [${row.category}]${row.memoryDate ? ` [${row.memoryDate}]` : ""}: "${row.content}"`,
        });
      } catch (e) {
        ensureMemoryColumnsIfNeeded(e);
        const row = await db
          .insert(memories)
          .values({ content: content.trim(), category: cat as any, memoryDate: md })
          .returning()
          .get();
        return truncateToolResult({
          ok: true,
          id: row.id,
          category: row.category,
          memoryDate: row.memoryDate,
          message: `Saved memory [${row.category}]${row.memoryDate ? ` [${row.memoryDate}]` : ""}: "${row.content}"`,
        });
      }
    },
  };

  // -----------------------------------------------------------------------
  // update_memory
  // -----------------------------------------------------------------------
  tools.update_memory = {
    description:
      "Update an existing memory's text, category, or date. Use after search_memories / get_recent_memories when the user corrects a fact or you need to recategorize / add a date. Only provided fields change.",
    parameters: z.object({
      id: z.number().int().positive().describe("ID of the memory to update"),
      content: z.string().min(1).max(500).optional().describe("New content for the memory"),
      category: z.enum(MEMORY_CATEGORIES).optional().describe("New category"),
      memoryDate: z
        .string()
        .regex(MEMORY_DATE_RE, "Use YYYY-MM-DD")
        .nullable()
        .optional()
        .describe("New event date YYYY-MM-DD, or null to clear it"),
    }),
    execute: async ({
      id,
      content,
      category,
      memoryDate,
    }: {
      id: number;
      content?: string;
      category?: string;
      memoryDate?: string | null;
    }) => {
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (content !== undefined) updates.content = content.trim();
      if (category !== undefined) updates.category = normalizeCategory(category);
      if (memoryDate !== undefined) updates.memoryDate = normalizeMemoryDate(memoryDate);
      if (Object.keys(updates).length === 1) {
        return truncateToolResult({ ok: false, message: "No fields to update." });
      }
      try {
        const row = await db
          .update(memories)
          .set(updates as any)
          .where(eq(memories.id, id))
          .returning()
          .get();
        if (!row) return truncateToolResult({ ok: false, message: `No memory with id ${id}` });
        return truncateToolResult({ ok: true, id: row.id, memory: row, message: `Updated memory #${row.id}` });
      } catch (e) {
        ensureMemoryColumnsIfNeeded(e);
        const row = await db
          .update(memories)
          .set(updates as any)
          .where(eq(memories.id, id))
          .returning()
          .get();
        if (!row) return truncateToolResult({ ok: false, message: `No memory with id ${id}` });
        return truncateToolResult({ ok: true, id: row.id, memory: row, message: `Updated memory #${row.id}` });
      }
    },
  };

  // -----------------------------------------------------------------------
  // get_recent_memories
  // -----------------------------------------------------------------------
  tools.get_recent_memories = {
    description:
      "Get the most recently saved memories about the user (newest first). Optionally filter by category. Use at conversation start or for a quick overview of saved context.",
    parameters: z.object({
      category: z.enum(MEMORY_CATEGORIES).optional().describe("Filter to a single category"),
      limit: z.coerce.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
    }),
    execute: async ({ category, limit }: { category?: string; limit?: number }) => {
      const lim = limit ?? 10;
      try {
        const where = category ? eq(memories.category, category as any) : undefined;
        const rows = await (where
          ? db.select().from(memories).where(where).orderBy(sql`${memories.createdAt} DESC`).limit(lim).all()
          : db.select().from(memories).orderBy(sql`${memories.createdAt} DESC`).limit(lim).all());
        return truncateToolResult({
          count: rows.length,
          memories: rows.map((r) => ({
            id: r.id,
            content: r.content,
            category: (r as any).category ?? "general",
            memoryDate: (r as any).memoryDate ?? null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        });
      } catch (e) {
        ensureMemoryColumnsIfNeeded(e);
        const where = category ? eq(memories.category, category as any) : undefined;
        const rows = await (where
          ? db.select().from(memories).where(where).orderBy(sql`${memories.createdAt} DESC`).limit(lim).all()
          : db.select().from(memories).orderBy(sql`${memories.createdAt} DESC`).limit(lim).all());
        return truncateToolResult({
          count: rows.length,
          memories: rows.map((r) => ({
            id: r.id,
            content: r.content,
            category: (r as any).category ?? "general",
            memoryDate: (r as any).memoryDate ?? null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        });
      }
    },
  };

  // -----------------------------------------------------------------------
  // search_memories
  // -----------------------------------------------------------------------
  tools.search_memories = {
    description:
      "Search your saved memories to recall what you know about the user. Optionally filter by category. Call before answering personal questions or when you need context from past conversations.",
    parameters: z.object({
      query: z.string().min(1).describe("Search query to find relevant memories"),
      category: z.enum(MEMORY_CATEGORIES).optional().describe("Filter to a single category"),
      limit: z.coerce.number().int().min(1).max(50).optional().describe("Max results (default 20)"),
    }),
    execute: async ({
      query,
      category,
      limit,
    }: {
      query: string;
      category?: string;
      limit?: number;
    }) => {
      const lim = limit ?? 20;
      const pattern = `%${query}%`;
      try {
        const filters = [sql`${memories.content} LIKE ${pattern}`];
        if (category) filters.push(eq(memories.category, category as any));
        const where = filters.length === 1 ? filters[0] : and(...(filters as any));
        const rows = await db
          .select()
          .from(memories)
          .where(where)
          .orderBy(memories.createdAt)
          .limit(lim)
          .all();
        return truncateToolResult({
          count: rows.length,
          memories: rows.map((r) => ({
            id: r.id,
            content: r.content,
            category: (r as any).category ?? "general",
            memoryDate: (r as any).memoryDate ?? null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        });
      } catch (e) {
        ensureMemoryColumnsIfNeeded(e);
        const filters = [sql`${memories.content} LIKE ${pattern}`];
        if (category) filters.push(eq(memories.category, category as any));
        const where = filters.length === 1 ? filters[0] : and(...(filters as any));
        const rows = await db
          .select()
          .from(memories)
          .where(where)
          .orderBy(memories.createdAt)
          .limit(lim)
          .all();
        return truncateToolResult({
          count: rows.length,
          memories: rows.map((r) => ({
            id: r.id,
            content: r.content,
            category: (r as any).category ?? "general",
            memoryDate: (r as any).memoryDate ?? null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          })),
        });
      }
    },
  };

  return tools;
}
