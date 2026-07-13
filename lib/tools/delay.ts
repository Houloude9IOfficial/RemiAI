import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

/**
 * Delay tool — waits for a specified number of milliseconds before continuing.
 * Useful for rate-limiting between consecutive tool calls or API requests.
 */
export const delayTool = {
  description:
    "Wait for a specified number of milliseconds before continuing. Use this to add delays between consecutive tool calls or API requests when you need to rate-limit yourself, wait for external systems to process data, or respect service rate limits.",
  inputSchema: z.object({
    ms: z
      .number()
      .int()
      .positive()
      .max(300_000)
      .describe(
        "Number of milliseconds to wait (max 300,000 = 5 minutes). Use 1_000 for 1 second, 10_000 for 10 seconds, etc.",
      ),
  }),
  execute: async ({ ms }: { ms: number }) => {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, ms));
    const actual = Date.now() - start;
    return truncateToolResult({
      waited: `${ms}ms`,
      actual: `${actual}ms`,
      note: `Waited for ${actual} milliseconds as requested.`,
    });
  },
};
