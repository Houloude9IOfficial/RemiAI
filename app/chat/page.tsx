"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { conversationsApi } from "@/lib/api/conversations";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * Fresh-session entry point: opening the site without a chat id always starts
 * a NEW conversation instead of resuming the most recent one.
 *
 * The conversation is created client-side so it can inherit the LAST USED
 * MODEL from localStorage — the same `lastModel` the sidebar's new-chat button
 * reuses — so a fresh session never makes the user pick a model again.
 */
export default function ChatHomePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Reuse the last-selected model from localStorage, if any (mirrors
        // the sidebar's useNewChat behaviour).
        const lastModel = globalThis.localStorage?.getItem("lastModel");
        let providerId: number | undefined;
        let modelId: string | undefined;
        if (lastModel) {
          try {
            const parsed = JSON.parse(lastModel);
            if (typeof parsed.providerId === "number") providerId = parsed.providerId;
            if (typeof parsed.modelId === "string") modelId = parsed.modelId;
          } catch {
            // Ignore corrupt localStorage value
          }
        }
        const conversation = await conversationsApi.create(
          providerId && modelId ? { providerId, modelId } : undefined,
        );
        if (!cancelled) {
          router.replace(`/chat/${conversation.id}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to start a new chat",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  // Minimal full-screen state while the fresh conversation is created — and
  // an error with retry if creation fails. Never a stuck skeleton.
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/40 active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      ) : (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
