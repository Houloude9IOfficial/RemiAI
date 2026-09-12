// ── Premium Text-to-Speech Hook ─────────────────────────────────────
// Speaks replies sentence by sentence through a single interruptible
// queue. ElevenLabs is used when configured (calm, natural voice);
// otherwise the best available system voice.
//
// A generation counter is bumped by stopSpeaking(), which invalidates
// every queued and in-flight utterance — an interrupted reply goes
// quiet immediately instead of finishing its backlog.
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

const DEFAULT_VOLUME = 0.7;

// Calmer delivery than the browser defaults: a slightly slower rate and a
// lower pitch read as unhurried rather than robotic.
const SYSTEM_RATE = 0.96;
const SYSTEM_PITCH = 0.95;

// Short volume ramps so speech never starts or cuts off with a click.
const FADE_IN_MS = 180;
const FADE_OUT_MS = 140;
const FADE_STEP_MS = 30;

// ── Voice preference lists (ordered by preference) ──────────────────
// Neural/"natural" system voices first — they are markedly calmer than
// the compact ones — then the platform classics.
//   macOS: Samantha, Daniel, Tom, Karen, Moira, Alex, Fred
//   Windows: Microsoft David, Microsoft Mark, Microsoft Zira
//   Chrome OS: Google UK English Male, Google UK English Female

const PREFERRED_VOICES = [
  // Neural / natural voices (Edge, newer Windows, Chrome)
  "natural",
  "neural",
  "google us english",
  "google uk english male",
  // British male voices (Jarvis-like)
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
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const stored = localStorage.getItem(TTS_VOLUME_KEY);
    if (stored !== null) {
      const v = Number(stored);
      if (v >= 0 && v <= 1) return v;
    }
  } catch {}
  return DEFAULT_VOLUME;
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

/**
 * Fade an <audio> element in to `target` and resolve when it finishes.
 * Rejects only if playback could not start (e.g. the browser's autoplay
 * policy blocked it) — callers use that to distinguish "this voice is
 * broken" from "we need a user gesture first".
 */
function playWithFade(
  audio: HTMLAudioElement,
  target: number,
  registerStop: (stop: () => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let fadeTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      audio.onended = null;
      audio.onerror = null;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const ramp = (from: number, to: number, ms: number, onDone?: () => void) => {
      if (fadeTimer) clearInterval(fadeTimer);
      if (ms <= 0) {
        audio.volume = to;
        onDone?.();
        return;
      }
      const startedAt = Date.now();
      fadeTimer = setInterval(() => {
        const t = Math.min(1, (Date.now() - startedAt) / ms);
        audio.volume = from + (to - from) * t;
        if (t >= 1) {
          if (fadeTimer) clearInterval(fadeTimer);
          fadeTimer = null;
          onDone?.();
        }
      }, FADE_STEP_MS);
    };

    // Interruption: fade out fast, then resolve so the queue can move on.
    registerStop(() => {
      if (settled) return;
      const current = audio.volume;
      ramp(current, 0, FADE_OUT_MS, () => {
        try {
          audio.pause();
        } catch {}
        finish();
      });
    });

    audio.onended = finish;
    audio.onerror = finish;

    audio.volume = 0;
    audio
      .play()
      .then(() => ramp(0, target, FADE_IN_MS))
      .catch(fail);
  });
}

/**
 * Prime HTMLAudio playback on the first user gesture. Talk mode can start
 * speaking before the user has clicked anything, and browsers refuse to
 * autoplay sound until then.
 */
function primeAudioPlayback(): () => void {
  if (typeof window === "undefined") return () => {};

  const unlock = () => {
    try {
      // A zero-length silent WAV — enough to mark the document as allowed.
      const bytes = Uint8Array.from(atob(
        "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=",
      ), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      const audio = new Audio(url);
      audio.volume = 0;
      void audio.play().catch(() => {}).finally(() => URL.revokeObjectURL(url));
    } catch {}
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
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
  // Bumped on stop/mute; queued items from an older generation are dropped.
  const generationRef = useRef(0);
  // Number of utterances queued or playing right now.
  const pendingRef = useRef(0);
  // Lets stopSpeaking() interrupt the <audio> element that's playing.
  const activeStopRef = useRef<(() => void) | null>(null);
  // Once ElevenLabs fails we stop retrying it for the rest of the session.
  const elevenLabsFailedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { engineRef.current = engine; }, [engine]);

  // Pre-load voices (some browsers load them asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }, []);

  // Unlock audio playback on the first interaction.
  useEffect(() => primeAudioPlayback(), []);

  const markDone = useCallback(() => {
    pendingRef.current = Math.max(0, pendingRef.current - 1);
    if (pendingRef.current === 0) setIsSpeaking(false);
  }, []);

  // ── ElevenLabs ─────────────────────────────────────────────────

  const speakWithElevenLabs = useCallback(
    async (text: string, vol: number): Promise<void> => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const error = new Error(`ElevenLabs TTS failed: ${res.status}`) as Error & { status?: number };
        error.status = res.status;
        throw error;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      try {
        await playWithFade(audio, vol, (stop) => {
          activeStopRef.current = stop;
        });
      } finally {
        activeStopRef.current = null;
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  // ── System fallback ────────────────────────────────────────────

  const speakWithSystemTTS = useCallback(
    (text: string, vol: number, gen: number): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = vol;
        utterance.rate = SYSTEM_RATE;
        utterance.pitch = SYSTEM_PITCH;

        const preferred = findBestVoice(window.speechSynthesis.getVoices());
        if (preferred) utterance.voice = preferred;

        let keepAlive: ReturnType<typeof setInterval> | null = null;

        const done = () => {
          if (keepAlive) clearInterval(keepAlive);
          keepAlive = null;
          resolve();
        };

        utterance.onend = done;
        utterance.onerror = done;

        window.speechSynthesis.speak(utterance);

        // Chrome stops speaking after ~15s in some builds; nudge it gently
        // instead of pause/resume'ing (which can clip the audio).
        keepAlive = setInterval(() => {
          if (gen !== generationRef.current || !window.speechSynthesis.speaking) {
            done();
            return;
          }
          window.speechSynthesis.resume();
        }, 8000);
      });
    },
    [],
  );

  // ── Speak (queued, sentence by sentence) ───────────────────────

  // Returns a promise that settles when this utterance has been spoken (or
  // skipped because it was superseded) — callers can await the last
  // sentence of a reply to know when the queue has drained.
  const speak = useCallback(
    (text: string): Promise<void> => {
      const clean = text.trim();
      if (!clean || isMutedRef.current || typeof window === "undefined") {
        return Promise.resolve();
      }

      const gen = generationRef.current;
      pendingRef.current += 1;
      setIsSpeaking(true);

      speakQueueRef.current = speakQueueRef.current
        .then(async () => {
          if (gen !== generationRef.current || isMutedRef.current) return;

          const vol = volumeRef.current;

          if (engineRef.current === "elevenlabs" && !elevenLabsFailedRef.current) {
            try {
              await speakWithElevenLabs(clean, vol);
              if (gen !== generationRef.current) return;
              return;
            } catch (err) {
              if (gen !== generationRef.current) return;
              // A blocked autoplay is not a broken voice — the next
              // interaction unlocks it, so keep using ElevenLabs.
              const name = (err as { name?: string })?.name;
              const status = (err as { status?: number })?.status;
              if (name !== "NotAllowedError" && status !== 402) {
                elevenLabsFailedRef.current = true;
                console.warn(
                  "ElevenLabs TTS failed — using the system voice instead:",
                  err,
                );
              }
            }
          }

          if (gen !== generationRef.current || isMutedRef.current) return;
          await speakWithSystemTTS(clean, vol, gen);
        })
        .catch((err) => {
          console.warn("TTS error:", err);
        })
        .finally(() => {
          if (gen === generationRef.current) markDone();
        });

      return speakQueueRef.current;
    },
    [speakWithElevenLabs, speakWithSystemTTS, markDone],
  );

  // ── Stop ───────────────────────────────────────────────────────
  // Invalidates the whole queue: nothing queued or in flight survives.

  const stopSpeaking = useCallback(() => {
    generationRef.current += 1;
    pendingRef.current = 0;
    setIsSpeaking(false);

    activeStopRef.current?.();
    activeStopRef.current = null;

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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
    // A new engine choice deserves a fresh attempt.
    elevenLabsFailedRef.current = false;
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
