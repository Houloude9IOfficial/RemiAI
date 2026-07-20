// ── Premium Text-to-Speech Hook ─────────────────────────────────────
// Enhanced TTS with intelligent voice selection + optional ElevenLabs.
// Works on both Mac and Windows with best available system voice.
// ────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────

export type TtsEngine = "system" | "elevenlabs";

export interface TTSOptions {
  /** Volume 0–1 (default 0.8) */
  volume?: number;
  /** Speech rate 0.1–10 (default 1.1 — natural pace) */
  rate?: number;
  /** Pitch 0–2 (default 0.9 — slightly deeper) */
  pitch?: number;
  /** Which engine to use */
  engine?: TtsEngine;
}

// ── Constants ───────────────────────────────────────────────────────

const TTS_VOLUME_KEY = "tts-volume";
const TTS_MUTED_KEY = "tts-muted";
const TTS_ENGINE_KEY = "tts-engine";

const DEFAULT_OPTIONS: TTSOptions = {
  volume: 0.7,
  rate: 1.1,
  pitch: 0.9,
  engine: "system",
};

// ── Voice preference lists (ordered by preference) ──────────────────
// These work on different platforms:
//   macOS: Samantha, Daniel, Tom, Karen, Moira, Alex, Fred
//   Windows: Microsoft David, Microsoft Mark, Microsoft Zira
//   Chrome OS: Google UK English Male, Google UK English Female

const PREFERRED_VOICES = [
  // British male voices (Jarvis-like)
  "google uk english male",
  "daniel",
  "tom",
  "oliver",
  "arthur",
  // Deep US male voices
  "alex",
  "fred",
  "microsoft david",
  "microsoft mark",
  // Fallback female voices
  "samantha",
  "karen",
  "moira",
  "google uk english female",
];

// ── Helpers ─────────────────────────────────────────────────────────

function findBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  // First pass: try to match preferred voices by name (case-insensitive)
  for (const preferred of PREFERRED_VOICES) {
    const match = voices.find((v) =>
      v.name.toLowerCase().includes(preferred),
    );
    if (match) return match;
  }

  // Second pass: prefer English male voices
  const enMale = voices.find(
    (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("male"),
  );
  if (enMale) return enMale;

  // Third pass: any English voice
  const enVoice = voices.find((v) => v.lang.startsWith("en"));
  if (enVoice) return enVoice;

  // Last resort: first available voice
  return voices[0];
}

function loadVolume(): number {
  if (typeof window === "undefined") return DEFAULT_OPTIONS.volume!;
  try {
    const stored = localStorage.getItem(TTS_VOLUME_KEY);
    if (stored !== null) {
      const v = Number(stored);
      if (v >= 0 && v <= 1) return v;
    }
  } catch {}
  return DEFAULT_OPTIONS.volume!;
}

function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TTS_MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

function loadEngine(): TtsEngine {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(TTS_ENGINE_KEY);
    if (stored === "elevenlabs" || stored === "system") return stored;
  } catch {}
  return "system";
}

// ── ElevenLabs TTS ──────────────────────────────────────────────────

async function speakWithElevenLabs(text: string, volume: number): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.volume = volume;

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ElevenLabs audio playback failed"));
    };
    audio.play().catch(reject);
  });
}

function speakWithSystemTTS(text: string, volume: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      reject(new Error("Speech synthesis not available"));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = volume;
    utterance.rate = 1.05;
    utterance.pitch = 0.9;

    // Find best voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = findBestVoice(voices);
    if (preferred) utterance.voice = preferred;

    let keepAlive: ReturnType<typeof setInterval> | null = null;

    utterance.onend = () => {
      if (keepAlive) clearInterval(keepAlive);
      resolve();
    };
    utterance.onerror = () => {
      if (keepAlive) clearInterval(keepAlive);
      reject(new Error("Speech synthesis error"));
    };

    // For Chrome: speechSynthesis stops speaking after ~15s in some cases
    window.speechSynthesis.speak(utterance);

    // Keep speech alive (Chrome bug workaround)
    keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        if (keepAlive) clearInterval(keepAlive);
      } else {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 5000);
  });
}

// ── Hook ────────────────────────────────────────────────────────────

export function usePremiumTTS() {
  const [volume, setVolumeState] = useState(loadVolume);
  const [isMuted, setIsMutedState] = useState(loadMuted);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [engine, setEngineState] = useState<TtsEngine>(loadEngine);

  const isMutedRef = useRef(loadMuted());
  const volumeRef = useRef(loadVolume());
  const engineRef = useRef<TtsEngine>(loadEngine());
  const speakQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Keep refs in sync
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { engineRef.current = engine; }, [engine]);

  // Pre-load voices (some browsers load them asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Trigger voice loading
    window.speechSynthesis.getVoices();
    // Some browsers (Chrome) load voices async
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }, []);

  // ── Speak ──────────────────────────────────────────────────────

  const speak = useCallback(
    async (text: string) => {
      if (isMutedRef.current || !text || typeof window === "undefined") return;

      setIsSpeaking(true);

      // Queue sequentially (don't interrupt existing speech)
      speakQueueRef.current = speakQueueRef.current
        .then(async () => {
          if (isMutedRef.current) {
            setIsSpeaking(false);
            return;
          }

          const vol = volumeRef.current;

          if (engineRef.current === "elevenlabs") {
            try {
              // Check if ElevenLabs key is configured AND TTS is enabled
              const res = await fetch("/api/tts");
              if (res.ok) {
                const data = await res.json() as {
                  hasKey: boolean;
                  enabled: boolean;
                  ttsEnabled: boolean;
                };
                if (data.hasKey && data.enabled && data.ttsEnabled) {
                  await speakWithElevenLabs(text, vol);
                  setIsSpeaking(false);
                  return;
                }
              }
            } catch {
              // Fall through to system TTS
            }
          }

          await speakWithSystemTTS(text, vol);
        })
        .catch((err) => {
          console.warn("TTS error:", err);
        })
        .finally(() => {
          setIsSpeaking(false);
        });
    },
    [],
  );

  // ── Stop ───────────────────────────────────────────────────────

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // ── Volume ─────────────────────────────────────────────────────

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    volumeRef.current = clamped;
    try { localStorage.setItem(TTS_VOLUME_KEY, String(clamped)); } catch {}
  }, []);

  // ── Mute ───────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setIsMutedState((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      try { localStorage.setItem(TTS_MUTED_KEY, String(next)); } catch {}
      if (next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

  // ── Engine ─────────────────────────────────────────────────────

  const setEngine = useCallback((next: TtsEngine) => {
    setEngineState(next);
    engineRef.current = next;
    try { localStorage.setItem(TTS_ENGINE_KEY, next); } catch {}
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    speak,
    stopSpeaking,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    engine,
    setEngine,
    isSpeaking,
  };
}

