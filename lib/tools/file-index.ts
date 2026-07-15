import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";
import { queryRecentChanges, queryFileIndex } from "@/lib/fs/file-index";

/**
 * Build file index tools that allow the AI to query recent file changes
 * and search the file index by path.
 */
export function buildFileIndexTools(): Record<string, any> {
  const tools: Record<string, any> = {};

  // -----------------------------------------------------------------------
  // query_recent_changes
  // -----------------------------------------------------------------------
  tools.query_recent_changes = {
    description:
      "Get recently changed files across all watched directories. Returns files that have been modified, added, or deleted, sorted by most recent first. Use this to discover what files the user has been working on recently, or to check for new files that were created outside the chat session. Limit the result count for a quick overview.",
    parameters: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Maximum number of recent changes to return (default 20, max 100)."),
    }),
    execute: async ({ limit }: { limit?: number | null }) => {
      const changes = await queryRecentChanges(limit ?? 20);
      return truncateToolResult({
        count: changes.length,
        changes: changes.map((c) => ({
          directory: c.directoryLabel,
          path: c.relativePath,
          changeType: c.changeType,
          fileSize: c.fileSize,
          changedAt: c.changedAt,
        })),
      });
    },
  };

  // -----------------------------------------------------------------------
  // query_file_index
  // -----------------------------------------------------------------------
  tools.query_file_index = {
    description:
      "Search the file index by path pattern. Finds indexed files whose relative path contains the given search term. Use this to quickly locate files by name or path fragment without needing to know which directory root they're in.",
    parameters: z.object({
      pattern: z
        .string()
        .min(1)
        .describe("Search pattern to match against file paths (case-sensitive, partial match)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe("Maximum results to return (default 50, max 200)."),
    }),
    execute: async ({ pattern, limit }: { pattern: string; limit?: number | null }) => {
      const results = await queryFileIndex(undefined, pattern, limit ?? 50);
      return truncateToolResult({
        count: results.length,
        files: results.map((f) => ({
          directoryId: f.directoryId,
          relativePath: f.relativePath,
          fileSize: f.fileSize,
          updatedAt: f.updatedAt,
        })),
      });
    },
  };

  return tools;
}
