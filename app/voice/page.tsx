"use client";

/**
 * /voice — the voice-first stage. Pick a personality (Sona, Alfred, …) from the
 * character bar; each has its own 3D avatar, voice, persona and theme. The
 * selected character's avatar is lip-synced to its live Gemini voice; a live
 * camera view lets it SEE you. This is the page the Raspberry Pi boots into.
 */

import { Camera, CameraOff, Mic, Square } from "lucide-react";
import { useState } from "react";

import { ModelAvatar } from "@/components/avatar/ModelAvatar";
import { SonaAvatar } from "@/components/avatar/SonaAvatar";
import { RobotFace } from "@/components/face/RobotFace";
import { PERSONALITIES, getPersonality } from "@/lib/sona/personalities";
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
  const [personalityId, setPersonalityId] = useState(PERSONALITIES[0].id);
  const current = getPersonality(personalityId);
  const voice = useVoice({ personalityId });
  const active = voice.mode !== "idle";
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Switch characters only between conversations (each session pins a persona).
  function pick(id: string) {
    if (active || id === personalityId) return;
    setAvatarFailed(false);
    setPersonalityId(id);
  }

  const accent = current.accent;
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
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(circle at 50% 14%, ${current.glow}, transparent 30rem), radial-gradient(circle at 50% 96%, ${current.glow}, transparent 32rem)`
        }}
      />

      {/* Status row */}
      <header className="relative z-20 flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className="size-2 rounded-full"
            style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
          />
          {current.name}
          <span className="text-text-tertiary">· {current.role}</span>
        </div>
        <div className="flex items-center gap-2">
          {voice.latencyMs !== null && (
            <div
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm tabular-nums text-text-secondary backdrop-blur"
              title="Voice-to-voice round trip"
            >
              <span className="text-text-tertiary">↻</span>
              {voice.latencyMs} ms
            </div>
          )}
          {active && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm backdrop-blur",
                voice.searching
                  ? "border-sky-400/30 bg-sky-500/10 text-sky-200"
                  : voice.seeing
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-200"
              )}
            >
              {voice.searching ? (
                <>🔎 Searching…</>
              ) : voice.seeing ? (
                <>
                  <Camera className="size-3.5" aria-hidden="true" /> Seeing you
                </>
              ) : (
                <>
                  <CameraOff className="size-3.5" aria-hidden="true" /> No camera
                </>
              )}
            </div>
          )}
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary backdrop-blur">
            <span
              className="size-2 rounded-full transition-colors"
              style={{
                background: banner
                  ? "#f87171"
                  : active
                    ? accent
                    : "rgba(255,255,255,0.25)"
              }}
            />
            {banner ? "Error" : LABEL[voice.mode]}
          </div>
        </div>
      </header>

      {/* The selected character's 3D avatar (lip-synced). Robot-face fallback. */}
      <div className="relative z-10 mx-auto mt-1 flex h-[52vh] max-h-[560px] w-full max-w-[560px] items-center justify-center">
        {avatarFailed ? (
          <RobotFace
            mode={voice.mode}
            audioLevel={voice.audioLevel}
            className="h-full w-full"
          />
        ) : current.customRig ? (
          <ModelAvatar
            key={current.avatarUrl}
            url={current.avatarUrl}
            active={active}
            getAudioTap={voice.getAudioTap}
            hairColor={current.hairColor}
            onError={() => setAvatarFailed(true)}
            className="h-full w-full"
          />
        ) : (
          <SonaAvatar
            key={current.avatarUrl}
            url={current.avatarUrl}
            active={active}
            body={current.gender === "male" ? "M" : "F"}
            hairColor={current.hairColor}
            getAudioTap={voice.getAudioTap}
            registerControls={voice.registerAvatarControls}
            onError={() => setAvatarFailed(true)}
            className="h-full w-full"
          />
        )}
      </div>

      {/* Live camera view */}
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

      {/* Controls + character select */}
      <section className="relative z-20 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-end gap-4 px-5 pb-8 sm:px-8">
        {banner && (
          <div className="mx-auto w-full rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {banner}
          </div>
        )}
        {active && voice.cameraError && (
          <div className="mx-auto w-full rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Camera unavailable ({voice.cameraError}). {current.name} can hear you
            but can&apos;t see — allow camera access and reconnect.
          </div>
        )}

        {!active && (
          <p className="text-center text-sm text-text-tertiary">
            {current.tagline} Tap to talk.
          </p>
        )}

        {/* Talk button — themed to the character */}
        <div className="flex flex-col items-center gap-2">
          <button
            aria-label={active ? "End conversation" : "Start talking"}
            className="grid size-20 place-items-center rounded-full border bg-surface/80 transition-colors hover:bg-surface-2"
            style={{
              borderColor: voice.mode === "idle" ? "rgba(255,255,255,0.12)" : accent,
              color: voice.mode === "idle" ? undefined : accent,
              background:
                voice.mode === "idle" ? undefined : `${current.glow}`,
              boxShadow: active ? `0 0 30px ${current.glow}` : undefined
            }}
            onClick={() => void voice.toggle()}
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

        {/* Character bar — switch personalities when idle */}
        <div className="mx-auto mt-1 flex items-stretch justify-center gap-3">
          {PERSONALITIES.map((p) => {
            const sel = p.id === personalityId;
            return (
              <button
                key={p.id}
                type="button"
                disabled={active}
                onClick={() => pick(p.id)}
                className={cn(
                  "flex w-44 items-center gap-3 rounded-xl border bg-surface/60 px-3 py-2.5 text-left backdrop-blur transition-all",
                  active
                    ? sel
                      ? "opacity-100"
                      : "cursor-not-allowed opacity-30"
                    : "hover:bg-surface-2"
                )}
                style={
                  sel
                    ? {
                        borderColor: p.accent,
                        boxShadow: `inset 0 0 0 1px ${p.accent}, 0 12px 40px ${p.glow}`
                      }
                    : { borderColor: "rgba(255,255,255,0.08)" }
                }
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold"
                  style={{
                    background: p.glow,
                    color: p.accent,
                    border: `1px solid ${p.accent}66`
                  }}
                >
                  {p.name[0]}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-sm font-semibold"
                    style={{ color: sel ? p.accent : undefined }}
                  >
                    {p.name}
                  </span>
                  <span className="block truncate text-[11px] text-text-tertiary">
                    {p.role} · {p.gender === "male" ? "♂" : "♀"} voice
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
