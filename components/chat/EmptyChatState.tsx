"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import { Loader2 } from "lucide-react";
import { preferencesApi } from "@/lib/api/preferences";
import { ChatInput, type ChatMode } from "./ChatInput";

/**
 * Empty conversation state — code-editor style: a headline with a large,
 * centered composer instead of suggestion cards. When the first message is
 * sent, the page swaps this out for the regular messages + docked input; the
 * composer itself carries a shared `layoutId` so it smoothly glides down to
 * the bottom of the screen.
 */
export function EmptyChatState({
  conversationId,
  status,
  disabled,
  mode,
  onModeChange,
  onSend,
  onStop,
  onAiStart,
  isAiStarting,
  children,
}: {
  conversationId: number;
  status: ChatStatus;
  disabled?: boolean;
  mode?: ChatMode;
  onModeChange?: (value: ChatMode) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAiStart?: () => void;
  isAiStarting?: boolean;
  /** Extra content rendered below the composer (e.g. error card). */
  children?: ReactNode;
}) {
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
    staleTime: 300_000,
  });

  const preferredName = (prefs?.preferredName ?? "").trim();
  const headline = preferredName
    ? `What are you up to, <a className="font-semibold underline" href="/settings/profile">${preferredName}</a>?`
    : "What should we do?";

  return (
    /* my-auto (not justify-center) keeps the top of the content reachable if
       it ever exceeds the viewport (e.g. with an error card visible). */
    /* Opacity-only fade: this root fills the scroll container exactly, so a
       translateY entrance would push it past the bottom edge and flash a
       scrollbar. */
    <div className="flex min-h-full w-full flex-col items-center px-6 pb-12 pt-2 animate-fade-in-opacity">
      <div className="my-auto flex w-full flex-col items-center gap-9">
        {/* Headline — outer element is a <div>, not a <p>, because it renders
            a nested <p dangerouslySetInnerHTML> (may contain an <a> link).
            <p> inside <p> is invalid HTML and breaks hydration. */}
        <div className="relative max-w-3xl text-center text-4xl font-semibold tracking-tight text-foreground/90 md:text-[2.75rem] md:leading-[1.15]">
          {/**
           * Reserved mascot slot — when a mascot/illustration exists it can
           * drop in here next to the greeting. Renders nothing today: an
           * empty, zero-size anchor so the layout is already prepared.
           */}
          <div aria-hidden="true" className="pointer-events-none select-none" />
          <p dangerouslySetInnerHTML={{ __html: headline }} />
        </div>

        {/* Big centered composer — shares layoutId with the docked input so
            the transition between the two states animates smoothly. Ease-out
            tween (not a spring) so the flight never overshoots the dock and
            flashes scrollbars. */}
        <motion.div
          layoutId="chat-input"
          transition={{ type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl"
        >
          <ChatInput
            conversationId={conversationId}
            status={status}
            disabled={disabled}
            mode={mode}
            onModeChange={onModeChange}
            onSend={onSend}
            onStop={onStop}
            large
          />
        </motion.div>

        {onAiStart && (
          <button
            type="button"
            onClick={onAiStart}
            disabled={isAiStarting}
            className="group relative inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-4 py-2 text-sm font-medium text-foreground transition-all duration-150 hover:bg-accent/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isAiStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Remi is thinking...</span>
              </>
            ) : (
              <span>Let Remi start the conversation</span>
            )}
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
