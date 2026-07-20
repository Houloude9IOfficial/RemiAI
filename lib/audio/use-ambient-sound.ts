// ── Ambient Sound Hook (Pink Noise Generator) ───────────────────────
// Uses Web Audio API to generate smooth pink noise with fade-in/out.
// No external audio files needed — works on all platforms.
// ────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────

type FadeState = "idle" | "fading-in" | "playing" | "fading-out";

interface PinkNoiseNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  warmthOsc?: OscillatorNode;
  warmthGain?: GainNode;
}

// ── Constants ───────────────────────────────────────────────────────

const AMBIENT_VOLUME_KEY = "ambient-volume";
const AMBIENT_MUTED_KEY = "ambient-muted";

const DEFAULT_VOLUME = 0.15; // 15% — subtle background
const FADE_DURATION_MS = 800; // smooth fade in/out
const LOW_FREQ_HUM = 55; // A1 — subtle warmth layer

// ── Helpers ─────────────────────────────────────────────────────────

function loadVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const stored = localStorage.getItem(AMBIENT_VOLUME_KEY);
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
    return localStorage.getItem(AMBIENT_MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

// ── Hook ────────────────────────────────────────────────────────────

export function useAmbientSound() {
  const [volume, setVolumeState] = useState(loadVolume);
  const [isMuted, setIsMutedState] = useState(loadMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fadeState, setFadeState] = useState<FadeState>("idle");

  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<PinkNoiseNode | null>(null);
  const volumeRef = useRef(loadVolume());
  const isMutedRef = useRef(loadMuted());
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ── Pink noise buffer generation ─────────────────────────────────
  // Uses Paul Kellet's refined pink noise algorithm for smooth, natural
  // sounding noise that's much more pleasant than white noise.

  const createPinkNoiseBuffer = useCallback(
    (ctx: AudioContext): AudioBuffer => {
      const sr = ctx.sampleRate;
      const bufferSize = sr * 4; // 4 seconds of noise for looping
      const buffer = ctx.createBuffer(1, bufferSize, sr);
      const data = buffer.getChannelData(0);

      // Paul Kellet's refined pink noise algorithm
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.153852;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }

      return buffer;
    },
    [],
  );

  // ── Create audio graph ───────────────────────────────────────────

  const buildGraph = useCallback(
    (ctx: AudioContext): PinkNoiseNode => {
      // Pink noise source
      const buffer = createPinkNoiseBuffer(ctx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // Low-pass filter — smooth the noise even further
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 800; // gentle roll-off above 800 Hz
      filter.Q.value = 0.7;

      // Main gain node for fade control
      const gain = ctx.createGain();
      gain.gain.value = 0;

      // Connect: source → filter → gain → destination
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      // ── Subtle low-frequency warmth layer ──────────────────────
      // A very quiet sine wave around 55 Hz adds a gentle "hum"
      // that gives the sound weight and warmth.
      const warmthOsc = ctx.createOscillator();
      warmthOsc.type = "sine";
      warmthOsc.frequency.value = LOW_FREQ_HUM;

      // Slight frequency modulation for organic feel
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.2; // very slow modulation
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 2; // ±2 Hz wobble at A1
      lfo.connect(lfoGain);
      lfoGain.connect(warmthOsc.frequency);

      const warmthGain = ctx.createGain();
      warmthGain.gain.value = 0;

      warmthOsc.connect(warmthGain);
      warmthGain.connect(ctx.destination);

      // Start oscillators
      source.start();
      warmthOsc.start();
      lfo.start();

      return { source, gain, filter, warmthOsc, warmthGain };
    },
    [createPinkNoiseBuffer],
  );

  // ── Start / Stop ambient sound ───────────────────────────────────

  const getOrCreateContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      return ctxRef.current;
    }
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    return ctx;
  }, []);

  const fadeTo = useCallback(
    (targetGain: number, durationMs: number) => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }

      const node = nodeRef.current;
      if (!node) return;

      const now = node.gain.context.currentTime;
      node.gain.gain.cancelScheduledValues(now);

      if (durationMs <= 0) {
        node.gain.gain.setValueAtTime(targetGain, now);
        return;
      }

      node.gain.gain.linearRampToValueAtTime(
        targetGain,
        now + durationMs / 1000,
      );

      if (node.warmthGain) {
        node.warmthGain.gain.cancelScheduledValues(now);
        node.warmthGain.gain.linearRampToValueAtTime(
          targetGain * 0.3, // warmth at 30% of main volume
          now + durationMs / 1000,
        );
      }
    },
    [],
  );

  const startAmbient = useCallback(() => {
    if (typeof window === "undefined") return;

    const ctx = getOrCreateContext();
    if (!ctx) return;

    // Resume context if suspended (needed after user interaction)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // If we're currently fading out, cancel the fade and reverse direction
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    // Build audio graph if not already built
    if (!nodeRef.current) {
      nodeRef.current = buildGraph(ctx);
    }

    const effectiveVolume = isMutedRef.current ? 0 : volumeRef.current;

    isPlayingRef.current = true;
    setIsPlaying(true);

    // Fade in
    setFadeState("fading-in");
    fadeTo(effectiveVolume, FADE_DURATION_MS);

    fadeTimerRef.current = setTimeout(() => {
      setFadeState("playing");
    }, FADE_DURATION_MS);
  }, [getOrCreateContext, buildGraph, fadeTo]);

  const stopAmbient = useCallback(() => {
    if (!isPlayingRef.current) return;

    setFadeState("fading-out");
    fadeTo(0, FADE_DURATION_MS);

    fadeTimerRef.current = setTimeout(() => {
      // Only clean up if we're still supposed to be stopped
      // (startAmbient may have been called since this timer was set)
      if (!isPlayingRef.current) {
        setIsPlaying(false);
        setFadeState("idle");

        // Clean up audio graph
        if (nodeRef.current) {
          try {
            nodeRef.current.source.stop();
            nodeRef.current.warmthOsc?.stop();
          } catch {
            // Already stopped
          }
          nodeRef.current = null;
        }
      }
    }, FADE_DURATION_MS);
  }, [fadeTo]);

  // ── Volume / mute controls ──────────────────────────────────────

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      setVolumeState(clamped);
      volumeRef.current = clamped;

      try {
        localStorage.setItem(AMBIENT_VOLUME_KEY, String(clamped));
      } catch {}

      // Apply immediately if playing
      if (isPlayingRef.current && !isMutedRef.current) {
        fadeTo(clamped, 150); // quick update
      }
    },
    [fadeTo],
  );

  const toggleMute = useCallback(() => {
    setIsMutedState((prev) => {
      const next = !prev;
      isMutedRef.current = next;

      try {
        localStorage.setItem(AMBIENT_MUTED_KEY, String(next));
      } catch {}

      if (isPlayingRef.current) {
        if (next) {
          fadeTo(0, 200);
        } else {
          fadeTo(volumeRef.current, 400);
        }
      }

      return next;
    });
  }, [fadeTo]);

  // ── Cleanup on unmount ──────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (nodeRef.current) {
        try {
          nodeRef.current.source.stop();
          nodeRef.current.warmthOsc?.stop();
        } catch {}
        nodeRef.current = null;
      }
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    startAmbient,
    stopAmbient,
    setVolume,
    toggleMute,
    volume,
    isMuted,
    isPlaying,
    fadeState,
  };
}
