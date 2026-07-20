// ── Speech-to-Text Hook — Web Speech API ────────────────────────────
// Cross-browser speech recognition using the Web Speech API.
// Supports Chrome, Edge, Safari (with webkit prefix).
// Provides interim results, final transcripts, and continuous listening
// mode with silence detection (no need to manually restart).
// ────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useState, useEffect } from "react";

// ── Types ───────────────────────────────────────────────────────────

export type SpeechState = "idle" | "listening" | "processing";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

// ── Browser detection ──────────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function getSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const Klass = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Klass ? new Klass() : null;
}

// ── Constants ───────────────────────────────────────────────────────

const SILENCE_TIMEOUT_MS = 1500;

// ── Hook ────────────────────────────────────────────────────────────

export function useSpeechRecognition() {
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const onSilenceRef = useRef<((text: string) => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualStopRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  // ── Silence timer — fires onSilence, never stops recognition ────

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      const transcript = finalTranscriptRef.current.trim();
      if (transcript) {
        finalTranscriptRef.current = "";
        onSilenceRef.current?.(transcript);
      }
      // Keep listening — reset timer for next utterance
      resetSilenceTimer();
    }, SILENCE_TIMEOUT_MS);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── Start listening (continuous) ────────────────────────────────

  const startListening = useCallback(
    (options?: { onSilence?: (text: string) => void }) => {
      const recognition = getSpeechRecognition();
      if (!recognition) return;

      // Abort any previous session
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      manualStopRef.current = false;
      onSilenceRef.current = options?.onSilence ?? null;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      recognition.onstart = () => {
        setSpeechState("listening");
        setInterimText("");
        setFinalText("");
        finalTranscriptRef.current = "";
        resetSilenceTimer();
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (final) {
          finalTranscriptRef.current += final;
          setFinalText((prev) => prev + final);
        }

        setInterimText(interim);
        resetSilenceTimer();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "no-speech" || event.error === "aborted") {
          recognition.stop();
          return;
        }
        setSpeechState("idle");
        setInterimText("");
      };

      recognition.onend = () => {
        clearSilenceTimer();
        // Only auto-restart if this recognition is still the current one
        // (prevents double-recognition when startListening is called again)
        if (!manualStopRef.current && recognitionRef.current === recognition) {
          try {
            recognition.start();
          } catch {
            setSpeechState("idle");
          }
        } else {
          setSpeechState("idle");
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (err) {
        console.warn("Failed to start speech recognition:", err);
        setSpeechState("idle");
      }
    },
    [resetSilenceTimer, clearSilenceTimer],
  );

  // ── Stop listening ─────────────────────────────────────────────

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    finalTranscriptRef.current = "";
    setSpeechState("idle");
    setInterimText("");
    setFinalText("");
    clearSilenceTimer();
  }, [clearSilenceTimer]);

  // ── Toggle listening ───────────────────────────────────────────

  const toggleListening = useCallback(
    (options?: { onSilence?: (text: string) => void }) => {
      if (speechState === "listening") {
        stopListening();
      } else {
        startListening(options);
      }
    },
    [speechState, startListening, stopListening],
  );

  // ── Flush transcript ───────────────────────────────────────────
  // Returns the accumulated final text and clears it, without stopping
  // the recognition. Useful for push-to-talk where we want to grab the
  // transcript and keep listening (or stop separately).

  const flushTranscript = useCallback((): string => {
    const text = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = "";
    setFinalText("");
    setInterimText("");
    return text;
  }, []);

  return {
    speechState,
    interimText,
    finalText,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    flushTranscript,
  };
}
