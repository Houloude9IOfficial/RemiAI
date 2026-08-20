"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type { ChatStatus } from "ai";
import { conversationsApi } from "@/lib/api/conversations";
import { availableModelsApi } from "@/lib/api/available-models";
import { skillsApi } from "@/lib/api/skills";
import { DEFAULT_CONTEXT_WINDOW } from "@/lib/providers/catalog";
import { cn } from "@/lib/utils";

/**
 * Compact token/context readout — `used / context` with a thin progress bar.
 * The numerator is the conversation's real tracked usage (totalInputTokens +
 * totalOutputTokens, accumulated server-side from every finished run). The
 * denominator is the active model's approximate context window. Pure
 * relocation of existing accounting — no new counters are kept here.
 */
function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function UsageMeter({ used, contextWindow }: { used: number; contextWindow: number }) {
  const safeWindow = contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;
  const pct = Math.min(100, (used / safeWindow) * 100);
  const nearLimit = pct >= 90;

  return (
    <div
      className="flex items-center gap-2"
      title={`Approximate tokens used this conversation (${used.toLocaleString()}) vs. the model's context window (${safeWindow.toLocaleString()}). Updates as responses finish. Context window is approximate, may be different for some models.`}
    >
      <span
        className={cn(
          "whitespace-nowrap text-xs tabular-nums",
          nearLimit ? "font-medium text-status-warning" : "text-muted-foreground",
        )}
      >
        {formatCompact(used)} / {formatCompact(safeWindow)}
      </span>
      <div
        className="h-1 w-20 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Context window usage"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            nearLimit ? "bg-status-warning" : "bg-primary",
          )}
          style={{ width: `${pct > 0 && pct < 2 ? 2 : pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Desktop chat header — the redesigned chrome bar.
 *
 * Left: the conversation title. Right: the live per-conversation usage meter,
 * then the page's own actions (export, session files). The model switcher
 * lives in the composer now (ChatModelSelector).
 */
export function ChatHeader({
  conversationId,
  title,
  providerId,
  modelId,
  status,
  initialTotalTokens,
  actions,
}: {
  conversationId: number;
  title: string;
  providerId: number | null;
  modelId: string | null;
  status: ChatStatus;
  /** Seed value from the initial conversation fetch (avoids a 0 flash). */
  initialTotalTokens: number;
  actions?: React.ReactNode;
}) {
  const isStreaming = status === "submitted" || status === "streaming";

  // Reuse the sidebar's conversation-list query so the meter shows the real
  // accumulated totals. While a response streams in, poll at a modest cadence
  // so the readout climbs as soon as the server writes the finished run's
  // usage (long goal-mode runs update mid-flight too).
  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
    refetchInterval: isStreaming ? 8_000 : false,
    staleTime: isStreaming ? 4_000 : 30_000,
  });
  const { data: availableProviders = [] } = useQuery({
    queryKey: ["available-models"],
    queryFn: availableModelsApi.list,
  });

  // Enabled skills count — small chip that links to the Skills settings.
  const { data: installedSkills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: skillsApi.list,
    staleTime: 30_000,
  });
  const enabledSkillCount = installedSkills.filter((s) => s.enabled).length;

  const conversation = conversations?.find((c) => c.id === conversationId);
  const usedTokens =
    (conversation?.totalInputTokens ?? 0) + (conversation?.totalOutputTokens ?? 0);
  // Seed with the page's snapshot until the first poll arrives.
  const totalTokens = usedTokens > 0 || conversation ? usedTokens : initialTotalTokens;

  const currentProvider = availableProviders.find((p) => p.providerId === providerId);
  const contextWindow =
    currentProvider?.models.find((m) => m.modelId === modelId)?.contextWindow ??
    DEFAULT_CONTEXT_WINDOW;

  return (
    <div className="sticky top-0 z-20 hidden items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur md:flex">
      {/* Left — conversation title */}
      <div className={`flex min-w-0 items-center gap-2.5 ${title === "New chat" ? "hidden" : ""}`}>
        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-foreground">
          {title}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right — skills chip, live usage meter, then page actions */}
      <div className="flex shrink-0 items-center gap-2">
        {enabledSkillCount > 0 && (
          <Link
            href="/settings/skills"
            title={`${enabledSkillCount} skill${enabledSkillCount === 1 ? "" : "s"} active`}
            className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            {enabledSkillCount}
          </Link>
        )}
        <UsageMeter used={totalTokens} contextWindow={contextWindow} />
        <div className="mx-0.5 h-4 w-px shrink-0 bg-border/70" />
        <div className="flex items-center gap-1">{actions}</div>
      </div>
    </div>
  );
}
