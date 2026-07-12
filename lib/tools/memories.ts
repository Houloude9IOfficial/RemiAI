import { z } from "zod";
import { db } from "@/db";
import { memories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { truncateToolResult } from "@/lib/utils";

/**
 * Build memory tools that allow the AI to save and recall memories.
 * Memories are short sentences that persist across conversations.
 */
export function buildMemoryTools(): Record<string, any> {
  const tools: Record<string, any> = {};

  // -----------------------------------------------------------------------
  // remember
  // -----------------------------------------------------------------------
  tools.remember = {
    description:
      "CRITICAL: Save a memory about the user that persists across ALL conversations. You MUST call this whenever the user shares a personal preference, fact about themselves, opinion, profession, hobby, or anything worth remembering. Call it in the SAME response as your text reply — it does not block your answer. Examples: 'The user loves NodeJS.', 'The user works as a designer.', 'The user prefers concise answers.'",
    parameters: z.object({
      content: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "A concise sentence describing what to remember. E.g. 'The user prefers concise code examples.' or 'User is working on a Next.js project about AI agents.'",
        ),
    }),
    execute: async ({ content }: { content: string }) => {
      const row = await db
        .insert(memories)
        .values({ content: content.trim() })
        .returning()
        .get();

      return truncateToolResult({
        ok: true,
        id: row.id,
        message: `Saved memory: "${row.content}"`,
      });
    },
  };

  // -----------------------------------------------------------------------
  // get_recent_memories
  // -----------------------------------------------------------------------
  tools.get_recent_memories = {
    description:
      "Get the most recently saved memories about the user. Returns the last 10 memories, newest first. Use this at the start of a conversation to remind yourself what you know about the user, or whenever you need a quick overview of saved context.",
    parameters: z.object({}),
    execute: async () => {
      const rows = await db
        .select()
        .from(memories)
        .orderBy(sql`${memories.createdAt} DESC`)
        .limit(10)
        .all();

      return truncateToolResult({
        count: rows.length,
        memories: rows.map((r) => ({
          id: r.id,
          content: r.content,
          createdAt: r.createdAt,
        })),
      });
    },
  };

  // -----------------------------------------------------------------------
  // search_memories
  // -----------------------------------------------------------------------
  tools.search_memories = {
    description:
      "CRITICAL: Search your saved memories to recall what you know about the user. You MUST call this before answering personal questions to provide contextually relevant responses. Returns matching memories sorted by oldest first. Call this whenever the user seems familiar or you need context from past conversations.",
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe("Search query to find relevant memories"),
    }),
    execute: async ({ query }: { query: string }) => {
      const pattern = `%${query}%`;
      const rows = await db
        .select()
        .from(memories)
        .where(sql`${memories.content} LIKE ${pattern}`)
        .orderBy(memories.createdAt)
        .all();

      return truncateToolResult({
        count: rows.length,
        memories: rows.map((r) => ({
          id: r.id,
          content: r.content,
          createdAt: r.createdAt,
        })),
      });
    },
  };

  return tools;
}
