// ── Talk Mode Page ──────────────────────────────────────────────────
// A full-screen voice conversation: you speak, the assistant answers out
// loud, and you can cut it off mid-sentence simply by talking.
//
// Turn lifecycle
//   listening ─(silence)─▶ thinking ─▶ speaking ─▶ listening
//
// The microphone stays open for the whole turn so interruption works even
// while the assistant is talking. Echo protection: every sentence handed
// to the speaker is remembered, and a transcript that mostly matches it is
// treated as the assistant's own voice coming back through the mic rather
// than as you — that guard is what stops stray noise (and the assistant's
// own voice) from constantly killing replies.
//
// The circle state is derived from the audio hooks rather than stored, so
// the UI can never drift out of sync with what is actually happening.
// ────────────────────────────────────────────────────────────────────

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Square, Loader2, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import { TalkCircle, type CircleState } from "@/components/talk/TalkCircle";
import { TalkTranscript } from "@/components/talk/TalkTranscript";
import { usePremiumTTS } from "@/lib/audio/use-premium-tts";
import { useSpeechRecognition } from "@/lib/audio/use-speech-recognition";
import { cn } from "@/lib/utils";
import { errorToDisplayMessage } from "@/lib/chat/error-payload";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────────

interface TalkMessage {
  role: "user" | "assistant";
  content: string;
}

interface TalkUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

type TalkMode = "always-listen" | "push-to-talk";

interface ElevenLabsStatus {
  hasKey: boolean;
  enabled: boolean;
  ttsEnabled: boolean;
  sttEnabled: boolean;
  voiceId: string | null;
}

const ELEVENLABS_BANNER_DISMISSED_KEY = "talk-elevenlabs-banner-dismissed";

// Interruption thresholds. A turn is only cut off by something that looks
// like an actual spoken phrase, not a cough or a single stray word.
const BARGE_IN_MIN_WORDS = 2;
const BARGE_IN_MIN_CHARS = 7;
// Above this share of overlapping words with what the assistant is saying,
// the transcript is assumed to be the assistant's own voice.
const ECHO_OVERLAP_RATIO = 0.6;
// Rolling window of assistant speech used as the echo reference.
const ECHO_WINDOW_CHARS = 600;

// ── Helpers ─────────────────────────────────────────────────────────

function stripMarkdownAndEmojis(text: string): string {
  return text
    // Remove markdown links: [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove markdown images: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove bold/italic markers
    .replace(/(\*{1,3}|_{1,3})/g, "")
    // Remove heading markers
    .replace(/^#{1,6}\s*/gm, "")
    // Remove horizontal rules
    .replace(/^---+$/gm, "")
    // Remove blockquote markers
    .replace(/^>\s*/gm, "")
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Remove HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove emojis and other Unicode symbols
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .trim();
}

/** Split accumulated text into sentences (newest fragment last). */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Reasoning / thinking blocks ─────────────────────────────────────
// Some models emit their private working inline, wrapped in tags:
// <think>…</think>,  thinking…, <reasoning>…</reasoning>. That text must
// never be captioned or read aloud — it is the model thinking out loud,
// not the answer.
const COMPLETE_REASONING_RE = /<\s*(?:think|thinking|reasoning|analysis)\s*>[\s\S]*?<\s*\/\s*(?:think|thinking|reasoning|analysis)\s*>/gi;
const OPEN_REASONING_RE = /<\s*(?:think|thinking|reasoning|analysis)\s*>/i;

/**
 * Strip reasoning text from a *partial* buffer.
 *
 * Complete blocks are removed outright. An unterminated opening tag
 * truncates the text instead, because everything after it is still inside
 * the model's working — and a half-finished thought must not leak out as
 * an answer.
 */
function stripReasoning(text: string): string {
  let out = text.replace(COMPLETE_REASONING_RE, "");
  const openIndex = out.search(OPEN_REASONING_RE);
  if (openIndex >= 0) out = out.slice(0, openIndex);
  return out.trim();
}

/** The text as it should be captioned and spoken. */
function toVoiceText(text: string): string {
  return stripMarkdownAndEmojis(stripReasoning(text));
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** True when `text` is largely made of words the assistant is saying. */
function isLikelyEcho(text: string, reference: string): boolean {
  const spoken = wordsOf(text);
  if (spoken.length === 0) return false;
  const ref = new Set(wordsOf(reference));
  if (ref.size === 0) return false;

  let matches = 0;
  for (const word of spoken) {
    if (ref.has(word)) matches += 1;
  }
  return matches / spoken.length >= ECHO_OVERLAP_RATIO;
}

// ── Page ────────────────────────────────────────────────────────────

export default function TalkPage() {
  // ── State ──────────────────────────────────────────────────────

  const [messages, setMessages] = useState<TalkMessage[]>([]);
  // UI-only transcript for the current voice turn. `messages` remains the
  // complete logical history sent to the model.
  const [visibleMessages, setVisibleMessages] = useState<TalkMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [streamedText, setStreamedText] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [hasConversation, setHasConversation] = useState(false);
  const [sttActive, setSttActive] = useState(false);
  const [talkMode, setTalkMode] = useState<TalkMode>("always-listen");
  const [isHolding, setIsHolding] = useState(false);
  const [elevenlabsStatus, setElevenlabsStatus] = useState<ElevenLabsStatus | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [talkUsage, setTalkUsage] = useState<TalkUsage>({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  const [activeSpeechText, setActiveSpeechText] = useState("");
  const [waitingForResponse, setWaitingForResponse] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<TalkMessage[]>([]);
  const handleSendRef = useRef<((text: string) => void) | null>(null);
  const startSTTRef = useRef<(() => void) | null>(null);
  const sttActiveRef = useRef(false);
  const talkModeRef = useRef(talkMode);
  const isHoldingRef = useRef(false);

  // Turn bookkeeping — `turnRef` identifies the reply currently in flight
  // so a superseded turn can never touch the UI or the speaker.
  const turnRef = useRef(0);
  const isRespondingRef = useRef(false);
  const bargeInUsedRef = useRef(false);
  // Text streamed so far this turn (raw, reasoning tags included).
  const speechBufferRef = useRef("");
  // How many sentences of the visible reply have been handed to the speaker.
  const spokenSentencesRef = useRef(0);
  // What the assistant is saying right now (echo reference).
  const spokenBufferRef = useRef("");
  // Resolves when the most recently queued utterance has been spoken.
  const lastSpeakRef = useRef<Promise<void>>(Promise.resolve());

  // ── Audio hooks ────────────────────────────────────────────────

  const tts = usePremiumTTS();
  const stt = useSpeechRecognition();
  // Hooks return a fresh object each render but memoise their callbacks, so
  // pulling these out keeps effect dependency arrays stable.
  const { setEngine: setTtsEngine, stopSpeaking: stopTts, speak: speakTts } = tts;
  const { flushTranscript, clearError, startListening, stopListening, isSupported } = stt;

  useEffect(() => { sttActiveRef.current = sttActive; }, [sttActive]);
  useEffect(() => { talkModeRef.current = talkMode; }, [talkMode]);
  useEffect(() => { isHoldingRef.current = isHolding; }, [isHolding]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Assistant speech ───────────────────────────────────────────

  const queueSpeech = useCallback(
    (raw: string): Promise<void> => {
      const clean = stripMarkdownAndEmojis(raw);
      if (clean.length < 2) return Promise.resolve();
      spokenBufferRef.current = `${spokenBufferRef.current} ${clean}`.slice(
        -ECHO_WINDOW_CHARS,
      );
      // TTS itself is queued. Wait for the previous sentence before moving
      // the highlight, otherwise fast streaming would highlight the last
      // queued sentence while an earlier one is still being spoken.
      const run = lastSpeakRef.current.then(async () => {
        setActiveSpeechText(clean);
        try {
          await speakTts(clean);
        } finally {
          setActiveSpeechText((current) => (current === clean ? "" : current));
        }
      });
      lastSpeakRef.current = run.catch(() => undefined);
      return run;
    },
    [speakTts],
  );

  // ── Send a turn ────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // If a reply is still in flight, this message replaces it.
      if (isRespondingRef.current) {
        abortRef.current?.abort();
        stopTts();
        isRespondingRef.current = false;
      }

      const turn = ++turnRef.current;
      const isCurrentTurn = () => turnRef.current === turn;

      bargeInUsedRef.current = false;
      speechBufferRef.current = "";
      spokenSentencesRef.current = 0;
      spokenBufferRef.current = "";

      setHasConversation(true);
      setInterimTranscript("");
      setWaitingForResponse(true);

      const userMessage: TalkMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      setVisibleMessages([userMessage]);
      messagesRef.current = updatedMessages;

      setStreamedText("");
      setIsStreaming(true);
      isRespondingRef.current = true;
      abortRef.current = new AbortController();

      let fullResponse = "";

      try {
        // Model selection mirrors chat: whatever was used last.
        let providerId: number | undefined;
        let modelId: string | undefined;
        try {
          const lastModel = localStorage.getItem("lastModel");
          if (lastModel) {
            const parsed = JSON.parse(lastModel);
            if (typeof parsed.providerId === "number") providerId = parsed.providerId;
            if (typeof parsed.modelId === "string") modelId = parsed.modelId;
          }
        } catch {}

        const response = await fetch("/api/talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages,
            providerId,
            modelId,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error ?? "Request failed");
        }
        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line === "data: [DONE]" || !line.startsWith("data: ")) continue;

            let data: { type?: string; delta?: string; errorText?: string; error?: string; inputTokens?: number; outputTokens?: number; costUsd?: number };
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue; // partial line
            }

            if (data.type === "text-delta") {
              setWaitingForResponse(false);
              const delta = data.delta ?? "";
              if (!delta) continue;

              fullResponse += delta;
              setStreamedText(fullResponse);

              // Speak finished sentences as they arrive so the assistant
              // starts talking while the rest is still being generated.
              // Only sentences *before* the last one are complete; the
              // trailing fragment is spoken when the turn ends.
              speechBufferRef.current += delta;
              const sentences = splitSentences(stripReasoning(speechBufferRef.current));
              const complete = Math.max(0, sentences.length - 1);
              for (let i = spokenSentencesRef.current; i < complete; i++) {
                lastSpeakRef.current = queueSpeech(sentences[i]);
              }
              // Never move backwards: if text disappears (a reasoning block
              // opened), the already-spoken sentences stay accounted for.
              spokenSentencesRef.current = Math.max(
                spokenSentencesRef.current,
                complete,
              );
              continue;
            }

            if (data.type === "clear-text") {
              // The model started a tool call — everything streamed so far
              // was working narration ("let me look that up"), not the
              // answer. Drop it and stop reading it out.
              fullResponse = "";
              speechBufferRef.current = "";
              spokenSentencesRef.current = 0;
              spokenBufferRef.current = "";
              setStreamedText("");
              stopTts();
              continue;
            }

            if (data.type === "usage") {
              setTalkUsage((current) => ({
                inputTokens: current.inputTokens + (data.inputTokens ?? 0),
                outputTokens: current.outputTokens + (data.outputTokens ?? 0),
                costUsd: current.costUsd + (data.costUsd ?? 0),
              }));
              continue;
            }

            if (data.type === "error") {
              const mapped = errorToDisplayMessage(
                data.errorText ?? data.error ?? "Talk stream failed",
              );
              throw new Error(
                mapped.message ? `${mapped.title}\n${mapped.message}` : mapped.title,
              );
            }
          }
        }

        if (fullResponse) {
          const assistantMessage: TalkMessage = {
            role: "assistant",
            // Reasoning is stripped from history too — replaying a model's
            // private working would prime it to think out loud again.
            content: stripReasoning(fullResponse),
          };
          const finalMessages = [...messagesRef.current, assistantMessage];
          setMessages(finalMessages);
          setVisibleMessages([userMessage, assistantMessage]);
          messagesRef.current = finalMessages;
        }
      } catch (err) {
        // AbortError means a barge-in or the stop button already took over.
        if ((err as { name?: string })?.name === "AbortError") return;
        if (!isCurrentTurn()) return;
        console.error("Talk error:", err);
        const mapped = errorToDisplayMessage(err);
        toast.error(mapped.title, {
          description: mapped.message,
          duration: 5000,
        });
      } finally {
        if (isCurrentTurn()) {
          setIsStreaming(false);
          setWaitingForResponse(false);
        }
      }

      if (!isCurrentTurn()) return;

      // Speak the sentences that only became complete at the very end, then
      // wait for the queue to drain. "Responding" stays true until then so
      // the reply can still be interrupted mid-sentence.
      const finalSentences = splitSentences(stripReasoning(speechBufferRef.current));
      const tail = finalSentences.slice(spokenSentencesRef.current).join(" ").trim();
      spokenSentencesRef.current = finalSentences.length;
      speechBufferRef.current = "";
      if (tail) lastSpeakRef.current = queueSpeech(tail);
      await lastSpeakRef.current;

      if (!isCurrentTurn()) return;
      isRespondingRef.current = false;
      // Captions are disposable UI state. Keep the full conversation in
      // `messages`, but clear the finished voice turn from the screen.
      setVisibleMessages([]);
      setStreamedText("");
    },
    [stopTts, queueSpeech],
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // ── Recognition callbacks ──────────────────────────────────────

  const handleTranscript = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    // Clear the previous reply at the exact recognition boundary. Waiting
    // for handleSend's async work leaves one paint where the old reply wins.
    setStreamedText("");
    setInterimTranscript("");
    setVisibleMessages([]);
    setIsStreaming(true);
    setWaitingForResponse(true);
    handleSendRef.current?.(clean);
  }, []);

  /**
   * Live captions + interruption detection. Running this inside the
   * recognizer's own callback (rather than an effect on `interimText`)
   * keeps it out of the render cycle and only fires on real results.
   */
  const handleInterim = useCallback(
    (interim: string) => {
      const text = interim.trim();
      if (!text) {
        setInterimTranscript("");
        return;
      }

      // While the assistant is talking, its voice can come back through the
      // mic. Ignore those words for the caption too, or it looks like the
      // user said them.
      const isEcho =
        isRespondingRef.current && isLikelyEcho(text, spokenBufferRef.current);
      setInterimTranscript(isEcho ? "" : text);

      if (isEcho) return;
      if (isHoldingRef.current) return; // push-to-talk owns the mic
      if (!isRespondingRef.current || bargeInUsedRef.current) return;
      if (text.length < BARGE_IN_MIN_CHARS) return;
      if (wordsOf(text).length < BARGE_IN_MIN_WORDS) return;

      bargeInUsedRef.current = true;

      // Drop everything captured so far: it is overwhelmingly the
      // assistant's voice. The phrase being spoken now keeps accumulating
      // from the next recognition event.
      flushTranscript();
      abortRef.current?.abort();
      stopTts();
      isRespondingRef.current = false;
      setIsStreaming(false);
    },
    [flushTranscript, stopTts],
  );

  // ── STT lifecycle ──────────────────────────────────────────────

  const startSTT = useCallback(async () => {
    if (!isSupported) return;

    const started = await startListening({
      onSilence: handleTranscript,
      onInterim: handleInterim,
      onError: () => {
        setSttActive(false);
        setIsHolding(false);
      },
    });

    if (!started) {
      setSttActive(false);
      return;
    }
    setSttActive(true);
  }, [isSupported, startListening, handleTranscript, handleInterim]);

  useEffect(() => {
    startSTTRef.current = startSTT;
  }, [startSTT]);

  const stopSTT = useCallback(() => {
    stopListening();
    setSttActive(false);
    setIsHolding(false);
    setInterimTranscript("");
  }, [stopListening]);

  // ── ElevenLabs config + engine selection ───────────────────────

  useEffect(() => {
    let isDismissed = true;
    try {
      isDismissed = localStorage.getItem(ELEVENLABS_BANNER_DISMISSED_KEY) === "true";
    } catch {}

    fetch("/api/tts")
      .then((res) => res.json())
      .then((data: ElevenLabsStatus) => {
        setElevenlabsStatus(data);
        if (!isDismissed) {
          const isFullyActive = data.hasKey && data.enabled && data.ttsEnabled && data.sttEnabled;
          setBannerDismissed(isFullyActive);
        }
        // Prefer the AI voice whenever it's available — it is markedly
        // calmer and more natural than any system voice.
        const aiVoiceReady = data.hasKey && data.enabled && data.ttsEnabled;
        setTtsEngine(aiVoiceReady ? "elevenlabs" : "system");
      })
      .catch(() => setElevenlabsStatus(null));
  }, [setTtsEngine]);

  // ── Auto-start ─────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStarting(false);
      if (talkMode === "always-listen") {
        // Through the ref: this closure is from the first render, where
        // `isSupported` is still false.
        startSTTRef.current?.();
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ───────────────────────────────────────────────────

  const handleMicToggle = useCallback(async () => {
    if (sttActive) {
      stopSTT();
      return;
    }
    // The mic can be switched off in Settings > Tools > ElevenLabs.
    try {
      const res = await fetch("/api/tts");
      if (res.ok) {
        const data = await res.json();
        if (data.sttEnabled === false) return;
      }
    } catch {}
    await startSTT();
  }, [sttActive, startSTT, stopSTT]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    stopTts();
    isRespondingRef.current = false;
    setIsStreaming(false);
  }, [stopTts]);

  const handleRetryMic = useCallback(() => {
    clearError();
    if (talkModeRef.current === "always-listen") startSTTRef.current?.();
  }, [clearError]);

  // ── Push-to-talk ───────────────────────────────────────────────

  const handlePointerDown = useCallback(async () => {
    if (!isSupported || isRespondingRef.current) return;
    setHasConversation(true);
    setIsHolding(true);
    setInterimTranscript("");
    const started = await startListening({ onInterim: handleInterim });
    if (!started) setIsHolding(false);
  }, [isSupported, startListening, handleInterim]);

  const handlePointerUp = useCallback(() => {
    setIsHolding(false);
    if (!isSupported) return;

    const text = flushTranscript();
    stopListening();
    setInterimTranscript("");

    if (text) {
      setStreamedText("");
      setVisibleMessages([]);
      setIsStreaming(true);
      setWaitingForResponse(true);
      handleSendRef.current?.(text);
    }
  }, [isSupported, flushTranscript, stopListening]);

  // ── Derived state ──────────────────────────────────────────────

  const transcriptText = toVoiceText(streamedText);
  const isVoiceActive = isStreaming || tts.isSpeaking;

  // Single source of truth for the circle — computed, never stored, so it
  // cannot drift out of sync with the audio pipeline.
  const circleState: CircleState = isHolding
    ? "listening"
    : tts.isSpeaking
      ? "speaking"
      : waitingForResponse || isStreaming
        ? "thinking"
        : talkMode === "always-listen" && sttActive
          ? "listening"
          : "idle";

  type Status = "starting" | "interim" | "thinking" | "reply" | "listening" | "paused";
  const status: Status = isStarting
    ? "starting"
    : interimTranscript
      ? "interim"
      : waitingForResponse || isStreaming
        ? "thinking"
        : transcriptText
          ? "reply"
          : talkMode === "push-to-talk"
            ? "paused"
            : sttActive
              ? "listening"
              : "paused";

  const aiVoiceActive =
    !!elevenlabsStatus?.hasKey && !!elevenlabsStatus?.ttsEnabled && tts.engine === "elevenlabs";

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
      {/* ── Header ── */}
      <div className="relative z-10 flex items-center justify-between border-b border-border/30 px-4 py-2.5">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Chat
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/60">
            Talk
          </span>

          {/* Engine status */}
          {elevenlabsStatus && (
            <div className="flex items-center gap-1 rounded-md border border-border/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider">
              <span
                className={cn(
                  "flex items-center gap-1",
                  aiVoiceActive ? "text-primary" : "text-muted-foreground/40",
                )}
                title={aiVoiceActive ? "Voice: ElevenLabs" : "Voice: system"}
              >
                <Volume2 className="h-2.5 w-2.5" />
                <span>{aiVoiceActive ? "AI" : "Sys"}</span>
              </span>

              <span className="text-muted-foreground/20">/</span>

              <span
                className={cn(
                  "flex items-center gap-1",
                  sttActive ? "text-primary" : "text-muted-foreground/40",
                )}
                title="Speech recognition: browser"
              >
                <Mic className="h-2.5 w-2.5" />
                <span>{sttActive ? "On" : "Off"}</span>
              </span>
            </div>
          )}

          {/* Mute */}
          <button
            type="button"
            onClick={tts.toggleMute}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200",
              tts.isMuted
                ? "text-muted-foreground/30"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            title={tts.isMuted ? "Unmute voice" : "Mute voice"}
          >
            {tts.isMuted ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ── ElevenLabs setup banner ── */}
      <AnimatePresence>
        {elevenlabsStatus && !bannerDismissed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-b border-border/20"
          >
            <div className="flex items-start gap-3 bg-primary/[0.02] px-4 py-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/20">
                <span className="text-[9px] font-bold text-primary/60">i</span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] leading-relaxed text-foreground/70">
                  {!elevenlabsStatus.hasKey ? (
                    <>
                      <strong>ElevenLabs</strong> not configured.{" "}
                      <Link
                        href="/settings/tools"
                        className="text-primary underline underline-offset-2 transition-opacity hover:opacity-80"
                      >
                        Add an API key
                      </Link>{" "}
                      in Settings &gt; Tools for a calmer, better voice.{" "}
                      <span className="text-muted-foreground/50">
                        Using the browser voice for now.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>ElevenLabs</strong> is configured but{" "}
                      {!elevenlabsStatus.ttsEnabled && (
                        <>
                          <span className="text-muted-foreground/50">TTS</span> is disabled.{" "}
                        </>
                      )}
                      {!elevenlabsStatus.sttEnabled && (
                        <>
                          <span className="text-muted-foreground/50">STT</span> is disabled.{" "}
                        </>
                      )}
                      {(!elevenlabsStatus.ttsEnabled || !elevenlabsStatus.sttEnabled) && (
                        <Link
                          href="/settings/tools"
                          className="text-primary underline underline-offset-2 transition-opacity hover:opacity-80"
                        >
                          Enable in Settings
                        </Link>
                      )}
                    </>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setBannerDismissed(true);
                    try {
                      localStorage.setItem(ELEVENLABS_BANNER_DISMISSED_KEY, "true");
                    } catch {}
                  }}
                  className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-foreground"
                >
                  Skip forever
                </button>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  aria-label="Dismiss"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span className="text-xs">✕</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Microphone / recognition error ── */}
      <AnimatePresence>
        {stt.error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-b border-border/20"
          >
            <div className="flex items-start gap-3 bg-destructive/[0.04] px-4 py-3">
              <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/70" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] leading-relaxed text-foreground/70">
                  {stt.error.message}
                </p>
                <button
                  type="button"
                  onClick={handleRetryMic}
                  className="mt-1.5 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Try again
                </button>
              </div>
              <button
                type="button"
                onClick={clearError}
                aria-label="Dismiss microphone error"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="text-xs">✕</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-10 px-6 py-6">
        {isStarting ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/30">
              Preparing talk mode… {talkUsage.costUsd > 0 ? `Session usage $${talkUsage.costUsd.toFixed(4)}` : ""}
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="flex w-full max-w-xl flex-col items-center gap-12"
          >
            <TalkCircle
              state={circleState}
              isMuted={tts.isMuted}
              pressed={isHolding}
              onClick={talkMode === "always-listen" ? handleMicToggle : undefined}
              onPointerDown={talkMode === "push-to-talk" ? handlePointerDown : undefined}
              onPointerUp={talkMode === "push-to-talk" ? handlePointerUp : undefined}
            />

            {/* Caption area — one region, five states */}
            <div className="flex min-h-28 w-full items-center justify-center">
              <AnimatePresence mode="wait">
                {status === "interim" ? (
                  <motion.div
                    key="interim"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <p className="max-w-xl text-center text-lg text-foreground/80">
                      {interimTranscript}
                    </p>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/30">
                      Listening to you
                    </span>
                  </motion.div>
                ) : status === "thinking" ? (
                  <motion.div
                    key="thinking"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1.5"
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-primary/40"
                        animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          delay: i * 0.18,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </motion.div>
                ) : status === "reply" ? (
                  <motion.div
                    key="reply"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full"
                  >
                    <TalkTranscript
                      text={transcriptText}
                      messages={visibleMessages}
                      activeText={activeSpeechText}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, delay: status === "listening" ? 0.3 : 0 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <p className="text-center text-sm text-muted-foreground/40">
                      {status === "listening"
                        ? hasConversation
                          ? "Go ahead, I'm listening"
                          : "Say something to start"
                        : talkMode === "push-to-talk"
                          ? "Hold the circle to talk"
                          : "Microphone paused"}
                    </p>
                    <span className="text-[10px] text-muted-foreground/25">
                      {talkMode === "push-to-talk"
                        ? "Release to send"
                        : "Talk over the assistant any time to interrupt"}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center gap-3">
                {isVoiceActive ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-200 hover:bg-primary/20"
                    title="Stop and cancel"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : talkMode === "always-listen" ? (
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    disabled={!isSupported}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200",
                      sttActive
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/15"
                        : "bg-muted/30 text-muted-foreground/50 hover:bg-muted/50 hover:text-foreground",
                      !isSupported && "cursor-not-allowed opacity-30",
                    )}
                    title={
                      !isSupported
                        ? "Speech recognition not available in this browser"
                        : sttActive
                          ? "Pause microphone"
                          : "Resume microphone"
                    }
                  >
                    <Mic className="h-4.5 w-4.5" />
                  </button>
                ) : (
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200",
                      isHolding
                        ? "bg-red-500/15 text-red-500"
                        : "bg-muted/30 text-muted-foreground/40",
                    )}
                  >
                    <Mic className="h-4.5 w-4.5" />
                  </div>
                )}
              </div>

              {/* Mode toggle */}
              <div className="flex items-center gap-1 rounded-full border border-border/20 bg-muted/10 p-0.5">
                {(
                  [
                    { id: "push-to-talk", label: "Push to Talk" },
                    { id: "always-listen", label: "Always Listen" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      if (talkMode === mode.id) return;
                      stopSTT();
                      setTalkMode(mode.id);
                      if (mode.id === "always-listen") void startSTTRef.current?.();
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-[9px] font-medium uppercase tracking-wider transition-all duration-200",
                      talkMode === mode.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground/30 hover:text-muted-foreground/60",
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {talkUsage.costUsd > 0 && (
                <span className="text-[10px] text-muted-foreground/35" title="Reference usage estimate; your provider may bill separately">
                  Session usage · ${talkUsage.costUsd.toFixed(4)} · {talkUsage.inputTokens + talkUsage.outputTokens} tokens
                </span>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
