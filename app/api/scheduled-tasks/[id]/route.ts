import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scheduledTasks } from "@/db/schema";

// DELETE /api/scheduled-tasks/[id] — cancel/delete a pending task
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const task = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, taskId))
      .get();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot cancel a task with status "${task.status}"` },
        { status: 400 },
      );
    }

    await db
      .update(scheduledTasks)
      .set({
        status: "cancelled",
        completedAt: new Date().toISOString(),
      })
      .where(eq(scheduledTasks.id, taskId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to cancel scheduled task:", err);
    return NextResponse.json(
      { error: "Failed to cancel task" },
      { status: 500 },
    );
  }
}
