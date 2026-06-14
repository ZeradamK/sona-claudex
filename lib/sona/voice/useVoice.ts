"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MicCapture, SpeakerPlayback } from "@/lib/sona/voice/audio";
import {
  type LiveSessionHandle,
  openLiveSession
} from "@/lib/sona/voice/liveSession";

export type VoiceMode =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

type UseVoiceState = {
  mode: VoiceMode;
  audioLevel: number;
  error: string | null;
  transcript: { user: string; assistant: string };
  /** Last measured voice-to-voice round trip (ms): user stopped → Sona spoke. */
  latencyMs: number | null;
};

const MIC_TRIGGER = 0.06;
const SPEAKER_REMAINING_MIN = 0.05;

export function useVoice() {
  const [state, setState] = useState<UseVoiceState>({
    mode: "idle",
    audioLevel: 0,
    error: null,
    transcript: { user: "", assistant: "" },
    latencyMs: null
  });

  const modeRef = useRef<VoiceMode>("idle");
  const activeRef = useRef(false);
  const micRef = useRef<MicCapture | null>(null);
  const speakerRef = useRef<SpeakerPlayback | null>(null);
  const sessionRef = useRef<LiveSessionHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  // Turn bookkeeping. `newUserTurn` flips true when Sona finishes (or is cut
  // off); the next user transcript then starts a fresh exchange instead of
  // gluing onto the whole session. `userLastSpokeAt` + `awaitingFirstAudio`
  // measure the voice-to-voice round trip for the latency HUD.
  const newUserTurnRef = useRef(true);
  const userLastSpokeAtRef = useRef(0);
  const awaitingFirstAudioRef = useRef(false);

  const setMode = useCallback((next: VoiceMode) => {
    if (modeRef.current === next) return;
    modeRef.current = next;
    setState((s) => (s.mode === next ? s : { ...s, mode: next }));
  }, []);

  const teardown = useCallback(async () => {
    activeRef.current = false;
    sessionRef.current?.close();
    sessionRef.current = null;

    if (micRef.current) {
      await micRef.current.stop();
      micRef.current = null;
    }
    if (speakerRef.current) {
      await speakerRef.current.stop();
      speakerRef.current = null;
    }
  }, []);

  // Sphere mode + amplitude auto-derive each frame from real audio.
  // No manual transitions. Server VAD owns turn-taking.
  useEffect(() => {
    function pump() {
      if (!activeRef.current) {
        // While idle/connecting we still pump for smooth amplitude decay.
        setState((s) => {
          if (s.audioLevel < 0.001) return s;
          return { ...s, audioLevel: s.audioLevel * 0.85 };
        });
        rafRef.current = requestAnimationFrame(pump);
        return;
      }

      const speaker = speakerRef.current;
      const mic = micRef.current;
      const queued = speaker?.remaining() ?? 0;
      const speakerLvl = speaker?.level() ?? 0;
      const micLvl = mic?.level() ?? 0;

      let nextMode: VoiceMode;
      let displayLvl: number;

      if (queued > SPEAKER_REMAINING_MIN || speakerLvl > 0.01) {
        nextMode = "speaking";
        displayLvl = Math.max(speakerLvl, 0.12);
      } else if (micLvl > MIC_TRIGGER) {
        nextMode = "listening";
        displayLvl = micLvl;
      } else {
        nextMode = "thinking";
        displayLvl = 0;
      }

      if (modeRef.current !== nextMode) setMode(nextMode);

      setState((s) => ({
        ...s,
        audioLevel: s.audioLevel * 0.55 + displayLvl * 0.45
      }));

      rafRef.current = requestAnimationFrame(pump);
    }

    rafRef.current = requestAnimationFrame(pump);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [setMode]);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  const start = useCallback(async () => {
    if (activeRef.current || modeRef.current !== "idle") return;

    setState((s) => ({
      ...s,
      error: null,
      transcript: { user: "", assistant: "" }
    }));
    setMode("connecting");

    try {
      const tokenRes = await fetch("/api/voice/token", { method: "POST" });
      if (!tokenRes.ok) {
        const data = (await tokenRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `token_${tokenRes.status}`);
      }
      const { token, model } = (await tokenRes.json()) as {
        token: string;
        model: string;
      };

      const speaker = new SpeakerPlayback();
      await speaker.start();
      speakerRef.current = speaker;

      const session = await openLiveSession({
        token,
        model,
        onEvent: (event) => {
          switch (event.type) {
            case "audioOut":
              speakerRef.current?.enqueue(event.pcm);
              break;
            case "inputTranscript":
              setState((s) => ({
                ...s,
                transcript: {
                  ...s.transcript,
                  user: s.transcript.user + event.text
                }
              }));
              break;
            case "outputTranscript":
              setState((s) => ({
                ...s,
                transcript: {
                  ...s.transcript,
                  assistant: s.transcript.assistant + event.text
                }
              }));
              break;
            case "interrupted":
              speakerRef.current?.flush();
              break;
            case "turnComplete":
              // No-op. Amplitude pump derives the next mode.
              break;
            case "error":
              setState((s) => ({ ...s, error: event.message }));
              void teardown();
              setMode("idle");
              break;
            case "close":
              if (activeRef.current) {
                void teardown();
                setMode("idle");
              }
              break;
            case "open":
              break;
          }
        }
      });
      sessionRef.current = session;

      const mic = new MicCapture();
      await mic.start((int16) => {
        sessionRef.current?.sendPcm(int16);
      });
      micRef.current = mic;

      activeRef.current = true;
      setMode("thinking");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "voice_failed";
      setState((s) => ({ ...s, error: message }));
      await teardown();
      setMode("idle");
    }
  }, [setMode, teardown]);

  const stop = useCallback(async () => {
    if (modeRef.current === "idle") return;
    await teardown();
    setMode("idle");
  }, [setMode, teardown]);

  const toggle = useCallback(async () => {
    if (modeRef.current === "idle") {
      await start();
    } else {
      await stop();
    }
  }, [start, stop]);

  return {
    mode: state.mode,
    audioLevel: state.audioLevel,
    error: state.error,
    transcript: state.transcript,
    start,
    stop,
    toggle
  };
}
