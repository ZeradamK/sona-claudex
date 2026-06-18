"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MicCapture, SpeakerPlayback } from "@/lib/sona/voice/audio";
import { CameraCapture } from "@/lib/sona/voice/camera";
import {
  type LiveSessionEvent,
  type LiveSessionHandle,
  openLiveSession
} from "@/lib/sona/voice/liveSession";

export type VoiceMode =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

/** The avatar's imperative control surface (TalkingHead), driven by tool calls. */
export type AvatarControls = {
  setMood: (mood: string) => void;
  playGesture: (gesture: string, hand: "left" | "right") => void;
};

type UseVoiceState = {
  mode: VoiceMode;
  audioLevel: number;
  error: string | null;
  transcript: { user: string; assistant: string };
  /** Last measured voice-to-voice round trip (ms): user stopped → Sona spoke. */
  latencyMs: number | null;
  /** Camera is streaming frames to the model (the agent can see). */
  seeing: boolean;
  /** Non-fatal camera problem (voice keeps working). */
  cameraError: string | null;
  /** A grounded web search is running (results will be relayed to her voice). */
  searching: boolean;
};

const MIC_TRIGGER = 0.06;
const SPEAKER_REMAINING_MIN = 0.05;
// While Sona is audibly speaking, only forward mic audio that clears this RMS
// level. Her voice plays through a separate AudioContext the browser's echo
// canceller can't subtract, so on speakers the mic re-captures it; without this
// gate that echo streams back into Gemini as "user" speech and the session
// wedges into silence after a couple turns. A genuine interrupt is louder than
// room echo, so full-duplex barge-in still works. Tune 0.15–0.3 to taste.
const BARGE_IN_LEVEL = 0.2;

const VOICE_DEBUG =
  typeof window !== "undefined" &&
  (window as unknown as { __SONA_VOICE_DEBUG?: boolean }).__SONA_VOICE_DEBUG ===
    true;
function vlog(...args: unknown[]) {
  if (VOICE_DEBUG) console.log("[voice]", ...args);
}

// When Sona says one of these (the persona tells her to defer like this for
// look-up requests), we run a grounded web search on what the user asked and
// relay the result back for her to speak. Her judgment of "this needs a search"
// is more reliable than keyword-matching the user — and it never fires on chat.
const SEARCH_DEFERRAL =
  /\b(look(ing)?\s+(that|it|this)\s+up|look\s+up|let me (search|google|check that)|searching (for )?that|i'?ll look (that|it) up|pull (that|it) up)\b/i;

export function useVoice() {
  const [state, setState] = useState<UseVoiceState>({
    mode: "idle",
    audioLevel: 0,
    error: null,
    transcript: { user: "", assistant: "" },
    latencyMs: null,
    seeing: false,
    cameraError: null,
    searching: false
  });

  const modeRef = useRef<VoiceMode>("idle");
  const activeRef = useRef(false);
  const micRef = useRef<MicCapture | null>(null);
  const speakerRef = useRef<SpeakerPlayback | null>(null);
  const sessionRef = useRef<LiveSessionHandle | null>(null);
  const cameraRef = useRef<CameraCapture | null>(null);
  // The page binds this to its <video> element so the live camera previews and
  // the same stream is sampled into frames for the model.
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // Avatar control surface (TalkingHead), registered by SonaAvatar once ready.
  // Tool calls from the model are routed here.
  const avatarControlsRef = useRef<AvatarControls | null>(null);
  // Latest session-resumption handle + a guard so a reconnect runs only once.
  const resumeHandleRef = useRef<string | null>(null);
  const reconnectingRef = useRef(false);
  // Web-search relay: accumulate the user's utterance + Sona's reply for the
  // current turn; when she defers ("let me look that up"), search + relay once.
  const userUtteranceRef = useRef("");
  const modelUtteranceRef = useRef("");
  const searchedTurnRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Turn bookkeeping. `newUserTurn` flips true when Sona finishes (or is cut
  // off); the next user transcript then starts a fresh exchange instead of
  // gluing onto the whole session. `userLastSpokeAt` + `awaitingFirstAudio`
  // measure the voice-to-voice round trip for the latency HUD.
  const newUserTurnRef = useRef(true);
  const userLastSpokeAtRef = useRef(0);
  const awaitingFirstAudioRef = useRef(false);
  const audioOutCountRef = useRef(0);

  const setMode = useCallback((next: VoiceMode) => {
    if (modeRef.current === next) return;
    modeRef.current = next;
    setState((s) => (s.mode === next ? s : { ...s, mode: next }));
  }, []);

  const teardown = useCallback(async () => {
    activeRef.current = false;
    sessionRef.current?.close();
    sessionRef.current = null;

    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
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
        // User is audibly talking right now. Keep stamping "last spoke" and
        // arm the next reply for measurement — the gap from the final stamp to
        // Sona's first audio chunk is the round trip we report.
        userLastSpokeAtRef.current = performance.now();
        awaitingFirstAudioRef.current = true;
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

    newUserTurnRef.current = true;
    awaitingFirstAudioRef.current = false;
    userUtteranceRef.current = "";
    modelUtteranceRef.current = "";
    searchedTurnRef.current = false;
    setState((s) => ({
      ...s,
      error: null,
      transcript: { user: "", assistant: "" },
      latencyMs: null,
      seeing: false,
      cameraError: null,
      searching: false
    }));
    resumeHandleRef.current = null;
    reconnectingRef.current = false;
    setMode("connecting");

    async function getToken(): Promise<{ token: string; model: string }> {
      const tokenRes = await fetch("/api/voice/token", { method: "POST" });
      if (!tokenRes.ok) {
        const data = (await tokenRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `token_${tokenRes.status}`);
      }
      return (await tokenRes.json()) as { token: string; model: string };
    }

    const onEvent = (event: LiveSessionEvent) => {
      switch (event.type) {
        case "audioOut":
          audioOutCountRef.current += 1;
          if (awaitingFirstAudioRef.current) {
            awaitingFirstAudioRef.current = false;
            const ms = performance.now() - userLastSpokeAtRef.current;
            // Ignore the very first chunk (before the user has spoken).
            if (ms > 0 && ms < 10000) {
              setState((s) => ({ ...s, latencyMs: Math.round(ms) }));
            }
          }
          speakerRef.current?.enqueue(event.pcm);
          break;
        case "inputTranscript":
          // New user turn → reset the per-turn utterance + search guard.
          if (newUserTurnRef.current) {
            newUserTurnRef.current = false;
            userUtteranceRef.current = event.text;
            modelUtteranceRef.current = "";
            searchedTurnRef.current = false;
            setState((s) => ({
              ...s,
              transcript: { user: event.text, assistant: "" }
            }));
          } else {
            userUtteranceRef.current += event.text;
            setState((s) => ({
              ...s,
              transcript: {
                ...s.transcript,
                user: s.transcript.user + event.text
              }
            }));
          }
          break;
        case "outputTranscript":
          // Accumulate her reply; if she defers to a look-up, run the grounded
          // search on what the user asked and relay the answer back to speak.
          modelUtteranceRef.current += event.text;
          if (
            !searchedTurnRef.current &&
            userUtteranceRef.current.trim().length > 0 &&
            SEARCH_DEFERRAL.test(modelUtteranceRef.current)
          ) {
            searchedTurnRef.current = true;
            void searchAndRelay(userUtteranceRef.current);
          }
          setState((s) => ({
            ...s,
            transcript: {
              ...s.transcript,
              assistant: s.transcript.assistant + event.text
            }
          }));
          break;
        case "interrupted":
          vlog("interrupted (barge-in) — flushing playback");
          speakerRef.current?.flush();
          newUserTurnRef.current = true;
          break;
        case "turnComplete":
          vlog("turnComplete — audio chunks:", audioOutCountRef.current);
          audioOutCountRef.current = 0;
          newUserTurnRef.current = true;
          break;
        case "toolCall": {
          // The model is driving its avatar (set_mood / play_gesture).
          const controls = avatarControlsRef.current;
          for (const call of event.calls) {
            try {
              if (call.name === "set_mood") {
                controls?.setMood(String(call.args.mood ?? "neutral"));
              } else if (call.name === "play_gesture") {
                controls?.playGesture(
                  String(call.args.gesture ?? ""),
                  call.args.hand === "left" ? "left" : "right"
                );
              }
            } catch {
              // avatar not ready / rig lacks the gesture — ignore
            }
          }
          // Acknowledge so the model continues its turn after the side effect.
          sessionRef.current?.sendToolResponse(
            event.calls.map((call) => ({
              id: call.id,
              name: call.name,
              response: { ok: true }
            }))
          );
          vlog("toolCall", event.calls.map((c) => c.name).join(","));
          break;
        }
        case "resumeHandle":
          resumeHandleRef.current = event.handle;
          break;
        case "error":
          vlog("error", event.message);
          setState((s) => ({ ...s, error: event.message }));
          void teardown();
          setMode("idle");
          break;
        case "close":
          vlog("session close — active:", activeRef.current);
          if (
            activeRef.current &&
            resumeHandleRef.current &&
            !reconnectingRef.current
          ) {
            void reconnect();
          } else if (activeRef.current && !reconnectingRef.current) {
            void teardown();
            setMode("idle");
          }
          break;
        case "open":
          break;
      }
    };

    // Grounded web search runs OUTSIDE the live session (which can't ground
    // without dropping its socket); we relay the answer back in for her to
    // speak. Triggered when she defers ("let me look that up").
    async function searchAndRelay(query: string) {
      setState((s) => ({ ...s, searching: true }));
      vlog("web search:", query.slice(0, 60));
      try {
        const r = await fetch("/api/voice/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        const data = (await r.json().catch(() => ({}))) as {
          answer?: string;
          error?: string;
        };
        const answer = (data.answer ?? "").trim();
        if (answer) {
          sessionRef.current?.sendClientContent(
            `(You just looked this up online for them. Here's what the search found: ${answer}\n\n` +
              `Now tell them what you found, naturally and conversationally — like you're sharing what you just discovered. Don't read out links or say "according to".)`
          );
          vlog("relayed search results");
        } else {
          sessionRef.current?.sendClientContent(
            "(The web search didn't turn up a clear answer — let them know you couldn't pull that up right now.)"
          );
        }
      } catch (e) {
        vlog("search failed", e);
        sessionRef.current?.sendClientContent(
          "(The web search failed — let them know you couldn't look that up right now.)"
        );
      } finally {
        setState((s) => ({ ...s, searching: false }));
      }
    }

    // Reconnect with the saved resume handle so memory + personality survive the
    // ~15-min native-audio cap or a network drop. mic/camera/speaker stay up;
    // only the session swaps (callbacks read sessionRef), so it's near-seamless.
    async function reconnect() {
      if (reconnectingRef.current) return;
      reconnectingRef.current = true;
      setMode("connecting");
      try {
        const t = await getToken();
        sessionRef.current = await openLiveSession({
          token: t.token,
          model: t.model,
          onEvent,
          resumeHandle: resumeHandleRef.current ?? undefined
        });
        setMode("thinking");
      } catch (e) {
        vlog("reconnect failed", e);
        await teardown();
        setMode("idle");
      } finally {
        reconnectingRef.current = false;
      }
    }

    try {
      const { token, model } = await getToken();

      const speaker = new SpeakerPlayback();
      await speaker.start();
      speakerRef.current = speaker;

      sessionRef.current = await openLiveSession({ token, model, onEvent });

      const mic = new MicCapture();
      await mic.start((int16) => {
        // Echo gate (half-duplex with a barge-in escape hatch). While Sona is
        // speaking, drop mic frames unless the user is clearly louder than her
        // echo — otherwise her own voice loops back into Gemini as input.
        const speakerNow = speakerRef.current;
        const sonaSpeaking =
          (speakerNow?.remaining() ?? 0) > SPEAKER_REMAINING_MIN ||
          (speakerNow?.level() ?? 0) > 0.01;
        if (sonaSpeaking && mic.level() < BARGE_IN_LEVEL) return;
        sessionRef.current?.sendPcm(int16);
      });
      micRef.current = mic;

      activeRef.current = true;
      setMode("thinking");

      // Camera: stream frames so the model can SEE the user and room. Each
      // frame is image context the model must prefill before replying, so it
      // adds response latency — keep fps low, and allow disabling it entirely
      // (NEXT_PUBLIC_SONA_CAMERA=0) for the snappiest voice-only mode. Its own
      // try/catch — a denied camera must never tear down the voice session.
      if (process.env.NEXT_PUBLIC_SONA_CAMERA !== "0") {
        try {
          const camera = new CameraCapture();
          await camera.start({
            videoEl: videoElRef.current,
            onFrame: (frame) => sessionRef.current?.sendVideoFrame(frame.data),
            fps: Number(process.env.NEXT_PUBLIC_SONA_CAMERA_FPS ?? 1)
          });
          cameraRef.current = camera;
          setState((s) => ({ ...s, seeing: true, cameraError: null }));
          vlog("camera streaming frames to model");
        } catch (camErr) {
          const msg = camErr instanceof Error ? camErr.message : "camera_failed";
          vlog("camera failed", msg);
          setState((s) => ({ ...s, seeing: false, cameraError: msg }));
        }
      }
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

  // Live tap into the audio graph Sona's voice plays through, so the avatar's
  // HeadAudio lip-sync reads the exact playing signal. Null until a session is
  // active. Polled by the avatar component (refs, so no re-render needed).
  const getAudioTap = useCallback((): {
    ctx: AudioContext;
    node: AudioNode;
  } | null => {
    const sp = speakerRef.current;
    const ctx = sp?.context;
    const node = sp?.speechNode;
    if (sp && ctx && node) return { ctx, node };
    return null;
  }, []);

  return {
    mode: state.mode,
    audioLevel: state.audioLevel,
    error: state.error,
    transcript: state.transcript,
    latencyMs: state.latencyMs,
    seeing: state.seeing,
    cameraError: state.cameraError,
    /** Bind to the preview <video>; the same stream is sampled for the model. */
    videoRef: videoElRef,
    /** Live audio tap for avatar lip-sync (null until a session is active). */
    getAudioTap,
    start,
    stop,
    toggle
  };
}
