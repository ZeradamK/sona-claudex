"use client";

/**
 * /voice — Sona's voice-first face. A WALL-E-style robot face (expressive eyes
 * + a mouth that moves with her voice), a live camera view so she can SEE you,
 * one talk button, the running transcript, and a voice-to-voice latency HUD.
 *
 * The camera stream is both previewed here AND sampled to ~1 fps JPEG frames
 * that are sent to the Gemini Live session (useVoice), so the agent literally
 * sees the user and the room. This is the page the Raspberry Pi boots into.
 */

import { Camera, CameraOff, Mic, Square } from "lucide-react";

import { RobotFace } from "@/components/face/RobotFace";
import { useVoice, type VoiceMode } from "@/lib/sona/voice/useVoice";
import { cn } from "@/lib/utils";

const LABEL: Record<VoiceMode, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking"
};

export default function VoiceTestPage() {
  const voice = useVoice();
  const active = voice.mode !== "idle";

  const banner = voice.error
    ? voice.error === "gemini_api_key_missing"
      ? "Add GEMINI_API_KEY to .env.local and restart the dev server."
      : voice.error.includes("getUserMedia") ||
          voice.error.includes("Permission") ||
          voice.error.includes("not-allowed")
        ? "Mic permission needed. Allow it in your browser, then try again."
        : `Voice failed: ${voice.error}`
    : null;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(34,211,238,0.10),transparent_28rem),radial-gradient(circle_at_50%_84%,rgba(245,165,36,0.08),transparent_30rem)]" />

      {/* Status row */}
      <header className="relative z-20 flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="text-sm font-medium">Sona · voice lab</div>
        <div className="flex items-center gap-2">
          {voice.latencyMs !== null && (
            <div
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm tabular-nums text-text-secondary backdrop-blur"
              title="Voice-to-voice round trip: you stopped → Sona started"
            >
              <span className="text-text-tertiary">↻</span>
              {voice.latencyMs} ms
            </div>
          )}
          {active && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm backdrop-blur",
                voice.seeing
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-200"
              )}
              title={voice.seeing ? "Camera streaming to the agent" : "Camera off"}
            >
              {voice.seeing ? (
                <Camera className="size-3.5" aria-hidden="true" />
              ) : (
                <CameraOff className="size-3.5" aria-hidden="true" />
              )}
              {voice.seeing ? "Seeing you" : "No camera"}
            </div>
          )}
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary backdrop-blur">
            <span
              className={cn(
                "size-2 rounded-full transition-colors",
                voice.mode === "listening" && "bg-cyan-300",
                (voice.mode === "thinking" || voice.mode === "connecting") &&
                  "bg-accent-warm",
                voice.mode === "speaking" && "bg-accent",
                voice.mode === "idle" && "bg-text-tertiary",
                banner && "bg-red-400"
              )}
            />
            {banner ? "Error" : LABEL[voice.mode]}
          </div>
        </div>
      </header>

      {/* The face */}
      <div className="relative z-10 mx-auto mt-2 flex h-[42vh] max-h-[440px] w-full max-w-[560px] items-center justify-center px-6">
        <RobotFace
          mode={voice.mode}
          audioLevel={voice.audioLevel}
          className="h-full w-full"
        />
      </div>

      {/* Live camera view — bound to the same stream sampled for the model */}
      <div
        className={cn(
          "absolute right-5 top-20 z-20 overflow-hidden rounded-xl border shadow-[0_18px_80px_rgba(0,0,0,0.4)] backdrop-blur transition-opacity sm:right-8",
          active && voice.seeing
            ? "border-emerald-400/30 opacity-100"
            : "pointer-events-none opacity-0"
        )}
      >
        <video
          ref={voice.videoRef}
          autoPlay
          muted
          playsInline
          className="h-28 w-40 -scale-x-100 object-cover sm:h-32 sm:w-48"
        />
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          LIVE
        </div>
      </div>

