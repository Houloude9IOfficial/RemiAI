import { z } from "zod";

/**
 * Gives the next uninterrupted batch of work a human-readable label. The UI
 * consumes this metadata and does not render it as a separate tool card.
 */
export const setRunNameTool = {
  description: "Set a short, user-facing name for the tool-call batch you are about to perform. Call this once immediately before a consecutive run of tools, without assistant text between calls. Use an active, specific phrase such as 'Creating the main README file' or 'Checking the authentication flow'.",
  inputSchema: z.object({
    name: z.string().min(3).max(120).describe("Short, plain-language description of this batch of work."),
  }),
  execute: async ({ name }: { name: string }) => ({ type: "run_name", name }),
};
