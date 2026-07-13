import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { todoItems } from "@/db/schema";

export type TodoItemResponse = {
  id: string;
  task: string;
  status: string;
  note: string | null;
};

export type TodosResponse = {
  items: TodoItemResponse[];
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  skipped: number;
  pending: number;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId query parameter is required" },
      { status: 400 },
    );
  }

  const id = Number(conversationId);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "conversationId must be a number" },
      { status: 400 },
    );
  }

  const items = await db
    .select()
    .from(todoItems)
    .where(eq(todoItems.conversationId, id))
    .orderBy(todoItems.sortOrder)
    .all();

  const todoList: TodoItemResponse[] = items.map((t) => ({
    id: t.itemId,
    task: t.task,
    status: t.status,
    note: t.note,
  }));

  const response: TodosResponse = {
    items: todoList,
    total: todoList.length,
    completed: todoList.filter((t) => t.status === "completed").length,
    inProgress: todoList.filter((t) => t.status === "in_progress").length,
    failed: todoList.filter((t) => t.status === "failed").length,
    skipped: todoList.filter((t) => t.status === "skipped").length,
    pending: todoList.filter((t) => t.status === "pending").length,
  };

  return NextResponse.json(response);
}
