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
