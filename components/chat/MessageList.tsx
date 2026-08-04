"use client";

import type { UIMessage } from "ai";
import { useMemo, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { preferencesApi } from "@/lib/api/preferences";
import { MessageBubble } from "./MessageBubble";
import { ChatMessageProvider } from "./ChatMessageContext";
import {
  Loader2,
  Sparkles,
  Feather,
  Atom,
  Code,
  MapPin,
  Bug,
  FileText,
  MessageCirclePlus,
} from "lucide-react";

// ── Greeting phrases ──────────────────────────────────────────────────

const GENERAL_PHRASES = [
  "Ready to chat?",
  "Ask me anything",
  "What's on your mind?",
  "Start a conversation",
  "Hey! How can I help?",
  "I'm all ears",
  "Let's build something",
  "What would you like to know?",
  "The day is full of possibilities",
  "What are we solving today?",
  "Let's make something great",
  "Your ideas start here",
];

const NAME_PHRASES = [
  "What's up {name}?",
  "Hey {name}, ready to chat?",
  "What's on your mind, {name}?",
  "Ready when you are, {name}",
  "How can I help you today, {name}?",
  "Good to see you, {name}!",
  "Back again, {name}?",
  "Let's get started, {name}",
  "What are we working on today, {name}?",
  "All yours, {name}",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Quick action cards ────────────────────────────────────────────────

interface QuickAction {
  icon: ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Feather,
    label: "Check out my last trip's journal",
    prompt:
      "I have a journal from my last trip. Can you summarize it and highlight the key experiences? It's in one of the directories you have access to.",
  },
  {
    icon: Atom,
    label: "Explain quantum computing",
    prompt: "Explain quantum computing in simple terms.",
  },
  {
    icon: Code,
    label: "Write a React component",
    prompt:
      "Write a reusable React component with TypeScript and Tailwind CSS.",
  },
];

// ── Floating particles for the empty-state background ────────────────

const PARTICLES = [
  {
    className: "-top-10 left-[15%] h-28 w-28 rounded-full bg-primary/5 blur-2xl animate-float-drift",
  },
  {
    className: "top-[20%] -right-8 h-20 w-20 rounded-full bg-primary/5 blur-xl animate-float-drift-slow",
    style: { animationDelay: "-3s" },
  },
  {
    className: "bottom-[15%] left-[10%] h-16 w-16 rounded-full bg-primary/5 blur-xl animate-float-drift",
    style: { animationDelay: "-5s" },
  },
  {
    className: "top-[40%] left-[55%] h-12 w-12 rounded-full bg-muted-foreground/5 blur-lg animate-float-drift-slow",
    style: { animationDelay: "-2s" },
  },
  {
    className: "bottom-[30%] right-[20%] h-24 w-24 rounded-full bg-primary/5 blur-2xl animate-float-drift",
    style: { animationDelay: "-7s" },
  },
  {
    className: "top-[60%] left-[30%] h-10 w-10 rounded-full bg-muted-foreground/5 blur-md animate-float-drift-slow",
    style: { animationDelay: "-4s" },
  },
];

// ── Component ────────────────────────────────────────────────────────

export function MessageList({
  messages,
  status,
  onSend,
  onAiStart,
  isAiStarting,
}: {
  messages: UIMessage[];
  status?: "submitted" | "streaming" | "ready" | "error";
  onSend?: (text: string) => void;
  onAiStart?: () => void;
  isAiStarting?: boolean;
}) {
  // Fetch user preferences so we can personalise the empty-state greeting
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: preferencesApi.get,
    staleTime: 300_000,
  });

  const preferredName = prefs?.preferredName ?? "";

  // Pick a random greeting phrase. Re-pick only when the preferredName changes
  // so the greeting doesn't flicker on re-render.
  const greeting = useMemo(() => {
    if (preferredName) {
      const phrase = pickRandom(NAME_PHRASES);
      return phrase.replace("{name}", preferredName);
    }
    return pickRandom(GENERAL_PHRASES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredName]);

  const lastMessage = messages[messages.length - 1];
  const isWaiting =
    (status === "submitted" || status === "streaming") &&
    (!lastMessage || lastMessage.role === "user");

  if (messages.length === 0 && !isWaiting) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 pt-50 animate-fade-in">
        {/* Floating particle background */}
        {/* <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {PARTICLES.map((particle, i) => (
            <div
              key={i}
              className={`absolute ${particle.className}`}
              style={particle.style}
            />
          ))}
        </div> */}

        {/* Decorative sparkle icon */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-background/60 backdrop-blur-sm">
          {/* <Sparkles className="h-6 w-6 text-primary/60" /> */}
                    <img
            src="/RemiAI.png"
            alt="RemiAI"
            className="block h-7 w-auto dark:hidden"
          />
          <img
            src="/RemiAI-Light.png"
            alt="RemiAI"
            className="hidden h-7 w-auto dark:block"
          />
        </div>

        {/* Big greeting text */}
        <p className="relative max-w-md text-center text-3xl font-medium tracking-tight text-foreground/80">
          {greeting}
        </p>

        {/* Subtitle hint */}
        {/* <p className="relative max-w-xs text-center text-sm text-muted-foreground/60">
          Type a message below or pick a starter.
        </p> */}

        {/* Quick action cards */}
        <div className="relative flex max-w-lg flex-wrap justify-center gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => onSend?.(action.prompt)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3.5 py-2 text-xs text-muted-foreground backdrop-blur-sm transition-all duration-200 hover:border-border/80 hover:bg-muted/50 hover:text-foreground active:scale-[0.97]"
              >
                <Icon className="h-3.5 w-3.5 transition-colors duration-200 group-hover:text-primary" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>

        {/* AI start button */}
        {onAiStart && (
          <div className="relative mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/30" />
            <span className="text-xs text-muted-foreground/50">or</span>
            <div className="h-px flex-1 bg-border/30" />
          </div>
        )}
        {onAiStart && (
          <button
            type="button"
            onClick={onAiStart}
            disabled={isAiStarting}
            className="group relative inline-flex items-center gap-2 rounded-xl border border-border/40 bg-primary/[0.1] px-5 py-2.5 text-sm font-medium text-primary transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isAiStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Remi is thinking...</span>
              </>
            ) : (
              <>
                {/* <MessageCirclePlus className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" /> */}
                <span>Let Remi start the conversation</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <ChatMessageProvider value={{ sendMessage: onSend ?? (() => {}) }}>
      <div className="relative flex flex-1 flex-col">
        <div className="flex flex-1 flex-col p-6">
          <div className="flex flex-col gap-4">
            {messages.map((message, idx) => {
              return (
                <div key={message.id}>
                  <MessageBubble
                    message={message}
                    isStreaming={
                      idx === messages.length - 1 && status === "streaming"
                    }
                  />
                </div>
              );
            })}

            {isWaiting && (
              <div className="flex justify-start animate-fade-in">
                <div className="w-full max-w-[85%] px-4 py-3 text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Spacer — massive breathing room for AI response to stream into */}
            <div className="h-64 shrink-0" />
          </div>
        </div>
      </div>
    </ChatMessageProvider>
  );
}
