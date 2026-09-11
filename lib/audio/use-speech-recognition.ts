// ── Speech-to-Text Hook — Web Speech API ────────────────────────────
// Cross-browser speech recognition using the Web Speech API.
// Supports Chrome, Edge, Safari (with webkit prefix).
// Provides interim results, final transcripts, and continuous listening
// mode with silence detection (no need to manually restart).
//
// Microphone permission:
//   Chrome's SpeechRecognition does NOT show a permission prompt. If the
//   origin has never been granted microphone access it fails immediately
//   with `not-allowed` (chromium issue 41118791). We therefore ask for the
//   mic via getUserMedia *before* starting the recognizer — that is what
//   ChatGPT/Claude style voice input does. The captured stream is closed
//   right away so the recognizer gets exclusive access to the device.
// ────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useRef, useState, useEffect } from "react";

// ── Types ───────────────────────────────────────────────────────────

export type SpeechState = "idle" | "listening" | "processing";

/** Microphone permission as reported by the Permissions API. */
export type MicPermission = "unknown" | "prompt" | "granted" | "denied";

export interface SpeechErrorInfo {
  /** Raw error code from the Web Speech API (e.g. "not-allowed"). */
  code: string;
  /** Human-readable, actionable message for the UI. */
  message: string;
  /** True when the user must change browser permissions to recover. */
  needsPermission: boolean;
}

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
  maxAlternatives: number;
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

// How long we wait after the last recognition result before treating the
// utterance as finished. Chrome often holds text as an interim result until
// it finalizes, so interim-only text gets one extra grace window on top.
const SILENCE_TIMEOUT_MS = 1300;

export const MIC_DENIED_MESSAGE =
  "Microphone access is blocked. Click the mic icon in your browser's address bar (or site settings), allow access, then try again.";

const MIC_INSECURE_MESSAGE =
  "Speech recognition needs a secure connection. Open this app over HTTPS or localhost to use voice mode.";

const MIC_OS_BLOCKED_MESSAGE =
  "Chrome could not use the microphone. Check that Chrome itself is allowed to use it — macOS: System Settings > Privacy & Security > Microphone; Windows: Settings > Privacy > Microphone — then click Try again.";

const MIC_POLICY_BLOCKED_MESSAGE =
  "The microphone is blocked by this page's security policy, so the browser never asks for it. The Permissions-Policy header needs `microphone=(self)` for talk mode to work.";

const MIC_MISSING_MESSAGE =
  "No microphone was found. Connect a microphone and try again.";

const MIC_BUSY_MESSAGE =
  "The microphone is already in use by another app. Close it and try again.";

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": MIC_DENIED_MESSAGE,
  "service-not-allowed": MIC_DENIED_MESSAGE,
  "audio-capture": MIC_MISSING_MESSAGE,
  network:
    "Speech recognition lost its connection. Check your network and try again.",
  "language-not-supported": "Speech recognition does not support your language.",
};

// ── Microphone access helpers ──────────────────────────────────────

type MicAccessResult =
  | "granted"
  | "denied"
  | "policy"
  | "insecure"
  | "no-device"
  | "busy"
  | "unknown";

type PermissionsPolicyDocument = Document & {
  permissionsPolicy?: { allowsFeature(feature: string): boolean };
  featurePolicy?: { allowsFeature(feature: string): boolean };
};

/**
 * Whether the document's own Permissions Policy forbids the microphone.
 *
 * When a server sends `Permissions-Policy: microphone=()` (or the app is
 * framed without `allow="microphone"`), Chrome rejects getUserMedia with
 * NotAllowedError, reports the permission as `denied`, and never shows a
 * prompt — so no amount of user action can fix it.
 */
function isMicBlockedByPolicy(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as PermissionsPolicyDocument;
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  if (!policy) return false;
  try {
    return !policy.allowsFeature("microphone");
  } catch {
    return false;
  }
}

/** Whether this context exposes the Media Devices API at all. */
function canUseMediaDevices(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** Read the current mic permission without prompting (no-op when unsupported). */
async function queryMicPermission(): Promise<MicPermission> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({
      name: "microphone",
    } as unknown as PermissionDescriptor);
    return status.state as MicPermission;
  } catch {
    // Firefox/Safari don't support the "microphone" descriptor.
    return "unknown";
  }
}

/**
 * Request microphone access, mirroring what ChatGPT/Claude do before
 * recording. Resolves immediately when permission was already granted;
 * otherwise it triggers the browser's permission prompt.
 *
 * The stream is stopped right away — keeping it open would make the
 * speech recognizer fail with `audio-capture`.
 */
async function requestMicAccess(): Promise<MicAccessResult> {
  // A document-level policy block is unrecoverable from the UI, so check it
  // first and explain it instead of blaming the user's permission settings.
  if (isMicBlockedByPolicy()) {
    console.warn(
      "Microphone blocked by the document Permissions-Policy (needs `microphone=(self)`).",
    );
    return "policy";
  }

  // Insecure origins never expose mediaDevices (and Chrome rejects the
  // Web Speech API there as well), so report that explicitly.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "insecure";
  }
  if (!canUseMediaDevices()) {
    // Older Safari exposes the webkit-prefixed recognizer but no
    // mediaDevices. Let the recognizer try on its own.
    return "unknown";
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    console.warn(`Microphone access request failed (${name || "unknown"}).`);
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "no-device";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "busy";
    }
    return "denied";
  }
}

function accessToError(
  access: MicAccessResult,
  sitePermission: MicPermission = "unknown",
): SpeechErrorInfo {
  switch (access) {
    case "policy":
      return {
        code: "not-allowed",
        message: MIC_POLICY_BLOCKED_MESSAGE,
        needsPermission: false,
      };
    case "insecure":
      return {
        code: "not-allowed",
        message: MIC_INSECURE_MESSAGE,
        needsPermission: false,
      };
    case "no-device":
      return {
        code: "audio-capture",
        message: MIC_MISSING_MESSAGE,
        needsPermission: false,
      };
    case "busy":
      return {
        code: "audio-capture",
        message: MIC_BUSY_MESSAGE,
        needsPermission: false,
      };
    default:
      // Chrome only stores a "denied" site state when the user unblocked or
      // blocked it in the address bar. Anything else means the request was
      // dismissed, or the OS is blocking Chrome from the mic entirely.
      return {
        code: "not-allowed",
        message:
          sitePermission === "denied"
            ? MIC_DENIED_MESSAGE
            : MIC_OS_BLOCKED_MESSAGE,
        needsPermission: true,
      };
  }
}

// ── Hook ────────────────────────────────────────────────────────────

export function useSpeechRecognition() {
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [error, setError] = useState<SpeechErrorInfo | null>(null);
  // Mirrors `permission` so callbacks can read it without re-creating them.
  const permissionRef = useRef<MicPermission>("unknown");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const onSilenceRef = useRef<((text: string) => void) | null>(null);
  const onInterimRef = useRef<((text: string) => void) | null>(null);
  const onErrorRef = useRef<((error: SpeechErrorInfo) => void) | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the one extra grace window we give interim-only text.
  const interimGraceUsedRef = useRef(false);
  const manualStopRef = useRef(false);
  // Set when the browser refuses the mic. Stops the `onend` auto-restart
  // loop so we don't spam `not-allowed` forever.
  const blockedRef = useRef(false);
  // Bumped on every start/stop so a pending permission prompt can be
  // discarded when the user toggles the mic while it's still open.
  const sessionRef = useRef(0);

  const applyPermission = useCallback((state: MicPermission) => {
    permissionRef.current = state;
    setPermission(state);
  }, []);

  // Check support and the current permission state on mount
  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null);

    let cancelled = false;
    void queryMicPermission().then((state) => {
      if (!cancelled) applyPermission(state);
    });
    return () => {
      cancelled = true;
    };
  }, [applyPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
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
      const finalText = finalTranscriptRef.current.trim();
      const interimText = interimTranscriptRef.current.trim();

      // Nothing finalized yet, but we have interim text — Chrome may still
      // be building that phrase. Give it one extra window instead of
      // committing to a half-finished sentence.
      if (!finalText && interimText && !interimGraceUsedRef.current) {
        interimGraceUsedRef.current = true;
        resetSilenceTimer();
        return;
      }

      // Prefer the finalized transcript, but never throw away a phrase
      // Chrome left as interim — that text is otherwise lost.
      const transcript = finalText || interimText;
      if (transcript) {
        finalTranscriptRef.current = "";
        interimTranscriptRef.current = "";
        interimGraceUsedRef.current = false;
        setFinalText("");
        setInterimText("");
        onInterimRef.current?.("");
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

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // ── Start listening (continuous) ────────────────────────────────

  const startListening = useCallback(
    async (options?: {
      onSilence?: (text: string) => void;
      /** Fires on every recognition result with the interim text (
       *  empty when nothing is pending). Used for live captions and to
       *  detect the user talking over the assistant. */
      onInterim?: (text: string) => void;
      onError?: (error: SpeechErrorInfo) => void;
    }): Promise<boolean> => {
      const recognition = getSpeechRecognition();
      if (!recognition) return false;

      // Supersede any in-flight start or running session.
      const session = ++sessionRef.current;
      onErrorRef.current = options?.onError ?? null;
      onInterimRef.current = options?.onInterim ?? null;
      setError(null);

      // Ask for the mic *before* starting the recognizer — but only when
      // we don't already hold permission, so re-arming after every reply
      // stays instant. Without this first prompt Chrome fails with
      // `not-allowed` and never shows the user anything.
      if (permissionRef.current !== "granted") {
        const access = await requestMicAccess();
        if (session !== sessionRef.current) return false; // superseded

        if (access !== "granted" && access !== "unknown") {
          // Re-read the site permission so the message can point at the
          // right place: the site's own block vs the OS blocking Chrome.
          const siteState =
            access === "denied" ? await queryMicPermission() : "unknown";
          console.warn(
            `Microphone unavailable (${access}, site permission: ${siteState}).`,
          );
          const failure = accessToError(access, siteState);
          blockedRef.current = true;
          applyPermission(access === "denied" ? "denied" : "unknown");
          setSpeechState("idle");
          setInterimText("");
          setError(failure);
          onErrorRef.current?.(failure);
          return false;
        }
      }

      applyPermission("granted");
      blockedRef.current = false;
      manualStopRef.current = false;
      onSilenceRef.current = options?.onSilence ?? null;

      // Abort any previous session
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || "en-US";
      interimGraceUsedRef.current = false;

      // Every handler is guarded by the session id so a superseded
      // recognizer can never clobber the active session's state.
      recognition.onstart = () => {
        if (sessionRef.current !== session) return;
        setSpeechState("listening");
        setInterimText("");
        setFinalText("");
        finalTranscriptRef.current = "";
        onInterimRef.current?.("");
        resetSilenceTimer();
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (sessionRef.current !== session) return;

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

        interimTranscriptRef.current = interim;
        // New audio arrived — the interim grace window starts over.
        interimGraceUsedRef.current = false;
        setInterimText(interim);
        onInterimRef.current?.(interim);
        resetSilenceTimer();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (sessionRef.current !== session) return;

        // Transient — stop so `onend` fires and auto-restarts us.
        if (event.error === "no-speech" || event.error === "aborted") {
          try {
            recognition.stop();
          } catch {}
          return;
        }

        console.warn("Speech recognition error:", event.error);

        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          // Chrome refuses the mic (permission denied / insecure origin).
          // Stop retrying and tell the user how to fix it.
          const failure: SpeechErrorInfo = {
            code: event.error,
            message: window.isSecureContext
              ? MIC_DENIED_MESSAGE
              : MIC_INSECURE_MESSAGE,
            needsPermission: window.isSecureContext,
          };
          blockedRef.current = true;
          applyPermission("denied");
          setSpeechState("idle");
          setInterimText("");
          setError(failure);
          onErrorRef.current?.(failure);
          return;
        }

        // Any other error is terminal for this session — hold off on the
        // auto-restart so we don't hammer the failing service in a loop.
        // The user (or the UI) can start a fresh session to retry.
        const failure: SpeechErrorInfo = {
          code: event.error,
          message:
            ERROR_MESSAGES[event.error] ??
            "Speech recognition stopped unexpectedly. Please try again.",
          needsPermission: false,
        };
        blockedRef.current = true;
        setSpeechState("idle");
        setInterimText("");
        setError(failure);
        onErrorRef.current?.(failure);
      };

      recognition.onend = () => {
        if (sessionRef.current !== session) return;

        clearSilenceTimer();

        // Never re-arm after a permission failure — an immediate restart
        // would just produce the same error in a tight loop.
        if (blockedRef.current) {
          setSpeechState("idle");
          return;
        }

        // Only auto-restart if this recognition is still the current one
        // (prevents double-recognition when startListening is called again).
        // Chrome's session ends every ~60s and after each utterance; restart
        // on a short delay because calling start() straight from onend can
        // throw InvalidStateError and silently kill the mic.
        if (!manualStopRef.current && recognitionRef.current === recognition) {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            if (sessionRef.current !== session) return;
            if (blockedRef.current || manualStopRef.current) return;
            if (recognitionRef.current !== recognition) return;
            try {
              recognition.start();
            } catch {
              setSpeechState("idle");
            }
          }, 120);
        } else {
          setSpeechState("idle");
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
        return true;
      } catch (err) {
        console.warn("Failed to start speech recognition:", err);
        const failure: SpeechErrorInfo = {
          code: "unknown",
          message: "Could not start speech recognition. Please try again.",
          needsPermission: false,
        };
        setSpeechState("idle");
        setError(failure);
        onErrorRef.current?.(failure);
        return false;
      }
    },
    [resetSilenceTimer, clearSilenceTimer, clearRestartTimer, applyPermission],
  );

  // ── Stop listening ─────────────────────────────────────────────

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    // Invalidate the running session so late events are ignored.
    sessionRef.current++;
    clearRestartTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    interimGraceUsedRef.current = false;
    setSpeechState("idle");
    setInterimText("");
    setFinalText("");
    onInterimRef.current?.("");
    clearSilenceTimer();
  }, [clearSilenceTimer, clearRestartTimer]);

  // ── Toggle listening ───────────────────────────────────────────

  const toggleListening = useCallback(
    (options?: { onSilence?: (text: string) => void }) => {
      if (speechState === "listening") {
        stopListening();
      } else {
        void startListening(options);
      }
    },
    [speechState, startListening, stopListening],
  );

  // ── Flush transcript ───────────────────────────────────────────
  // Returns the accumulated final text and clears it, without stopping
  // the recognition. Useful for push-to-talk where we want to grab the
  // transcript and keep listening (or stop separately).

  const flushTranscript = useCallback((): string => {
    // Include interim text so push-to-talk doesn't drop a phrase Chrome
    // hasn't finalized yet.
    const text = (finalTranscriptRef.current || interimTranscriptRef.current).trim();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    interimGraceUsedRef.current = false;
    setFinalText("");
    setInterimText("");
    onInterimRef.current?.("");
    return text;
  }, []);

  return {
    speechState,
    interimText,
    finalText,
    isSupported,
    permission,
    error,
    startListening,
    stopListening,
    toggleListening,
    flushTranscript,
    clearError,
  };
}
