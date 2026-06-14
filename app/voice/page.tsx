"use client";

/**
 * /voice — a stripped voice-only harness for tuning turn-taking latency.
 *
 * No chat box, no wake word: just the sphere, one talk button, the live
 * transcript, and a latency HUD (voice-to-voice round trip). This is the page
 * the Raspberry Pi boots into as a Chromium kiosk — the Pi is a dumb glass
 * terminal; all the real work (Gemini Live WSS, PCM capture/playback) runs in
 * the browser, and the API key never leaves /api/voice/token.
 */

import { Mic, Square } from "lucide-react";

import { SphereScene } from "@/components/sphere/SphereScene";
import type { SphereMode } from "@/components/sphere/ParticleSphere";
import { useVoice, type VoiceMode } from "@/lib/sona/voice/useVoice";
import { cn } from "@/lib/utils";

const VOICE_TO_SPHERE: Record<VoiceMode, SphereMode> = {
  idle: "idle",
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking"
};

const VOICE_TO_LABEL: Record<VoiceMode, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking"
};

export default function VoiceTestPage() {
  const voice = useVoice();
  const active = voice.mode !== "idle";
  const sphereMode = VOICE_TO_SPHERE[voice.mode];

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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(6,182,212,0.11),transparent_26rem),radial-gradient(circle_at_50%_78%,rgba(107,33,168,0.12),transparent_30rem)]" />

      {/* Status + latency HUD */}
      <header className="relative z-20 flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="text-sm font-medium">Sona · voice lab</div>
        <div className="flex items-center gap-2">
          {voice.latencyMs !== null && (
            <div
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm tabular-nums text-text-secondary backdrop-blur"
              title="Voice-to-voice round trip: you stopped talking → Sona started"
            >
              <span className="text-text-tertiary">↻</span>
              {voice.latencyMs} ms
            </div>
          )}
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary backdrop-blur">
            <span
              className={cn(
                "size-2 rounded-full transition-colors",
                sphereMode === "listening" && "bg-cyan-300",
                sphereMode === "thinking" && "bg-accent-warm",
                sphereMode === "speaking" && "bg-accent",
                sphereMode === "idle" && "bg-text-tertiary",
                banner && "bg-red-400"
              )}
            />
            {banner ? "Error" : VOICE_TO_LABEL[voice.mode]}
          </div>
        </div>
      </header>

      {/* Sphere */}
      <div className="pointer-events-none relative z-10 mx-auto mt-2 h-[44vh] max-h-[420px] w-full max-w-[420px]">
        <SphereScene active={active} audioLevel={voice.audioLevel} mode={sphereMode} />
      </div>

      {/* Transcript + controls */}
      <section className="relative z-20 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end gap-4 px-5 pb-10 sm:px-8">
        {banner && (
          <div className="mx-auto w-full rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {banner}
          </div>
        )}

        <div className="flex min-h-[8rem] flex-col gap-2">
          {voice.transcript.user && (
            <div className="ml-auto max-w-[min(560px,88vw)] rounded-md border border-border bg-surface/75 px-4 py-3 text-sm leading-6 text-text shadow-[0_18px_80px_rgba(0,0,0,0.18)] backdrop-blur">
              {voice.transcript.user}
            </div>
          )}
          {voice.transcript.assistant && (
            <div className="mr-auto max-w-[min(560px,88vw)] rounded-md border border-border bg-surface-2/70 px-4 py-3 text-sm leading-6 text-text shadow-[0_18px_80px_rgba(0,0,0,0.18)] backdrop-blur">
              {voice.transcript.assistant}
            </div>
          )}
          {!voice.transcript.user && !voice.transcript.assistant && (
            <p className="my-auto text-center text-sm text-text-tertiary">
              {active
                ? "Listening — talk freely. Pause to think; Sona won't cut you off."
                : "Tap the button and just talk. Interrupt any time."}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            aria-label={active ? "End conversation" : "Start talking"}
            className={cn(
              "grid size-20 place-items-center rounded-full border transition-colors",
              voice.mode === "idle" &&
                "border-border bg-surface/80 text-text hover:bg-surface-2",
              voice.mode === "connecting" &&
                "border-accent-warm/40 bg-accent-warm/10 text-accent-warm",
              voice.mode === "listening" &&
