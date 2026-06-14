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

