import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { todoItems } from "@/db/schema";
import { truncateToolResult } from "@/lib/utils";

type TodoStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTodoList(items: Array<{
  itemId: string;
  task: string;
  status: string;
  note: string | null;
}>): string {
  const statusIcons: Record<string, string> = {
    pending: "⬜",
    in_progress: "🔄",
    completed: "✅",
    failed: "❌",
    skipped: "⏭️",
  };

  const lines = items.map((item, i) => {
    const icon = statusIcons[item.status] ?? "⬜";
    const note = item.note ? ` — ${item.note}` : "";
    return `${i + 1}. ${icon} **${item.task}** (${item.status})${note}`;
  });

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// todos_init — initialize or replace the todo list
// ---------------------------------------------------------------------------

function buildTodosInitTool(conversationId: number) {
  return {
    description: `Initialize or replace the todo list for the current conversation. Use this at the start of a complex multi-step task to create a plan. Each item should have a unique ID and a clear task description.

You can use this to:
- Break down a complex request into manageable steps
- Create a plan before executing
- Track progress as you work through steps
- Show the user what you're planning to do

After creating the list, call todos_update to mark items as in_progress, completed, etc. as you work through them.`,

    inputSchema: z.object({
      items: z
        .array(
          z.object({
            id: z
              .string()
              .min(1)
              .max(50)
              .describe(
                "Unique ID for this todo item (e.g. 'step-1', 'research', 'implement'). Use kebab-case.",
              ),
            task: z
              .string()
              .min(1)
              .max(500)
              .describe("Clear description of the task to complete."),
          }),
        )
        .min(1)
        .max(25)
        .describe("List of todo items to create (max 25)."),
    }),

    execute: async ({
      items,
    }: {
      items: Array<{ id: string; task: string }>;
    }) => {
      // Delete existing todo items for this conversation
      await db
        .delete(todoItems)
        .where(eq(todoItems.conversationId, conversationId))
        .run();

      // Insert new items
      const now = new Date().toISOString();
      for (let i = 0; i < items.length; i++) {
        await db
          .insert(todoItems)
          .values({
            conversationId,
            itemId: items[i].id,
            task: items[i].task,
            status: "pending",
            sortOrder: i,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // Return the formatted list
      const allItems = await db
        .select()
        .from(todoItems)
        .where(eq(todoItems.conversationId, conversationId))
        .orderBy(todoItems.sortOrder)
        .all();

      return truncateToolResult({
        type: "todo_list",
        action: "initialized",
        count: allItems.length,
        items: allItems.map((t) => ({
          id: t.itemId,
          task: t.task,
          status: t.status,
          note: t.note,
        })),
        summary: formatTodoList(allItems),
        message: `Todo list initialized with ${allItems.length} item${allItems.length === 1 ? "" : "s"}.`,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// todos_update — update status of one or more todo items
// ---------------------------------------------------------------------------

function buildTodosUpdateTool(conversationId: number) {
  return {
    description: `Update the status of one or more todo items. Use this after completing, starting, or changing the status of any todo item.

Statuses:
- **pending** — Not started yet (default)
- **in_progress** — Currently working on this item
- **completed** — Finished successfully
- **failed** — Could not complete
- **skipped** — Decided not to do this

You can also add a brief note to provide context about the update.`,

    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            id: z
              .string()
              .min(1)
              .max(50)
              .describe("The ID of the todo item to update."),
            status: z
              .enum(["pending", "in_progress", "completed", "failed", "skipped"])
              .describe("New status for this todo item."),
            note: z
              .string()
              .max(500)
              .optional()
              .describe(
                "Optional brief note providing context about the update (e.g. what was done, why it was skipped, what went wrong).",
              ),
          }),
        )
        .min(1)
        .max(25)
        .describe("List of todo item updates to apply."),
    }),

    execute: async ({
      updates,
    }: {
      updates: Array<{
        id: string;
        status: TodoStatus;
        note?: string;
      }>;
    }) => {
      const now = new Date().toISOString();
      const results: Array<{
        id: string;
        task: string;
        status: string;
        note: string | null;
        previousStatus: string | null;
      }> = [];

      for (const update of updates) {
        // Get the current item to know the previous status
        const existing = await db
          .select()
          .from(todoItems)
          .where(
            and(
              eq(todoItems.conversationId, conversationId),
              eq(todoItems.itemId, update.id),
            ),
          )
          .get();

        if (!existing) {
          results.push({
            id: update.id,
            task: "(unknown)",
            status: update.status,
            note: update.note ?? null,
            previousStatus: null,
          });
          continue;
        }

        await db
          .update(todoItems)
          .set({
            status: update.status,
            note: update.note ?? existing.note,
            updatedAt: now,
          })
          .where(
            and(
              eq(todoItems.conversationId, conversationId),
              eq(todoItems.itemId, update.id),
            ),
          )
          .run();

        results.push({
          id: existing.itemId,
          task: existing.task,
          status: update.status,
          note: update.note ?? existing.note,
          previousStatus: existing.status,
        });
      }

      // Return the full updated list
      const allItems = await db
        .select()
        .from(todoItems)
        .where(eq(todoItems.conversationId, conversationId))
        .orderBy(todoItems.sortOrder)
        .all();

      // Build a brief update summary
      const statusChanges = results
        .filter((r) => r.previousStatus)
        .map(
          (r) =>
            `"${r.id}": ${r.previousStatus} → ${r.status}`,
        );

      return truncateToolResult({
        type: "todo_list",
        action: "updated",
        updated: results.map((r) => ({
          id: r.id,
          task: r.task,
          old_status: r.previousStatus,
          new_status: r.status,
          note: r.note,
        })),
        items: allItems.map((t) => ({
          id: t.itemId,
          task: t.task,
          status: t.status,
          note: t.note,
        })),
        summary: formatTodoList(allItems),
        changes: statusChanges.join("; "),
        message:
          results.length === 1
            ? `Updated "${results[0].id}" to ${results[0].status}.`
            : `Updated ${results.length} todo items.`,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// todos_view — view the current todo list
// ---------------------------------------------------------------------------

function buildTodosViewTool(conversationId: number) {
  return {
    description: `View the current todo list with all items and their statuses. Use this to check your progress on a multi-step task.

The todo list is stored per-conversation and persists across messages.`,

    inputSchema: z.object({}).describe("View the current todo list."),

    execute: async () => {
      const items = await db
        .select()
        .from(todoItems)
        .where(eq(todoItems.conversationId, conversationId))
        .orderBy(todoItems.sortOrder)
        .all();

      if (items.length === 0) {
        return truncateToolResult({
          type: "todo_list",
          action: "viewed",
          items: [],
          summary: "(empty — no todo items yet)",
          message: "No todo items found for this conversation. Use todos_init to create a list.",
        });
      }

      const completed = items.filter((t) => t.status === "completed").length;
      const failed = items.filter((t) => t.status === "failed").length;
      const inProgress = items.filter((t) => t.status === "in_progress").length;
      const total = items.length;

      return truncateToolResult({
        type: "todo_list",
        action: "viewed",
        count: total,
        progress: `${completed}/${total} completed${failed > 0 ? `, ${failed} failed` : ""}${inProgress > 0 ? `, ${inProgress} in progress` : ""}`,
        items: items.map((t) => ({
          id: t.itemId,
          task: t.task,
          status: t.status,
          note: t.note,
        })),
        summary: formatTodoList(items),
        message: `Todo list: ${completed}/${total} completed.`,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Public builder — builds all todo tools with conversationId injected
// ---------------------------------------------------------------------------

export function buildTodoTools(conversationId: number) {
  return {
    todos_init: buildTodosInitTool(conversationId),
    todos_update: buildTodosUpdateTool(conversationId),
    todos_view: buildTodosViewTool(conversationId),
  };
}
