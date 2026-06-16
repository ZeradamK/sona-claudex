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

