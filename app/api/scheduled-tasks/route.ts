import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { scheduledTasks, conversations } from "@/db/schema";

export type ScheduledTaskResponse = {
  id: number;
  conversationId: number;
  triggerAt: string;
  task: string;
  status: string;
  schedule: string | null;
  lastRunAt: string | null;
  result: string | null;
  error: string | null;
  notificationSent: boolean;
  createdAt: string;
  completedAt: string | null;
  conversationTitle?: string;
};

function formatTask(row: any): ScheduledTaskResponse {
  return {
    id: row.id,
    conversationId: row.conversationId,
    triggerAt: row.triggerAt,
    task: row.task,
    status: row.status,
    schedule: row.schedule ?? null,
    lastRunAt: row.lastRunAt ?? null,
    result: row.result,
    error: row.error,
    notificationSent: row.notificationSent ?? false,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

// GET /api/scheduled-tasks — list all tasks
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const status = searchParams.get("status"); // optional filter

    let query = db
      .select()
      .from(scheduledTasks)
      .orderBy(desc(scheduledTasks.triggerAt))
      .limit(Math.min(limit, 200));

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (status) {
      query = query.where(
        eq(scheduledTasks.status, status as any),
      ) as any;
    }

    const rows = await query.all();

    // Enrich with conversation titles
    const enriched = await Promise.all(
      rows.map(async (row: any) => {
        const item = formatTask(row);
        try {
          const conv = await db
            .select({ title: conversations.title })
            .from(conversations)
            .where(eq(conversations.id, row.conversationId))
            .get();
          return { ...item, conversationTitle: conv?.title ?? "Unknown" };
        } catch {
          return { ...item, conversationTitle: "Unknown" };
        }
      }),
    );

    return NextResponse.json({ tasks: enriched, count: enriched.length });
  } catch (err) {
    console.error("Failed to list scheduled tasks:", err);
    return NextResponse.json(
      { error: "Failed to list scheduled tasks" },
      { status: 500 },
    );
  }
}
