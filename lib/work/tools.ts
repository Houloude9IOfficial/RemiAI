import { z } from "zod";
import { submitWorkPlan } from "@/lib/work/runs";

/** The only write permitted during the Work planning gate: a versioned plan artifact. */
export function buildWorkPlanTool(conversationId: number, runId: number) {
  return {
    description: "Submit the complete Markdown implementation plan for the active Work run. This saves a versioned session artifact and moves the run to explicit user approval.",
    inputSchema: z.object({ markdown: z.string().min(80).max(100_000) }),
    execute: async ({ markdown }: { markdown: string }) => {
      try {
        const run = await submitWorkPlan(conversationId, runId, markdown);
        return { ok: true, runId: run.id, phase: run.phase, planPath: run.planPath, revision: run.planRevision, message: "Plan saved. Wait for explicit approval." };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save Work plan." }; }
    },
  };
}
