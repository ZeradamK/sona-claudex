"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Browser wake-word detection using the Web Speech API (no extra API key).
 * Works in Chrome/Edge; degrades gracefully elsewhere.
 *
 * The recognizer runs continuously while `enabled` is true and `paused`
 * is false. On hearing a wake phrase, it calls `onWake` and stops itself —
 * the consumer (typically useVoice) is expected to pause the wake word
 * while the live voice session holds the mic.
 */

const WAKE_PATTERNS = [
  /\bhey\s+sona\b/i,
  /\bhi\s+sona\b/i,
  /\bok(?:ay)?\s+sona\b/i,
  /\bsona\s+(?:start|go|listen|hey)\b/i
];

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type WakeWordOpts = {
  enabled: boolean;
  paused: boolean;
  onWake: () => void;
};

type WakeWordState = {
  supported: boolean;
  listening: boolean;
  error: string | null;
};

function getRecognitionCtor(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useWakeWord({ enabled, paused, onWake }: WakeWordOpts): WakeWordState {
  const [state, setState] = useState<WakeWordState>({
    supported: true,
    listening: false,
    error: null
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stoppedRef = useRef(true);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    setState((s) => ({ ...s, supported: !!Ctor }));
  }, []);

  useEffect(() => {
    if (!enabled || paused) {
      stoppedRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      setState((s) =>
        s.listening || s.error
          ? { ...s, listening: false, error: null }
          : s
      );
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setState((s) => ({
        ...s,
        supported: false,
        listening: false,
        error: "Wake word needs Chrome or Edge."
      }));
      return;
    }

    stoppedRef.current = false;
    setState((s) => ({ ...s, error: null }));

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const all = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");
      if (WAKE_PATTERNS.some((p) => p.test(all))) {
        stoppedRef.current = true;
        try {
          recognition.abort();
        } catch {
          // ignore
        }
        onWakeRef.current();
      }
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine; only surface real failures.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stoppedRef.current = true;
        setState((s) => ({
          ...s,
          listening: false,
          error: "Mic permission needed for wake word."
        }));
      } else if (event.error === "audio-capture") {
        stoppedRef.current = true;
        setState((s) => ({
          ...s,
          listening: false,
          error: "No microphone available."
        }));
      }
    };

    recognition.onend = () => {
      setState((s) => (s.listening ? { ...s, listening: false } : s));
      if (!stoppedRef.current) {
        try {
          recognition.start();
          setState((s) => (s.listening ? s : { ...s, listening: true }));
        } catch {
          // already started or transient — ignore
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setState((s) => ({ ...s, listening: true }));
    } catch (err) {
      setState((s) => ({
        ...s,
        listening: false,
        error: err instanceof Error ? err.message : "wake_failed"
      }));
    }

    return () => {
      stoppedRef.current = true;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, [enabled, paused]);

  return state;
}
