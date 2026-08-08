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
    "Suggest 2–6 followup questions the user might want to ask next, shown as clickable chips below your response. " +
    "Use after answering a question to offer natural next steps. Call at most once per response. " +
    "Never include meta-questions like 'What do you want to do next?' — every suggestion must be specific and actionable.",

  inputSchema: z.object({
    suggestions: z
      .array(
        z
          .string()
          .min(1)
          .max(300)
          .describe(
            "A complete, self-contained question the user could send as-is. " +
            "Never meta-questions like 'What do you want to do next?' — be specific and actionable.",
          ),
      )
      .min(2)
      .max(6)
      .describe("2–6 followup questions the user might want to ask (complete sentences, clickable as-is)"),
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
