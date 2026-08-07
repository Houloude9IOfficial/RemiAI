import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

/**
 * ask_questions tool — allows the AI to ask the user up to 7 structured
 * questions, each with 2–3 predefined answer choices and an optional custom
 * answer field. The AI presents these questions to the user in a text
 * response, and the user responds naturally in the chat.
 */
export const askQuestionsTool = {
  description:
    "Ask the user up to 20 structured questions at once (single_select, multi_select, or free_text). " +
    "Use to gather multiple specific pieces of information (e.g. tech stack, features, design preferences when setting up a project). " +
    "The user sees the questions in an interactive UI — do NOT repeat them in your response; just ask the user to answer.",

  inputSchema: z.object({
    title: z
      .string()
      .max(200)
      .optional()
      .describe("Optional title for the set of questions (e.g. 'Project Setup')"),
    questions: z
      .array(
        z.object({
          id: z
            .string()
            .min(1)
            .max(50)
            .describe("Unique kebab-case ID (e.g. 'tech-stack')"),
          question: z
            .string()
            .min(1)
            .max(500)
            .describe("The question text — clear and specific"),
          type: z
            .enum(["single_select", "multi_select", "free_text"])
            .default("single_select")
            .describe("Question interaction type"),
          options: z
            .array(z.string().min(1).max(200))
            .max(10)
            .default([])
            .describe("Choices for select questions; leave empty for free_text"),
          allowCustom: z
            .boolean()
            .default(true)
            .describe("Allow a custom answer beyond the predefined options (default: true)"),
        }),
      )
      .min(1)
      .max(20)
      .describe("1 to 20 questions"),
  }),

  execute: async ({
    title,
    questions,
  }: {
    title?: string;
    questions: Array<{
      id: string;
      question: string;
      options: string[];
      allowCustom?: boolean;
      type?: "single_select" | "multi_select" | "free_text";
    }>;
  }) => {
    const questionCount = questions.length;

    return truncateToolResult({
      type: "questions",
      title: title ?? null,
      count: questionCount,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        allowCustom: q.allowCustom ?? true,
        type: q.type ?? "single_select",
      })),
      instruction:
        `Do NOT repeat the questions in your response — the user sees them in an interactive UI. ` +
        `Simply ask the user to answer by clicking options or typing custom answers.`,
    });
  },
};
