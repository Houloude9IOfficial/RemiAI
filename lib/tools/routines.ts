import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { routines, routineLogs, toolConfigs } from "@/db/schema";
import { truncateToolResult } from "@/lib/utils";
import { executeRoutine } from "@/lib/routines/runner";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatRoutineList(
  items: Array<{
    id: number;
    name: string;
    description: string;
    enabled: boolean;
    lastRun?: string | null;
    lastStatus?: string | null;
  }>,
): string {
  const lines = items.map((a) => {
    const last = a.lastRun
      ? ` — last run: ${a.lastStatus ?? "unknown"} at ${a.lastRun}`
      : " — never run";
    return `- **${a.name}**: ${a.description}${last}`;
  });
  return lines.length > 0
    ? `## Available routines\n\n${lines.join("\n")}`
    : "No routines have been created yet.";
}

/**
 * Get the latest log entry for a routine (for status display).
 */
async function getLastLog(
  routineId: number,
): Promise<{ status: string | null; completedAt: string | null } | null> {
  const log = await db
    .select()
    .from(routineLogs)
    .where(eq(routineLogs.routineId, routineId))
    .orderBy(desc(routineLogs.startedAt))
    .limit(1)
    .get();
  return log
    ? { status: log.status, completedAt: log.completedAt }
    : null;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/**
 * Create a new routine — a named JavaScript script that can be run later
 * (manually by the AI or from the settings panel).
 */
export const createRoutineTool = {
  description: `Create a named JavaScript routine saved to the routine library for later on-demand runs (persists across conversations). Runs in an isolated sandbox with console.log() output and top-level await. The user can also view/run it in Settings > Routines.`,

  parameters: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9_-]+$/, "Name must be kebab-case (lowercase, numbers, hyphens, underscores)")
      .describe("Unique kebab-case name (e.g. 'check_uptime', 'deploy_staging')"),
    description: z
      .string()
      .max(500)
      .optional()
      .default("")
      .describe("Human-readable description of what the routine does"),
    code: z
      .string()
      .min(1)
      .describe("JavaScript code; console.log() for output; top-level await supported"),
  }),

  execute: async ({
    name,
    description,
    code,
  }: {
    name: string;
    description?: string;
    code: string;
  }) => {
    // Check if routine with this name already exists
    const existing = await db
      .select()
      .from(routines)
      .where(eq(routines.name, name))
      .get();

    if (existing) {
      return truncateToolResult({
        type: "routine_error",
        error: `A routine named "${name}" already exists. Use update_routine to modify it or choose a different name.`,
      });
    }

    const now = new Date().toISOString();
    const routine = await db
      .insert(routines)
      .values({
        name,
        description: description ?? "",
        code,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return truncateToolResult({
      type: "routine_created",
      routine: {
        id: routine.id,
        name: routine.name,
        description: routine.description,
        enabled: routine.enabled,
      },
      message: `Routine "${routine.name}" created successfully.`,
    });
  },
};

/**
 * Run a routine by name immediately and get its output.
 */
function buildRunRoutineTool(conversationId?: number) {
  const runRoutineTool = {
  description: `Execute a saved routine by name and return its result (stdout, stderr, exit code, duration).`,

  parameters: z.object({
    name: z
      .string()
      .min(1)
      .describe("Name of the routine to run (e.g. 'check_uptime')"),
    timeout: z
      .number()
      .int()
      .positive()
      .max(120_000)
      .optional()
      .default(30_000)
      .describe("Timeout in ms (default: 30s, max: 120s)"),
  }),

  execute: async ({
    name,
    timeout,
  }: {
    name: string;
    timeout?: number;
  }) => {
    const routine = await db
      .select()
      .from(routines)
      .where(eq(routines.name, name))
      .get();

    if (!routine) {
      return truncateToolResult({
        type: "routine_error",
        error: `No routine found with name "${name}". Use list_routines to see all available routines.`,
      });
    }

    const { result, automationRunId } = await executeRoutine(routine.id, timeout ?? 30_000, {
      conversationId,
    });

    return truncateToolResult({
      type: "routine_result",
      routine_name: routine.name,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      duration: `${result.durationMs}ms`,
      automation_run_id: automationRunId ?? null,
    });
  },
  };
  return runRoutineTool;
}

/**
 * List all saved routines with their status.
 */
export const listRoutinesTool = {
  description: `List all saved routines with descriptions and last run status.`,

  parameters: z.object({}).describe("List all saved routines"),

  execute: async () => {
    const allRoutines = await db
      .select()
      .from(routines)
      .orderBy(routines.name)
      .all();

    // Enrich with last run info
    const enriched = await Promise.all(
      allRoutines.map(async (r) => {
        const lastLog = await getLastLog(r.id);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          enabled: r.enabled,
          lastRun: lastLog?.completedAt ?? null,
          lastStatus: lastLog?.status ?? null,
          codeLength: r.code.length,
        };
      }),
    );

    return truncateToolResult({
      type: "routine_list",
      count: enriched.length,
      routines: enriched,
      summary: formatRoutineList(enriched),
    });
  },
};

/**
 * Update an existing routine's code, description, or name.
 */
export const updateRoutineTool = {
  description: `Update an existing routine's code, description, name, or enabled state. All fields optional — only provided fields are updated.`,

  parameters: z.object({
    name: z
      .string()
      .min(1)
      .describe("Name of the routine to update"),
    newName: z
      .string()
      .max(100)
      .regex(/^[a-z0-9_-]+$/, "Name must be kebab-case (lowercase, numbers, hyphens, underscores)")
      .optional()
      .describe("Optionally rename the routine"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("New description"),
    code: z
      .string()
      .min(1)
      .optional()
      .describe("New JavaScript code"),
    enabled: z
      .boolean()
      .optional()
      .describe("Whether the routine is enabled"),
  }),

  execute: async ({
    name,
    newName,
    description,
    code,
    enabled,
  }: {
    name: string;
    newName?: string;
    description?: string;
    code?: string;
    enabled?: boolean;
  }) => {
    const routine = await db
      .select()
      .from(routines)
      .where(eq(routines.name, name))
      .get();

    if (!routine) {
      return truncateToolResult({
        type: "routine_error",
        error: `No routine found with name "${name}".`,
      });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (newName !== undefined) updates.name = newName;
    if (description !== undefined) updates.description = description;
    if (code !== undefined) updates.code = code;
    if (enabled !== undefined) updates.enabled = enabled;

    await db
      .update(routines)
      .set(updates as any)
      .where(eq(routines.id, routine.id))
      .run();

    const updated = await db
      .select()
      .from(routines)
      .where(eq(routines.id, routine.id))
      .get();

    return truncateToolResult({
      type: "routine_updated",
      routine: {
        id: updated?.id,
        name: updated?.name,
        description: updated?.description,
        enabled: updated?.enabled,
      },
      message: `Routine "${name}" updated successfully.${
        updated?.name !== name ? ` Renamed to "${updated?.name}".` : ""
      }`,
    });
  },
};

/**
 * Delete a routine from the library.
 */
export const deleteRoutineTool = {
  description: `Permanently delete a routine and all its run logs. Cannot be undone.`,

  parameters: z.object({
    name: z
      .string()
      .min(1)
      .describe("Name of the routine to delete"),
  }),

  execute: async ({ name }: { name: string }) => {
    const routine = await db
      .select()
      .from(routines)
      .where(eq(routines.name, name))
      .get();

    if (!routine) {
      return truncateToolResult({
        type: "routine_error",
        error: `No routine found with name "${name}".`,
      });
    }

    await db
      .delete(routines)
      .where(eq(routines.id, routine.id))
      .run();

    return truncateToolResult({
      type: "routine_deleted",
      name,
      message: `Routine "${name}" has been deleted.`,
    });
  },
};

/**
 * Get the run history for a routine.
 */
export const getRoutineLogsTool = {
  description: `Get recent run history for a routine (last 25 runs with status, output, timestamps). Use to check past runs or debug failures.`,

  parameters: z.object({
    name: z
      .string()
      .min(1)
      .describe("Name of the routine to get logs for"),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .default(25)
      .describe("Number of recent logs to return (max 100, default 25)"),
  }),

  execute: async ({
    name,
    limit,
  }: {
    name: string;
    limit?: number;
  }) => {
    const routine = await db
      .select()
      .from(routines)
      .where(eq(routines.name, name))
      .get();

    if (!routine) {
      return truncateToolResult({
        type: "routine_error",
        error: `No routine found with name "${name}".`,
      });
    }

    const logs = await db
      .select()
      .from(routineLogs)
      .where(eq(routineLogs.routineId, routine.id))
      .orderBy(desc(routineLogs.startedAt))
      .limit(limit ?? 25)
      .all();

    return truncateToolResult({
      type: "routine_logs",
      routine_name: name,
      count: logs.length,
      logs: logs.map((l) => ({
        id: l.id,
        status: l.status,
        output: l.output,
        error: l.error,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
      })),
    });
  },
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build all routine tools. Only includes them if the user has enabled
 * the "routines" tool config in settings. Disabled by default.
 * Matches the pattern used by buildExecutionTools.
 */
export async function buildRoutinesTools(conversationId?: number): Promise<Record<string, any>> {
  const config = await db
    .select()
    .from(toolConfigs)
    .where(eq(toolConfigs.toolId, "routines"))
    .get();

  if (!config?.enabled) {
    return {};
  }

  return {
    create_routine: createRoutineTool,
    run_routine: buildRunRoutineTool(conversationId),
    list_routines: listRoutinesTool,
    update_routine: updateRoutineTool,
    delete_routine: deleteRoutineTool,
    get_routine_logs: getRoutineLogsTool,
  };
}
