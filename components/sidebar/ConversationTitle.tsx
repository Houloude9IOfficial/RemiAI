"use client";

import { useTypewriterTitle } from "@/lib/hooks/use-typewriter-title";

/**
 * Conversation title that types itself in when the background titler replaces
 * the fallback title ("hi" → "Casual Greeting"), instead of snapping.
 *
 * Screen readers get the settled title via a visually hidden node so the
 * character-by-character animation is never announced.
 */
export function ConversationTitle({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const { text, animating } = useTypewriterTitle(title);

  return (
    <span className={className}>
      <span aria-hidden="true">
        {text}
        {animating && (
          <span className="ml-px inline-block h-[0.85em] w-px translate-y-[0.08em] animate-pulse bg-current align-baseline" />
        )}
      </span>
      <span className="sr-only">{title}</span>
    </span>
  );
}
