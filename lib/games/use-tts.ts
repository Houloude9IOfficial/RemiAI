// ── Text-to-Speech Hook — Web Speech API ────────────────────────────

"use client";

import { useCallback, useRef, useEffect, useState } from "react";

export interface TTSOptions {
  /** Volume from 0 to 1 (default 0.8) */
  volume?: number;
  /** Speech rate from 0.1 to 10 (default 1.2 — slightly fast for personality) */
  rate?: number;
  /** Pitch from 0 to 2 (default 1) */
  pitch?: number;
  /** Voice name to use (default: first English voice) */
  voiceName?: string;
}

const DEFAULT_OPTIONS: TTSOptions = {
  volume: 0.8,
  rate: 1.3,
  pitch: 1.0,
};

const VOLUME_KEY = "game-tts-volume";

function loadVolume(): number {
  if (typeof window === "undefined") return 0.8;
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored !== null) {
      const v = Number(stored);
      if (v >= 0 && v <= 1) return v;
    }
  } catch {}
  return 0.8;
}

export function useTTS() {
  const [volume, setVolumeState] = useState(loadVolume);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const optionsRef = useRef<TTSOptions>({ ...DEFAULT_OPTIONS, volume: loadVolume() });
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isMutedRef = useRef(false);

  // Keep ref in sync with state (avoids stale closures in timer callbacks)
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Keep volume in sync with options
  useEffect(() => {
    optionsRef.current.volume = volume;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch {}
  }, [volume]);

  const speak = useCallback(
    (text: string, emoji?: string) => {
      if (isMutedRef.current || !text || typeof window === "undefined") return;
      if (!window.speechSynthesis) return;

      // Cancel any previous speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(
        emoji ? `${emoji}... ${text}` : text,
      );

      const opts = optionsRef.current;
      utterance.volume = opts.volume ?? 0.8;
      utterance.rate = opts.rate ?? 1.3;
      utterance.pitch = opts.pitch ?? 1.0;

      // Try to find a decent English voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.name.includes("Google UK English Female")) ||
        voices.find((v) => v.name.includes("Samantha")) ||
        voices.find((v) => v.lang.startsWith("en") && v.name.includes("Female")) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [], // No deps — uses refs to avoid stale closures
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0, Math.min(1, v)));
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
    if (!isMuted) stopSpeaking();
  }, [isMuted, stopSpeaking]);

  return {
    speak,
    stopSpeaking,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    isSpeaking,
  };
}
