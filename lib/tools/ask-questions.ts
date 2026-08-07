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
    "Ask the user up to 20 structured questions at once, using single_select, multi_select, or free_text prompts. " +
    "Use this when you need to gather multiple specific pieces of information from the user in a structured way — for example, " +
    "when setting up a project you can ask about tech stack, features, design preferences, etc. " +
    "After calling this tool, present the questions to the user in your response and wait for their answers. " +
    "Each question can have up to 3 predefined options plus the ability for the user to provide their own custom answer." +
    "Do NOT repeat the questions in your response — the user sees them in an interactive UI. " +
    "Simply ask the user to answer by clicking options or typing custom answers.",

  inputSchema: z.object({
    title: z
      .string()
      .max(200)
      .optional()
      .describe(
        "Optional title or heading for the set of questions. E.g. 'Project Setup', 'Preferences', or empty for none.",
      ),
    questions: z
      .array(
        z.object({
          id: z
            .string()
            .min(1)
            .max(50)
            .describe(
              "Unique identifier for this question. Use a short kebab-case key like 'tech-stack' or 'design-style'.",
            ),
          question: z
            .string()
            .min(1)
            .max(500)
            .describe(
              "The question text to present to the user. Be clear and specific.",
            ),
          type: z
            .enum(["single_select", "multi_select", "free_text"])
            .default("single_select")
            .describe("Question interaction type."),
          options: z
            .array(z.string().min(1).max(200))
            .max(10)
            .default([])
            .describe(
              "Choices for select questions; leave empty for free_text.",
            ),
          allowCustom: z
            .boolean()
            .default(true)
            .describe(
              "Whether to allow the user to provide their own custom answer instead of the predefined options (default: true).",
            ),
        }),
      )
      .min(1)
      .max(20)
      .describe(
        "Array of 1 to 20 questions.",
      ),
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
