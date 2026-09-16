import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

export function buildModeTool(conversationId: number) {
  return {
    description:
      "Switch the conversation between plan and goal mode. Use plan when requirements are unclear and you need to ask or research questions; use goal when the requirements are clear and you are ready to build and verify. The new mode applies to the next user turn.",
    inputSchema: z.object({
      mode: z.enum(["plan", "goal"]).describe("The mode to use on the next user turn"),
      reason: z.string().min(1).max(500).describe("Brief reason for switching modes"),
    }),
    execute: async ({ mode, reason }: { mode: "plan" | "goal"; reason: string }) => {
      await db
        .update(conversations)
        .set({ mode, updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, conversationId));
      return `Mode changed to ${mode}. It will apply on the next user turn. Reason: ${reason}`;
    },
  };
}
