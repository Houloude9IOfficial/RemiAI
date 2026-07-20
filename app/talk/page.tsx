// ── Talk Mode Page ──────────────────────────────────────────────────
// A full-screen voice-only conversation interface with a pulsating
// circle, animated transcript, and premium TTS + ambient sound.
// No text input — just speak, listen, and converse hands-free.
// STT runs continuously for instant interruption support.
// ────────────────────────────────────────────────────────────────────

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Square, Loader2, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import { TalkCircle, type CircleState } from "@/components/talk/TalkCircle";
import { TalkTranscript } from "@/components/talk/TalkTranscript";
import { useAmbientSound } from "@/lib/audio/use-ambient-sound";
import { usePremiumTTS } from "@/lib/audio/use-premium-tts";
import { useSpeechRecognition } from "@/lib/audio/use-speech-recognition";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────

interface TalkMessage {
  role: "user" | "assistant";
  content: string;
}

// ── ElevenLabs config banner dismiss key ───────────────────────────

const ELEVENLABS_BANNER_DISMISSED_KEY = "talk-elevenlabs-banner-dismissed";

interface ElevenLabsStatus {
  hasKey: boolean;
  enabled: boolean;
  ttsEnabled: boolean;
  sttEnabled: boolean;
  voiceId: string | null;
}

// ── Strip markdown and emojis for display and TTS ───────────────────

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
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "") // emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") // symbols & pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "") // transport & map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "") // flags
    .replace(/[\u{2600}-\u{26FF}]/gu, "") // misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, "") // dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "") // variation selectors
    .replace(/[\u{200D}]/gu, "") // zero-width joiner
    .trim();
}

// ── Split text into sentences ───────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Page ────────────────────────────────────────────────────────────

export default function TalkPage() {
  // ── State ──────────────────────────────────────────────────────

  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [streamedText, setStreamedText] = useState("");
  const [spokenText, setSpokenText] = useState("");
  const [currentLine, setCurrentLine] = useState("");
  const [circleState, setCircleState] = useState<CircleState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [hasConversation, setHasConversation] = useState(false);
  const [sttActive, setSttActive] = useState(false);
  const [talkMode, setTalkMode] = useState<"push-to-talk" | "always-listen">("always-listen");
  const [isHolding, setIsHolding] = useState(false);

  // ── ElevenLabs config state ────────────────────────────────────

  const [elevenlabsStatus, setElevenlabsStatus] = useState<ElevenLabsStatus | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  // ── Refs ───────────────────────────────────────────────────────

  const abortRef = useRef<AbortController | null>(null);
  const streamedTextRef = useRef("");
  const spokenTextRef = useRef("");
  const messagesRef = useRef<TalkMessage[]>([]);
  const handleSendRef = useRef<((text: string) => Promise<void>) | null>(null);
  const isInterruptedRef = useRef(false);
  const sttActiveRef = useRef(false);
  useEffect(() => { sttActiveRef.current = sttActive; }, [sttActive]);
  const talkModeRef = useRef(talkMode);
  useEffect(() => { talkModeRef.current = talkMode; }, [talkMode]);

  // ── Audio hooks ────────────────────────────────────────────────

  const ambient = useAmbientSound();
  const tts = usePremiumTTS();

  // ── Speech recognition ────────────────────────────────────────

  const stt = useSpeechRecognition();

  // ── Fetch ElevenLabs config on mount and check dismiss state ──

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
      })
      .catch(() => {
        setElevenlabsStatus(null);
      });
  }, []);

  // ── Auto-start based on talk mode ───────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStarting(false);
      if (talkMode === "always-listen") {
        startSTT();
      }
      // Push-to-talk: STT stays idle until user holds the circle
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start / stop STT helpers ────────────────────────────────────

  const startSTT = useCallback(() => {
    if (!stt.isSupported) return;
    stt.startListening({
      onSilence: (text) => {
        setHasConversation(true);
        handleSendRef.current?.(text);
      },
    });
    setSttActive(true);
    setCircleState("listening");
  }, [stt]);

  const stopSTT = useCallback(() => {
    stt.stopListening();
    setSttActive(false);
    setCircleState("idle");
    setInterimTranscript("");
  }, [stt]);

  // ── Keep refs in sync ──────────────────────────────────────────

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Handle send (ref kept in sync for onSilence) ────────────────

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      // Reset interruption flag for this new send
      isInterruptedRef.current = false;

      const trimmed = text.trim();
      setHasConversation(true);

      // Add user message
      const userMessage: TalkMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      messagesRef.current = updatedMessages;

      // Reset transcript
      setStreamedText("");
      setSpokenText("");
      setCurrentLine("");
      setInterimTranscript("");
      streamedTextRef.current = "";
      spokenTextRef.current = "";

      // Start ambient sound (thinking phase)
      ambient.startAmbient();
      setCircleState("thinking");
      setIsStreaming(true);

      // Create abort controller
      abortRef.current = new AbortController();

      try {
        // Get model info from localStorage
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

        // Send to talk API
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

        if (!response.body) {
          throw new Error("No response body");
        }

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullResponse = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line === "data: [DONE]") continue;
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "text-delta") {
                fullResponse += data.delta ?? "";
                const cleaned = stripMarkdownAndEmojis(fullResponse);

                streamedTextRef.current = fullResponse;
                setStreamedText(fullResponse);

                // Update the spoken text and current line
                spokenTextRef.current += data.delta;
                setSpokenText(stripMarkdownAndEmojis(spokenTextRef.current));

                // Extract the last sentence being formed
                const sentences = splitIntoSentences(cleaned);
                if (sentences.length > 0) {
                  setCurrentLine(sentences[sentences.length - 1]);
                }

                // Switch circle to speaking once we have output
                if (circleState === "thinking") {
                  ambient.stopAmbient();
                  setCircleState("speaking");
                }
              }
            } catch {}
          }
        }

        // Add assistant message
        if (fullResponse) {
          const assistantMessage: TalkMessage = {
            role: "assistant",
            content: fullResponse,
          };
          const finalMessages = [...messagesRef.current, assistantMessage];
          setMessages(finalMessages);
          messagesRef.current = finalMessages;
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("Talk error:", err);
      } finally {
        // Stop STT before TTS to prevent feedback loop
        // (microphone picking up speaker output)
        stt.stopListening();

        // Only speak if not interrupted
        if (!isInterruptedRef.current) {
          const cleaned = stripMarkdownAndEmojis(streamedTextRef.current);
          if (cleaned) {
            setCircleState("speaking");
            await tts.speak(cleaned);
          }
        }

        // Reset streaming state
        setCircleState("listening");
        setIsStreaming(false);
        abortRef.current = null;
        setStreamedText("");
        setCurrentLine("");

        // Restart listening after TTS finishes
        // Always-listen: resume continuous STT
        // Push-to-talk: go idle, wait for next hold
        if (talkModeRef.current === "always-listen" && sttActiveRef.current) {
          stt.startListening({
            onSilence: (text) => {
              setHasConversation(true);
              handleSendRef.current?.(text);
            },
          });
          setCircleState("listening");
        } else {
          setCircleState("idle");
        }
      }
    },
    [isStreaming, ambient, tts, circleState],
  );

  // ── Keep handleSendRef in sync with latest handleSend ──────────

  handleSendRef.current = handleSend;

  // ── Interruption: user speaks while AI is streaming / speaking ──

  useEffect(() => {
    if (stt.interimText && (isStreaming || tts.isSpeaking)) {
      isInterruptedRef.current = true;
      abortRef.current?.abort();
      tts.stopSpeaking();
      ambient.stopAmbient();
      setIsStreaming(false);
      setCircleState("listening");
    }
  }, [stt.interimText, isStreaming, tts.isSpeaking, tts, ambient]);

  // ── Stop streaming ─────────────────────────────────────────────

  const handleStop = useCallback(() => {
    isInterruptedRef.current = true;
    abortRef.current?.abort();
    tts.stopSpeaking();
    ambient.stopAmbient();
    setCircleState("listening");
    setIsStreaming(false);
  }, [tts, ambient]);

  // ── Mic toggle — pause / resume continuous listening ───────────

  const handleMicToggle = useCallback(async () => {
    if (sttActive) {
      stopSTT();
    } else {
      // Check if STT is allowed (ElevenLabs config, defaults to enabled)
      try {
        const res = await fetch("/api/tts");
        if (res.ok) {
          const data = await res.json();
          if (data.sttEnabled === false) {
            return; // STT disabled in Settings > Tools > ElevenLabs
          }
        }
      } catch {}
      startSTT();
    }
  }, [sttActive, startSTT, stopSTT]);

  // ── Push-to-talk: pointer down/up handlers ─────────────────────

  const handlePointerDown = useCallback(() => {
    if (!stt.isSupported || isStreaming) return;
    setHasConversation(true);
    setIsHolding(true);
    setCircleState("listening");
    setInterimTranscript("");
    stt.startListening();
  }, [stt, isStreaming]);

  const handlePointerUp = useCallback(() => {
    setIsHolding(false);
    if (!stt.isSupported) return;

    // Flush accumulated transcript and stop
    const text = stt.flushTranscript();
    stt.stopListening();
    setInterimTranscript("");

    if (text) {
      handleSendRef.current?.(text);
    } else if (!isStreaming) {
      // Only set idle if not already streaming
      setCircleState("idle");
    }
  }, [stt, isStreaming]);

  // ── Show interim transcript while listening ───────────────────

  useEffect(() => {
    if (stt.interimText) {
      setInterimTranscript(stt.interimText);
    }
  }, [stt.interimText]);

  // ── Build transcript lines ─────────────────────────────────────

  const transcriptLines = (() => {
    if (!hasConversation) return [];
    const combined = streamedText || spokenText;
    if (!combined) return [];
    const sentences = splitIntoSentences(stripMarkdownAndEmojis(combined));
    return sentences.map((text, idx) => ({
      id: `tl-${idx}`,
      text,
      isCurrent: idx === sentences.length - 1,
    }));
  })();

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center justify-between border-b border-border/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Chat
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/60">
            Talk
          </span>

          {/* ── Engine status badges ── */}
          {elevenlabsStatus && (
            <div
              className="flex items-center gap-1 rounded-md border border-border/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
              title="Voice engine status"
            >
              <span
                className={cn(
                  "flex items-center gap-1",
                  elevenlabsStatus.hasKey && elevenlabsStatus.ttsEnabled
                    ? "text-primary"
                    : "text-muted-foreground/40",
                )}
              >
                <Volume2 className="h-2.5 w-2.5" />
                <span>{elevenlabsStatus.hasKey && elevenlabsStatus.ttsEnabled ? "AI" : "Sys"}</span>
              </span>

              <span className="text-muted-foreground/20">/</span>

              <span
                className={cn(
                  "flex items-center gap-1",
                  elevenlabsStatus.hasKey && elevenlabsStatus.sttEnabled
                    ? "text-primary"
                    : "text-muted-foreground/40",
                )}
              >
                <Mic className="h-2.5 w-2.5" />
                <span>{elevenlabsStatus.hasKey && elevenlabsStatus.sttEnabled ? "AI" : "Sys"}</span>
              </span>
            </div>
          )}
        </div>

        {/* Mute toggle */}
        <button
          type="button"
          onClick={tts.toggleMute}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200",
            tts.isMuted
              ? "text-muted-foreground/30"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
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

      {/* ── ElevenLabs config banner (dismissible) ── */}
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

              <div className="flex-1 min-w-0">
                <p className="text-[11px] leading-relaxed text-foreground/70">
                  {!elevenlabsStatus.hasKey ? (
                    <>
                      <strong>ElevenLabs</strong> not configured.{' '}
                      <Link
                        href="/settings/tools"
                        className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
                      >
                        Add an API key
                      </Link>{' '}
                      in Settings &gt; Tools for premium AI voice.{' '}
                      <span className="text-muted-foreground/50">
                        Using system TTS and browser speech recognition.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>ElevenLabs</strong> is{' '}
                      configured but{' '}
                      {!elevenlabsStatus.ttsEnabled && (
                        <><span className="text-muted-foreground/50">TTS</span> is disabled.{' '}</>
                      )}
                      {!elevenlabsStatus.sttEnabled && (
                        <><span className="text-muted-foreground/50">STT</span> is disabled.{' '}</>
                      )}
                      {(!elevenlabsStatus.ttsEnabled || !elevenlabsStatus.sttEnabled) && (
                        <Link
                          href="/settings/tools"
                          className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
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
                  className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40 hover:text-foreground transition-colors whitespace-nowrap"
                >
                  Skip forever
                </button>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 hover:text-foreground hover:bg-muted transition-colors"
                >
                  <span className="text-xs">✕</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {isStarting ? (
            <motion.div
              key="starting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground/30">
                Preparing talk mode...
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="talk-interface"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex w-full max-w-xl flex-col items-center gap-8"
            >
              {/* ── Circle ── */}
              <TalkCircle
                state={circleState}
                isMuted={tts.isMuted}
                pressed={isHolding}
                onClick={talkMode === "always-listen" ? handleMicToggle : undefined}
                onPointerDown={talkMode === "push-to-talk" ? handlePointerDown : undefined}
                onPointerUp={talkMode === "push-to-talk" ? handlePointerUp : undefined}
                className="mb-2"
              />

              {/* ── Transcript Area ── */}
              <div className="flex min-h-[100px] w-full items-center justify-center">
                {!hasConversation && !interimTranscript ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <p className="text-center text-sm text-muted-foreground/40">
                      {talkMode === "push-to-talk"
                        ? "Hold to speak"
                        : sttActive
                          ? "Listening..."
                          : "Microphone paused"}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/20">
                      <span className="inline-block h-1 w-1 rounded-full bg-muted-foreground/20" />
                      <span>
                        {talkMode === "push-to-talk"
                          ? "Press and hold the circle"
                          : "Speak to start a conversation"}
                      </span>
                    </div>
                  </motion.div>
                ) : sttActive && interimTranscript ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="flex items-center gap-1">
                      <p className="text-base italic text-muted-foreground/60">
                        {interimTranscript}
                      </p>
                      <motion.span
                        className="inline-block h-4 w-[2px] bg-primary/50"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 uppercase tracking-wider">
                      Speak now
                    </span>
                  </motion.div>
                ) : transcriptLines.length === 0 && isStreaming ? (
                  <>
                    {/* CSS keyframes for perpetually staggered thinking dots */}
                    <style>
                      {`
                        @keyframes dot-pulse {
                          0%, 100% { opacity: 0.3; transform: scale(1); }
                          50% { opacity: 1; transform: scale(1.2); }
                        }
                        .dot-1 { animation: dot-pulse 1.2s ease-in-out infinite; }
                        .dot-2 { animation: dot-pulse 1.2s ease-in-out 0.4s infinite; }
                        .dot-3 { animation: dot-pulse 1.2s ease-in-out 0.8s infinite; }
                      `}
                    </style>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex flex-col items-center gap-3 text-sm"
                    >
                      {/* Staggered ellipsis dots */}
                      <div className="flex items-center gap-1.5">
                        <span className="dot-1 inline-block h-2 w-2 rounded-full bg-primary/40" />
                        <span className="dot-2 inline-block h-2 w-2 rounded-full bg-primary/40" />
                        <span className="dot-3 inline-block h-2 w-2 rounded-full bg-primary/40" />
                      </div>
                      <motion.p
                        className="text-xs text-muted-foreground/30 uppercase tracking-[0.12em]"
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        Thinking
                      </motion.p>
                    </motion.div>
                  </>
                ) : transcriptLines.length > 0 ? (
                  <TalkTranscript
                    lines={transcriptLines}
                    className="w-full"
                  />
                ) : !sttActive && talkMode === "always-listen" ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-muted-foreground/30"
                  >
                    Microphone paused &mdash; tap to resume
                  </motion.p>
                ) : null}
              </div>

              {/* ── Controls ── */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center gap-3">
                  {/* In always-listen: mic toggle. In push-to-talk: mode indicator */}
                  {talkMode === "always-listen" ? (
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      disabled={!stt.isSupported}
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200",
                        sttActive
                          ? "bg-red-500/10 text-red-500 hover:bg-red-500/15"
                          : "bg-muted/30 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50",
                        !stt.isSupported && "opacity-30 cursor-not-allowed",
                      )}
                      title={
                        !stt.isSupported
                          ? "Speech recognition not available in this browser"
                          : sttActive
                            ? "Pause microphone"
                            : "Resume microphone"
                      }
                    >
                      {sttActive ? (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <Mic className="h-5 w-5" />
                        </motion.div>
                      ) : !stt.isSupported ? (
                        <MicOff className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </button>
                  ) : (
                    <motion.div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200",
                        isHolding
                          ? "bg-red-500/15 text-red-500"
                          : "bg-muted/30 text-muted-foreground/40",
                      )}
                    >
                      <Mic className="h-5 w-5" />
                    </motion.div>
                  )}

                  {/* Stop button (only during streaming) */}
                  {isStreaming && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all duration-200"
                      title="Stop and cancel"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* ── Mode toggle ── */}
                <div className="flex items-center gap-1 rounded-full border border-border/20 bg-muted/10 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (talkMode !== "push-to-talk") {
                        stopSTT();
                        setTalkMode("push-to-talk");
                        setCircleState("idle");
                      }
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-[9px] font-medium uppercase tracking-wider transition-all duration-200",
                      talkMode === "push-to-talk"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground/30 hover:text-muted-foreground/60",
                    )}
                  >
                    Push to Talk
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (talkMode !== "always-listen") {
                        setTalkMode("always-listen");
                        startSTT();
                      }
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-[9px] font-medium uppercase tracking-wider transition-all duration-200",
                      talkMode === "always-listen"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground/30 hover:text-muted-foreground/60",
                    )}
                  >
                    Always Listen
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
