import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

/**
 * Delay tool — waits for a specified number of milliseconds before continuing.
 * Useful for rate-limiting between consecutive tool calls or API requests.
 */
export const delayTool = {
  description:
    "Wait a specified number of milliseconds before continuing. Use to rate-limit between tool calls or wait for external systems to process.",
  inputSchema: z.object({
    ms: z
      .number()
      .int()
      .positive()
      .max(300_000)
      .describe("Milliseconds to wait (max 300,000 = 5 min). 1_000 = 1s, 10_000 = 10s"),
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
