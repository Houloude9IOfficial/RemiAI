"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationsApi } from "@/lib/api/conversations";

/**
 * Shared "create a new chat" logic, extracted from the sidebars so it can also
 * be wired to global keyboard shortcuts (⌘/Ctrl+N).
 *
 * Reuses the last-selected model from localStorage (mirrors the old sidebar
 * behaviour) and navigates to the freshly created conversation. An optional
 * `onSuccess` callback runs after navigation (e.g. closing the mobile drawer).
 */
export function useNewChat(onSuccess?: () => void) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      // Use the last-selected model from localStorage, if any
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
      return conversationsApi.create(
        providerId && modelId ? { providerId, modelId } : undefined,
      );
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${conversation.id}`);
      onSuccess?.();
    },
    onError: () => {
      // Fallback: create a new chat without provider/model and navigate there.
      // The page will gracefully handle the empty state.
      conversationsApi.create().then((conversation) => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        router.push(`/chat/${conversation.id}`);
        onSuccess?.();
      });
    },
  });
}
