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
