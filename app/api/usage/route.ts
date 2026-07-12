import { NextResponse } from "next/server";
import { and, desc, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

export type ChatTokenUsage = {
  id: number;
  title: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  updatedAt: string;
};

export type TokenUsageStats = {
  chatUsage: ChatTokenUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  last24hTokens: number;
  last7dTokens: number;
  last30dTokens: number;
};

// Helper to get date N days ago
function getDateDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function GET() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = getDateDaysAgo(6);
  const thirtyDaysAgo = getDateDaysAgo(29);

  // Get all conversations with token data (all time)
  const allConversations = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      inputTokens: conversations.totalInputTokens,
      outputTokens: conversations.totalOutputTokens,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  // Filter by time periods
  const last24h = allConversations.filter(conv => 
    new Date(conv.updatedAt) >= twentyFourHoursAgo
  );
  const last7d = allConversations.filter(conv => 
    new Date(conv.updatedAt) >= sevenDaysAgo
  );
  const last30d = allConversations.filter(conv => 
    new Date(conv.updatedAt) >= thirtyDaysAgo
  );

  // Calculate tokens for each period
  const last24hTokens = last24h.reduce((sum, conv) => 
    sum + conv.inputTokens + conv.outputTokens, 0
  );
  const last7dTokens = last7d.reduce((sum, conv) => 
    sum + conv.inputTokens + conv.outputTokens, 0
  );
  const last30dTokens = last30d.reduce((sum, conv) => 
    sum + conv.inputTokens + conv.outputTokens, 0
  );

  // Calculate all-time totals
  const totalInputTokens = allConversations.reduce((sum, conv) => 
    sum + conv.inputTokens, 0
  );
  const totalOutputTokens = allConversations.reduce((sum, conv) => 
    sum + conv.outputTokens, 0
  );
  const totalTokens = totalInputTokens + totalOutputTokens;

  // Get chat usage sorted by total tokens (all time)
  const chatUsage: ChatTokenUsage[] = allConversations
    .filter((conv) => conv.inputTokens > 0 || conv.outputTokens > 0)
    .map((conv) => ({
      id: conv.id,
      title: conv.title,
      inputTokens: conv.inputTokens,
      outputTokens: conv.outputTokens,
      totalTokens: conv.inputTokens + conv.outputTokens,
      updatedAt: conv.updatedAt,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 20); // Top 20 chats

  const stats: TokenUsageStats = {
    chatUsage,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    last24hTokens,
    last7dTokens,
    last30dTokens,
  };

  return NextResponse.json(stats);
}
