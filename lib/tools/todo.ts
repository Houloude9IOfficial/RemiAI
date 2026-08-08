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
    description: `Initialize or replace the todo list for the current conversation. Use at the start of a complex multi-step task to create a plan. Each item needs a unique ID and a clear task. After creating, call todos_update as you work through items.`,

    inputSchema: z.object({
      items: z
        .array(
          z.object({
            id: z
              .string()
              .min(1)
              .max(50)
              .describe("Unique ID (kebab-case, e.g. 'step-1', 'research')"),
            task: z
              .string()
              .min(1)
              .max(500)
              .describe("Clear description of the task to complete"),
          }),
        )
        .min(1)
        .max(25)
        .describe("Todo items to create (max 25)"),
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
    description: `Update the status of one or more todo items (pending, in_progress, completed, failed, skipped). Optionally add a brief note for context.`,

    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            id: z
              .string()
              .min(1)
              .max(50)
              .describe("ID of the todo item to update"),
            status: z
              .enum(["pending", "in_progress", "completed", "failed", "skipped"])
              .describe("New status"),
            note: z
              .string()
              .max(500)
              .optional()
              .describe("Optional brief context note"),
          }),
        )
        .min(1)
        .max(25)
        .describe("Todo item updates to apply"),
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
    description: `View the current todo list with all items and statuses (stored per-conversation). Use to check progress on a multi-step task.`,

    inputSchema: z.object({}).describe("View the current todo list"),

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
