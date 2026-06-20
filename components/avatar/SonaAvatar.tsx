"use client";

/**
 * SonaAvatar — a real-time 3D human avatar (met4citizen/TalkingHead) whose mouth
 * lip-syncs to Sona's LIVE Gemini voice via the met4citizen/HeadAudio worklet.
 *
 * Architecture (keeps our whole voice pipeline intact):
 *   - TalkingHead renders the avatar + idle motion, eyes, blink, head-sway,
 *     breathing. It runs MUTED — it never plays audio; SpeakerPlayback still does.
 *   - HeadAudio is an AudioWorklet that taps the EXACT node our voice plays
 *     through (useVoice.getAudioTap → SpeakerPlayback.speechNode) and emits
 *     Oculus visemes from the playing signal — no transcripts/timestamps needed.
 *     We write those visemes onto TalkingHead's morph targets each frame.
 *
 * Both libraries are browser-only (WebGL / AudioWorkletNode), so they're
 * dynamic-imported inside effects — never evaluated during SSR. Any failure
 * (GLB load, worklet) is reported via onError so the page falls back to the
 * lightweight RobotFace and voice keeps working.
 */

import { useEffect, useRef } from "react";

import type { AvatarControls } from "@/lib/sona/voice/useVoice";

type AudioTap = { ctx: AudioContext; node: AudioNode };

type MorphTarget = { newvalue: number; needsUpdate: boolean };
type TalkingHeadInstance = {
  showAvatar: (opts: Record<string, unknown>) => Promise<void>;
  stop?: () => void;
  mtAvatar?: Record<string, MorphTarget | undefined>;
  armature?: { traverse: (cb: (o: unknown) => void) => void };
  opt: { update: ((dt: number) => void) | null };
  lookAtCamera?: (ms?: number) => void;
  speakWithHands?: (delay?: number, prob?: number) => void;
  setMood?: (mood: string) => void;
  playGesture?: (name: string, dur?: number, mirror?: boolean, ms?: number) => void;
};
type HeadAudioNode = AudioNode & {
  loadModel: (url: string) => Promise<void>;
  update: (dt: number) => void;
  onvalue: ((key: string, value: number) => void) | null;
  onstarted: (() => void) | null;
  onended: (() => void) | null;
};

type Props = {
  url: string;
  /** A voice session is live (audio is/will be flowing). */
  active: boolean;
  /** Body type for TalkingHead posing/animation — "M" male, "F" female. */
  body?: "M" | "F";
  /** Optional: recolor the hair (e.g. silver to age a character) after load. */
  hairColor?: string;
  getAudioTap: () => AudioTap | null;
  /** Register imperative controls so model tool calls can drive the avatar. */
  registerControls?: (controls: AvatarControls | null) => void;
  className?: string;
  onReady?: () => void;
  onError?: (msg: string) => void;
};

export function SonaAvatar({
  url,
  active,
  body = "F",
  hairColor,
  getAudioTap,
  registerControls,
  className,
  onReady,
  onError
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<TalkingHeadInstance | null>(null);
  const headAudioRef = useRef<HeadAudioNode | null>(null);
  const disposedRef = useRef(false);

  // Keep latest callbacks in refs so the heavy create-avatar effect doesn't
  // re-run when the parent passes fresh inline callback identities each render.
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const getTapRef = useRef(getAudioTap);
  const registerControlsRef = useRef(registerControls);
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const hairColorRef = useRef(hairColor);
  hairColorRef.current = hairColor;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  getTapRef.current = getAudioTap;
  registerControlsRef.current = registerControls;

  // 1) Create TalkingHead + load the avatar GLB (once per url).
  useEffect(() => {
    disposedRef.current = false;
    (async () => {
      const mount = mountRef.current;
      if (!mount) return;
      try {
        const mod = (await import("@met4citizen/talkinghead")) as unknown as {
          TalkingHead: new (
            el: HTMLElement,
            opt: Record<string, unknown>
          ) => TalkingHeadInstance;
        };
        if (disposedRef.current) return;
        const head = new mod.TalkingHead(mount, {
          lipsyncModules: [], // visemes come from HeadAudio, not text lip-sync
          cameraView: "upper",
          avatarMute: true, // TalkingHead never plays audio; SpeakerPlayback does
          modelFPS: 30,
          lightAmbientIntensity: 2,
          lightDirectIntensity: 28,
          avatarIdleHeadMove: 0.6,
          avatarSpeakingHeadMove: 0.6
        });
        headRef.current = head;
        await head.showAvatar({
          url,
          body: bodyRef.current,
          avatarMood: "neutral",
          lipsyncLang: "en"
        });
        if (disposedRef.current) {
          head.stop?.();
          return;
        }

        // Per-character appearance: recolor the hair (e.g. silver, to age a
        // distinguished butler) by tinting the hair mesh's material. We drop its
        // base texture so the tint reads as a solid color rather than darkening.
        if (hairColorRef.current) {
          try {
            const hex = hairColorRef.current;
            head.armature?.traverse((o) => {
              const mesh = o as {
                isMesh?: boolean;
                name?: string;
                material?: unknown;
              };
              if (mesh.isMesh && /hair/i.test(mesh.name ?? "")) {
                const mats = Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material];
                for (const m of mats) {
                  const mat = m as {
                    map?: unknown;
                    color?: { set: (h: string) => void };
                    roughness?: number;
                    metalness?: number;
                    needsUpdate?: boolean;
                  };
                  if (!mat) continue;
                  mat.map = null;
                  mat.color?.set(hex);
                  if (typeof mat.roughness === "number") mat.roughness = 0.85;
                  if (typeof mat.metalness === "number") mat.metalness = 0;
                  mat.needsUpdate = true;
                }
              }
            });
          } catch {
            // non-fatal — avatar still renders with its original hair
          }
        }

        // Expose mood/gesture controls so the model's tool calls can drive the
        // face and body. TalkingHead playGesture(name, dur, mirror): mirror=true
        // is the right hand — the natural side for a wave.
        registerControlsRef.current?.({
          setMood: (mood) => {
            try {
              head.setMood?.(mood);
            } catch {
              // ignore unknown mood
            }
          },
          playGesture: (gesture, hand) => {
            try {
              head.playGesture?.(gesture, 3, hand === "right");
            } catch {
              // ignore unknown gesture / rig without hands
            }
          }
        });
        onReadyRef.current?.();
      } catch (e) {
        onErrorRef.current?.(
          e instanceof Error ? e.message : "avatar_load_failed"
        );
      }
    })();

    return () => {
      disposedRef.current = true;
      registerControlsRef.current?.(null);
      try {
        headAudioRef.current?.disconnect();
      } catch {
        // ignore
      }
      headAudioRef.current = null;
      try {
        headRef.current?.stop?.();
      } catch {
        // ignore
      }
      headRef.current = null;
    };
  }, [url]);

  // 2) While a session is active, attach HeadAudio to THIS session's audio
  //    context once the tap exists. On session end, drop it so the next session
  //    re-attaches to its fresh context.
  useEffect(() => {
    if (!active) {
      try {
        headAudioRef.current?.disconnect();
      } catch {
        // ignore
      }
      headAudioRef.current = null;
      if (headRef.current?.opt) headRef.current.opt.update = null;
      return;
    }

    let cancelled = false;
    const poll = setInterval(async () => {
      const head = headRef.current;
      if (!head || headAudioRef.current) return; // not ready, or already wired
      const tap = getTapRef.current(); // live audio graph for this session
      if (!tap) return; // session audio graph not up yet
      clearInterval(poll);
      try {
        const mod = (await import(
          "@met4citizen/headaudio/dist/headaudio.min.mjs"
        )) as unknown as {
          HeadAudio: new (
            ctx: BaseAudioContext,
            opt: Record<string, unknown>
          ) => HeadAudioNode;
        };
        // The worklet must be registered on the SAME context as the source node.
        await tap.ctx.audioWorklet.addModule("/avatar/headworklet.min.mjs");
        if (cancelled) return;
        const ha = new mod.HeadAudio(tap.ctx, {
          parameterData: {
            // Sona's voice is female (~200Hz); the 150Hz default mistracks
            // visemes. Tighter inactive gate closes the mouth cleanly in pauses.
            speakerMeanHz: 200,
            vadGateActiveDb: -42,
            vadGateInactiveDb: -55
          }
        });
        await ha.loadModel("/avatar/model-en-mixed.bin");
        if (cancelled) {
          try {
            ha.disconnect();
          } catch {
            // ignore
          }
          return;
        }
        tap.node.connect(ha); // HeadAudio is a no-output sink: playback unaffected
        ha.onvalue = (key, value) => {
          const mt = head.mtAvatar?.[key];
          if (mt) {
            mt.newvalue = value;
            mt.needsUpdate = true;
          }
        };
        head.opt.update = ha.update.bind(ha); // advanced each TalkingHead frame

        // Lifelike turn-taking: when she starts a new sentence (after a real
        // pause), make eye contact and — on bigger gaps (a new reply) — gesture
        // with her hands, like a person would. Guarded: some rigs lack hands.
        let lastEnded = 0;
        ha.onended = () => {
          lastEnded = Date.now();
        };
        ha.onstarted = () => {
          const gap = Date.now() - lastEnded;
          try {
            head.lookAtCamera?.(600);
            if (gap > 400) head.speakWithHands?.();
          } catch {
            // ignore (rig without hand bones)
          }
        };
        headAudioRef.current = ha;
      } catch {
        // Lip-sync failed (worklet/model); avatar still renders + idles. Non-fatal.
      }
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [active]);

  return <div ref={mountRef} className={className} />;
}
