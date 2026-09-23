"use client";

import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import { conversationsApi } from "@/lib/api/conversations";
import { availableModelsApi } from "@/lib/api/available-models";
import { DEFAULT_CONTEXT_WINDOW } from "@/lib/providers/catalog";
import { cn } from "@/lib/utils";
import { ChatPersonalizationMenu } from "./ChatPersonalizationMenu";
import { useEffect, useState } from "react";

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
  isTemporary,
  memoryEnabled,
  onTemporaryChange,
  onMemoryChange,
}: {
  conversationId: number;
  title: string;
  providerId: number | null;
  modelId: string | null;
  status: ChatStatus;
  /** Seed value from the initial conversation fetch (avoids a 0 flash). */
  initialTotalTokens: number;
  actions?: React.ReactNode;
  /** Temporary-chat flag + per-chat memory switch (see ChatPersonalizationMenu). */
  isTemporary?: boolean;
  memoryEnabled?: boolean;
  onTemporaryChange?: (value: boolean) => void;
  onMemoryChange?: (value: boolean) => void;
}) {
  const isStreaming = status === "submitted" || status === "streaming";
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" }).then((response) => response.json()).then((data) => setDemo(data.demo === true)).catch(() => undefined);
  }, []);

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
        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-foreground" title={title}>
          {title}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right — personalization, skills chip, live usage meter, page actions */}
      <div className="flex shrink-0 items-center gap-2">
        {totalTokens / Math.max(contextWindow, 1) >= 0.75 && (
          <div className={cn("h-2 w-2 rounded-full", totalTokens / Math.max(contextWindow, 1) >= 0.9 ? "bg-status-warning" : "bg-primary")} title={`Context usage: ${formatCompact(totalTokens)} / ${formatCompact(contextWindow)}`} />
        )}
        {!demo && onTemporaryChange && onMemoryChange && (
          <ChatPersonalizationMenu
            isTemporary={isTemporary ?? false}
            memoryEnabled={memoryEnabled ?? true}
            onTemporaryChange={onTemporaryChange}
            onMemoryChange={onMemoryChange}
          />
        )}
        <div className="flex items-center gap-1">{actions}</div>
      </div>
    </div>
  );
}
