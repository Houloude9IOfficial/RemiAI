import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

/**
 * suggest_followups tool — allows the AI to suggest followup questions
 * that appear as clickable chips at the bottom of the response.
 * The user can click any suggestion to send it as a new message.
 *
 * Use this when you've answered a question and want to offer natural
 * next steps, deeper exploration, or related topics.
 */
export const suggestFollowupsTool = {
  description:
    "Suggest 2–6 followup questions the user might want to ask next. " +
    "These appear as clickable chips at the bottom of your response. " +
    "Use this after answering a question — offer natural next steps, " +
    "deeper exploration, or related topics the user might find useful. " +
    "Each suggestion should be a complete question the user can send as-is.",

  inputSchema: z.object({
    suggestions: z
      .array(
        z
          .string()
          .min(1)
          .max(300)
          .describe(
            "A complete question or prompt the user could send as their next message. " +
            "Make each suggestion self-contained and useful on its own. " +
            "Examples: 'What is a closure in JavaScript?', 'Show me an example', " +
            "'How do I optimize React performance?'",
          ),
      )
      .min(2)
      .max(6)
      .describe(
        "2–6 followup questions or prompts the user might want to ask. " +
        "Each should be a complete sentence the user can click and send as-is.",
      ),
  }),

  execute: async ({
    suggestions,
  }: {
    suggestions: string[];
  }) => {
    return truncateToolResult({
      type: "suggestions",
      count: suggestions.length,
      suggestions: suggestions.map((s) => ({
        text: s,
      })),
    });
  },
};
