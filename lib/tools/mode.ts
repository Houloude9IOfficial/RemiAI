import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

type SwitchableMode = "chat" | "instant" | "goal" | "plan" | "build";

function normalizeMode(mode: SwitchableMode | "code"): SwitchableMode {
  return mode === "code" ? "build" : mode;
}

export function buildModeTool(
  conversationId: number,
  onModeChange?: (mode: SwitchableMode) => void,
) {
  return {
    description:
      "Switch the conversation between normal, instant, plan, goal, and build modes. Use instant for fast concise answers, plan when requirements are unclear, goal when executing autonomously, and build/code when implementing and verifying file changes. The new mode applies immediately to the current run and following turns.",
    inputSchema: z.object({
      mode: z
        .enum(["chat", "instant", "plan", "goal", "build", "code"])
        .describe("The mode to use: chat/normal, instant, plan, goal, build, or code"),
      reason: z.string().min(1).max(500).describe("Brief reason for switching modes"),
    }),
    execute: async ({ mode: requestedMode, reason }: { mode: SwitchableMode | "code"; reason: string }) => {
      const mode = normalizeMode(requestedMode);
      const current = await db
        .select({ mode: conversations.mode })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .get();
      const fromMode = (current?.mode as SwitchableMode | undefined) ?? "chat";
      const changed = fromMode !== mode;

      if (changed) {
        await db
          .update(conversations)
          .set({ mode, updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conversationId));
        onModeChange?.(mode);
      }

      return {
        type: "mode_transition",
        fromMode,
        mode,
        changed,
        reason,
        appliesOn: "this_and_next_turns",
      };
    },
  };
}
