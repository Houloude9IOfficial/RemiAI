"use client";

import { ChatPersonalizationMenu } from "./ChatPersonalizationMenu";
import { useEffect, useState } from "react";

export function ChatHeader({
  title,
  actions,
  isTemporary,
  memoryEnabled,
  onTemporaryChange,
  onMemoryChange,
}: {
  title: string;
  actions?: React.ReactNode;
  /** Temporary-chat flag + per-chat memory switch (see ChatPersonalizationMenu). */
  isTemporary?: boolean;
  memoryEnabled?: boolean;
  onTemporaryChange?: (value: boolean) => void;
  onMemoryChange?: (value: boolean) => void;
}) {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" }).then((response) => response.json()).then((data) => setDemo(data.demo === true)).catch(() => undefined);
  }, []);

  return (
    <div className="sticky top-0 z-20 hidden items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur md:flex">
      {/* Left — conversation title */}
      <div className={`flex min-w-0 items-center gap-2.5 ${title === "New chat" ? "hidden" : ""}`}>
        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-foreground" title={title}>
          {title}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right — personalization and page actions */}
      <div className="flex shrink-0 items-center gap-2">
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
