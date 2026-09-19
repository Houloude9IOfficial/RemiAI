"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DailyTokenUsage = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

interface TokenUsageCalendarProps {
  dailyUsage?: DailyTokenUsage[];
  totalTokens?: number;
  className?: string;
}

const RECENT_MONTHS = 12;
const RECENT_WEEKS = 52;

function formatShortTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return (tokens / 1_000_000).toFixed(1) + "M";
  }
  if (tokens >= 1_000) {
    return (tokens / 1_000).toFixed(1) + "K";
  }
  return tokens.toString();
}

// A full year mirrors the compact activity view while still fitting the card.
function generateRecentWeeksGrid(endDate: Date = new Date()) {
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // End on Saturday of the current week
  const endDayOfWeek = end.getDay(); // 0 = Sun ... 6 = Sat
  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - endDayOfWeek));

  const numWeeks = RECENT_WEEKS;
  const gridStart = new Date(gridEnd);
  gridStart.setDate(gridStart.getDate() - (numWeeks * 7 - 1));
  gridStart.setHours(0, 0, 0, 0);

  const weeks: Array<{
    weekIndex: number;
    monthLabel?: string;
    days: Array<{
      date: string;
      dateObj: Date;
      dayOfWeek: number;
      isFuture: boolean;
    }>;
  }> = [];

  const cursor = new Date(gridStart);
  let lastMonth = -1;

  for (let w = 0; w < numWeeks; w++) {
    const days = [];
    let weekMonthLabel: string | undefined = undefined;

    for (let d = 0; d < 7; d++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const dayStr = String(cursor.getDate()).padStart(2, "0");
      const dateKey = `${y}-${m}-${dayStr}`;
      const isFuture = cursor > end;

      if (cursor.getMonth() !== lastMonth && cursor.getDate() <= 7) {
        weekMonthLabel = cursor.toLocaleDateString("en-US", { month: "short" });
        lastMonth = cursor.getMonth();
      }

      days.push({
        date: dateKey,
        dateObj: new Date(cursor),
        dayOfWeek: cursor.getDay(),
        isFuture,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push({ weekIndex: w, monthLabel: weekMonthLabel, days });
  }

  return weeks;
}

export function TokenUsageCalendar({ dailyUsage = [], totalTokens = 0, className }: TokenUsageCalendarProps) {
  const shouldReduceMotion = useReducedMotion();

  // Fast date lookup map
  const usageMap = useMemo(() => {
    const map = new Map<string, DailyTokenUsage>();
    for (const item of dailyUsage) {
      map.set(item.date, item);
    }
    return map;
  }, [dailyUsage]);

  // The fixed 12-month range scales to the available width rather than scrolling.
  const weeks = useMemo(() => generateRecentWeeksGrid(), []);

  // Compute stats: lifetime tokens, peak tokens, streaks
  const stats = useMemo(() => {
    let computedLifetime = 0;
    let peakTokens = 0;

    for (const item of dailyUsage) {
      computedLifetime += item.totalTokens;
      if (item.totalTokens > peakTokens) {
        peakTokens = item.totalTokens;
      }
    }

    const lifetimeTokens = totalTokens > 0 ? totalTokens : computedLifetime;

    // Streaks
    const checkDate = new Date();
    let currentStreak = 0;

    while (true) {
      const y = checkDate.getFullYear();
      const m = String(checkDate.getMonth() + 1).padStart(2, "0");
      const d = String(checkDate.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;
      const usage = usageMap.get(key);

      if (usage && usage.totalTokens > 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (currentStreak === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yestKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
          const yestUsage = usageMap.get(yestKey);
          if (yestUsage && yestUsage.totalTokens > 0) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }

    const sortedDates = Array.from(usageMap.keys())
      .filter((k) => (usageMap.get(k)?.totalTokens ?? 0) > 0)
      .sort();

    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;

    for (const dateStr of sortedDates) {
      const d = new Date(dateStr);
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const diffDays = Math.round((d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      prevDate = d;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    }

    return {
      lifetimeTokens,
      peakTokens,
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
    };
  }, [dailyUsage, totalTokens, usageMap]);

  // Solid, low-saturation fills avoid the glossy/highlighted appearance.
  const getCellClass = (tokens: number, isFuture: boolean) => {
    if (isFuture) {
      return "bg-muted/30 border-transparent opacity-35 cursor-default";
    }
    if (tokens === 0) {
      return "bg-muted/70 border-border/40";
    }
    if (tokens < 5_000) {
      return "bg-[#365277] border-[#45658f]";
    }
    if (tokens < 25_000) {
      return "bg-[#426a9b] border-[#507bab]";
    }
    if (tokens < 100_000) {
      return "bg-[#527fb5] border-[#628fc5]";
    }
    return "bg-[#6695c9] border-[#77a6d8]";
  };

  const todayDateStr = useMemo(() => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  }, []);

  return (
    <div className={cn("space-y-6 select-none", className)}>
      {/* A single, quiet summary strip keeps the stats visually secondary. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border/40 bg-card/20 sm:grid-cols-4">
        {[
          { value: formatShortTokens(stats.lifetimeTokens), label: "Lifetime tokens" },
          { value: formatShortTokens(stats.peakTokens), label: "Peak tokens" },
          { value: `${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`, label: "Current streak" },
          { value: `${stats.longestStreak} ${stats.longestStreak === 1 ? "day" : "days"}`, label: "Longest streak" },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              "p-4 text-center",
              index % 2 === 1 && "border-l border-border/40",
              index >= 2 && "border-t border-border/40",
              index > 0 && "sm:border-l sm:border-t-0"
            )}
          >
            <div className="text-lg font-medium tracking-tight tabular-nums sm:text-xl">{stat.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Token Activity Section */}
      <section className="space-y-3">
        <div className="flex items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground tracking-tight">Token activity</h3>
            <span className="text-xs text-muted-foreground font-normal">
              · last {RECENT_MONTHS} months
            </span>
          </div>
        </div>

        {/* The fixed grid scales to the card width instead of overflowing it. */}
        <div className="pt-0.5">
          <div className="w-full">
            <div className="grid grid-cols-[repeat(52,minmax(0,1fr))] gap-0.5 sm:gap-1">
              {weeks.map((week, colIndex) => {
                return (
                  <motion.div
                    key={week.weekIndex}
                    initial={{ opacity: 0, x: -6, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{
                      duration: 0.22,
                      delay: shouldReduceMotion ? 0 : colIndex * 0.015,
                      ease: "easeOut",
                    }}
                    className="flex min-w-0 flex-col gap-0.5 sm:gap-1"
                  >
                    {week.days.map((day) => {
                      const dailyData = usageMap.get(day.date);
                      const tokensToDisplay = dailyData?.totalTokens || 0;

                      const isToday = day.date === todayDateStr;
                      const cellColor = getCellClass(tokensToDisplay, day.isFuture);
                      const monthDayStr = day.dateObj.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });

                      // Format tooltip message matching screenshot (e.g. "40.3M tokens on Sep 11")
                      const tokenCountLabel =
                        tokensToDisplay > 0 ? formatShortTokens(tokensToDisplay) : "0";
                      const tooltipText = `${tokenCountLabel} tokens on ${monthDayStr}${isToday ? " (until today)" : ""}`;

                      return (
                        <Tooltip key={day.date}>
                          <TooltipTrigger
                            render={
                              <div
                                role="button"
                                tabIndex={0}
                                className={cn(
                                  "aspect-square w-full rounded-[2px] border transition-colors select-none outline-none focus-visible:ring-1 focus-visible:ring-primary",
                                  cellColor
                                )}
                              />
                            }
                          />
                          <TooltipContent
                            side="bottom"
                            sideOffset={8}
                            showArrow={false}
                            className="bg-[#18191c] text-neutral-100 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 shadow-lg font-normal whitespace-nowrap"
                          >
                            {tooltipText}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </motion.div>
                );
              })}
            </div>

            {/* Month Labels under the grid */}
            <div className="mt-2.5 grid grid-cols-[repeat(52,minmax(0,1fr))] gap-0.5 sm:gap-1">
              {weeks.map((week) => (
                <div
                  key={`month-${week.weekIndex}`}
                  className="min-w-0 text-[10px] sm:text-[11px] text-muted-foreground/70 overflow-visible whitespace-nowrap"
                >
                  {week.monthLabel ? <span>{week.monthLabel}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
