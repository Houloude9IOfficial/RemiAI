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

export type DailyTokenUsage = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TokenUsageStats = {
  chatUsage: ChatTokenUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  last24hTokens: number;
  last7dTokens: number;
  last30dTokens: number;
  dailyUsage: DailyTokenUsage[];
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

  // Calculate daily usage
  const toDateKey = (dateValue: string | Date | null | undefined): string | null => {
    if (!dateValue) return null;
    const str = String(dateValue).trim();
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    } catch {
      // fallback
    }
    return null;
  };

  const dailyMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (const conv of allConversations) {
    const dateKey = toDateKey(conv.updatedAt);
    if (!dateKey) continue;
    const input = conv.inputTokens || 0;
    const output = conv.outputTokens || 0;
    if (input === 0 && output === 0) continue;

    const current = dailyMap.get(dateKey) || { inputTokens: 0, outputTokens: 0 };
    current.inputTokens += input;
    current.outputTokens += output;
    dailyMap.set(dateKey, current);
  }

  const dailyUsage: DailyTokenUsage[] = Array.from(dailyMap.entries())
    .map(([date, tokens]) => ({
      date,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.inputTokens + tokens.outputTokens,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const stats: TokenUsageStats = {
    chatUsage,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    last24hTokens,
    last7dTokens,
    last30dTokens,
    dailyUsage,
  };

  return NextResponse.json(stats);
}
