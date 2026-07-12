"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type DailyTokenUsage = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

interface TokenUsageCalendarProps {
  dailyUsage: DailyTokenUsage[];
}

// Color intensity based on token count
function getColorIntensity(tokens: number): string {
  if (tokens === 0) return "bg-transparent";
  if (tokens < 1000) return "bg-blue-100 dark:bg-blue-900/20";
  if (tokens < 5000) return "bg-blue-200 dark:bg-blue-800/30";
  if (tokens < 10000) return "bg-blue-300 dark:bg-blue-700/40";
  if (tokens < 20000) return "bg-blue-400 dark:bg-blue-600/50";
  return "bg-blue-500 dark:bg-blue-500/60";
}

// Get day of week name
function getDayName(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().split("T")[0]) {
    return "Today";
  }
  if (dateStr === yesterday.toISOString().split("T")[0]) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Format token count for tooltip
function formatTokenCount(tokens: number): string {
  if (tokens === 0) return "No tokens";
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + "K tokens";
  }
  return tokens + " tokens";
}

export function TokenUsageCalendar({ dailyUsage }: TokenUsageCalendarProps) {
  // Group by week for display
  const weeks: DailyTokenUsage[][] = [];
  for (let i = 0; i < dailyUsage.length; i += 7) {
    weeks.push(dailyUsage.slice(i, i + 7));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Token Usage (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-150 md:min-w-full">
            {/* Header row with day names */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dailyUsage.slice(0, 7).map((day, index) => (
                <div
                  key={index}
                  className="text-center text-xs font-medium text-muted-foreground p-1"
                >
                  {getDayName(day.date)}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {dailyUsage.map((day, index) => {
                const isToday = day.date === new Date().toISOString().split("T")[0];
                const colorClass = getColorIntensity(day.totalTokens);

                return (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <div
                        className={`
                          aspect-square rounded-sm border border-border/20 cursor-pointer
                          hover:ring-2 hover:ring-blue-500 transition-all
                          ${colorClass}
                          ${isToday ? "ring-2 ring-blue-500" : ""}
                        `}
                      >
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {day.totalTokens > 0 ? 
                              day.totalTokens >= 1000 ? 
                                (day.totalTokens / 1000).toFixed(1) + "K" : 
                                day.totalTokens
                              : "-"
                            }
                          </span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <div className="font-medium">{formatDate(day.date)}</div>
                        <div className="text-muted-foreground">
                          Input: {formatTokenCount(day.inputTokens)}
                        </div>
                        <div className="text-muted-foreground">
                          Output: {formatTokenCount(day.outputTokens)}
                        </div>
                        <div className="font-semibold">
                          Total: {formatTokenCount(day.totalTokens)}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Footer row with dates */}
            <div className="grid grid-cols-7 gap-1 mt-2">
              {dailyUsage.map((day, index) => (
                <div
                  key={index}
                  className="text-center text-xs text-muted-foreground p-1 truncate"
                >
                  {formatDate(day.date)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
