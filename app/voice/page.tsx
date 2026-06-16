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
import { useState } from "react";

import { SonaAvatar } from "@/components/avatar/SonaAvatar";
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

// The 3D human avatar GLB. Default is a free female sample (proven with HeadAudio
// real-time lip-sync); drop in your own Avaturn "businesswoman in a black suit"
// export and set NEXT_PUBLIC_SONA_AVATAR_URL to it. Must have ARKit + Oculus
// visemes and a Mixamo-compatible rig (Avaturn / RPM exports do).
const AVATAR_URL =
  process.env.NEXT_PUBLIC_SONA_AVATAR_URL ??
  "https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@main/avatars/julia.glb";

export default function VoiceTestPage() {
  const voice = useVoice();
  const active = voice.mode !== "idle";
  const [avatarFailed, setAvatarFailed] = useState(false);

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

      {/* The avatar — a real 3D human, lip-synced to Sona's live voice.
          Falls back to the lightweight robot face if the GLB can't load. */}
      <div className="relative z-10 mx-auto mt-1 flex h-[58vh] max-h-[620px] w-full max-w-[560px] items-center justify-center">
        {avatarFailed ? (
          <RobotFace
            mode={voice.mode}
            audioLevel={voice.audioLevel}
            className="h-full w-full"
          />
        ) : (
          <SonaAvatar
            url={AVATAR_URL}
            active={active}
            getAudioTap={voice.getAudioTap}
            onError={() => setAvatarFailed(true)}
            className="h-full w-full"
          />
        )}
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

      {/* Transcript + controls */}
      <section className="relative z-20 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end gap-4 px-5 pb-10 sm:px-8">
        {banner && (
          <div className="mx-auto w-full rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {banner}
          </div>
        )}
        {active && voice.cameraError && (
          <div className="mx-auto w-full rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Camera unavailable ({voice.cameraError}). Sona can hear you but
            can&apos;t see — allow camera access and reconnect.
          </div>
        )}

        <div className="flex min-h-[7rem] flex-col gap-2">
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
                : "Tap to talk. Sona will see you through the camera and hear you."}
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
                "border-cyan-300/40 bg-cyan-300/10 text-cyan-200",
              voice.mode === "thinking" &&
                "border-accent-warm/40 bg-accent-warm/10 text-accent-warm",
              voice.mode === "speaking" &&
                "border-accent/40 bg-accent/10 text-accent"
            )}
            onClick={() => {
              void voice.toggle();
            }}
            type="button"
          >
            {voice.mode === "idle" ? (
              <Mic className="size-7" aria-hidden="true" />
            ) : (
              <Square className="size-6" aria-hidden="true" />
            )}
          </button>
          <span className="text-xs text-text-tertiary">
            {active ? "Tap to end" : "Tap to talk"}
          </span>
        </div>
      </section>
    </main>
  );
}
