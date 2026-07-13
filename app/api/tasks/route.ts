import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTasks, conversations } from "@/db/schema";

export type AgentTaskWithConversation = {
  id: number;
  conversationId: number;
  conversationTitle: string;
  parentTaskId: number | null;
  chainDepth: number;
  agentType: string;
  task: string;
  status: string;
  progress: string | null;
  result: string | null;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  completedAt: string | null;
  children?: AgentTaskWithConversation[];
};

function buildTree(tasks: AgentTaskWithConversation[]): AgentTaskWithConversation[] {
  const map = new Map<number, AgentTaskWithConversation>();
  const roots: AgentTaskWithConversation[] = [];

  for (const task of tasks) {
    map.set(task.id, { ...task, children: [] });
  }

  for (const task of tasks) {
    const node = map.get(task.id)!;
    if (task.parentTaskId !== null && map.has(task.parentTaskId)) {
      map.get(task.parentTaskId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by createdAt (newest first)
  for (const [, node] of map) {
    if (node.children && node.children.length > 1) {
      node.children.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
  }

  return roots;
}

export async function GET() {
  const rows = await db
    .select({
      id: agentTasks.id,
      conversationId: agentTasks.conversationId,
      conversationTitle: conversations.title,
      parentTaskId: agentTasks.parentTaskId,
      chainDepth: agentTasks.chainDepth,
      agentType: agentTasks.agentType,
      task: agentTasks.task,
      status: agentTasks.status,
      progress: agentTasks.progress,
      result: agentTasks.result,
      error: agentTasks.error,
      inputTokens: agentTasks.inputTokens,
      outputTokens: agentTasks.outputTokens,
      createdAt: agentTasks.createdAt,
      completedAt: agentTasks.completedAt,
    })
    .from(agentTasks)
    .leftJoin(conversations, eq(agentTasks.conversationId, conversations.id))
    .orderBy(desc(agentTasks.createdAt))
    .all();

  const tasks: AgentTaskWithConversation[] = rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    conversationTitle: row.conversationTitle ?? "Deleted conversation",
    parentTaskId: row.parentTaskId,
    chainDepth: row.chainDepth,
    agentType: row.agentType,
    task: row.task,
    status: row.status,
    progress: row.progress,
    result: row.result,
    error: row.error,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));

  const tree = buildTree(tasks);

  return NextResponse.json({
    tasks,
    tree,
    count: tasks.length,
  });
}
