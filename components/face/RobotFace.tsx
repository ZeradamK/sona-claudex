"use client";

/**
 * RobotFace — a WALL-E-style expressive face: two binocular "lens" eyes that
 * saccade and blink, and a robotic mouth (an EQ-like grille) that moves with
 * Sona's voice. Driven by `mode` + `audioLevel`.
 *
 * The animation runs in a single requestAnimationFrame loop that mutates SVG
 * attributes through refs — no React re-render per frame, so it stays smooth.
 */

import { useEffect, useRef } from "react";

export type FaceMode =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

type Props = {
  mode?: FaceMode;
  audioLevel?: number; // 0..1
  className?: string;
};

const COLOR: Record<FaceMode, string> = {
  idle: "#5f7184",
  connecting: "#f5a524",
  listening: "#22d3ee",
  thinking: "#f5a524",
  speaking: "#2dd4ee"
};

// Eye geometry (viewBox 0 0 440 280)
const EYE = { lx: 140, rx: 300, cy: 120, r: 70, iris: 34 };
const MOUTH = { cx: 220, cy: 214, bars: 5, gap: 22, w: 13 };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function RobotFace({ mode = "idle", audioLevel = 0, className }: Props) {
  const modeRef = useRef<FaceMode>(mode);
  const levelRef = useRef(audioLevel);
  modeRef.current = mode;
  levelRef.current = audioLevel;

  const pupilL = useRef<SVGGElement | null>(null);
  const pupilR = useRef<SVGGElement | null>(null);
  const lidL = useRef<SVGRectElement | null>(null);
  const lidR = useRef<SVGRectElement | null>(null);
  const lidBL = useRef<SVGRectElement | null>(null);
  const lidBR = useRef<SVGRectElement | null>(null);
  const irisL = useRef<SVGCircleElement | null>(null);
  const irisR = useRef<SVGCircleElement | null>(null);
  const barRefs = useRef<(SVGRectElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // mutable animation state
    const look = { x: 0, y: 0 };
    let lookTarget = { x: 0, y: 0 };
    let nextSaccade = 0;
    let nextBlink = 800;
    let blinkT = 0; // 0 = open, 1 = shut
    let blinking = false;
    let lidBase = 0; // eased baseline lid (squint/wide)
    let irisR0 = EYE.iris;
    let mouthH = 6;
    let t0 = performance.now();
    const start = t0;

    const tick = (now: number) => {
      const dt = Math.min(64, now - t0);
      t0 = now;
      const el = now - start;
      const m = modeRef.current;
      const lvl = levelRef.current;
      const color = COLOR[m];

      // ── eye look / saccades ──────────────────────────────
      const range =
        m === "listening" ? 12 : m === "thinking" ? 16 : m === "speaking" ? 8 : 22;
      if (el > nextSaccade) {
        lookTarget = {
          x: (Math.random() * 2 - 1) * range,
          // thinking glances up; otherwise wander around center
          y: (Math.random() * 2 - 1) * range * 0.7 - (m === "thinking" ? 10 : 0)
        };
        const cadence = m === "listening" ? 1400 : m === "idle" ? 2600 : 1800;
        nextSaccade = el + cadence + Math.random() * 1200;
      }
      look.x = lerp(look.x, lookTarget.x, 0.09);
      look.y = lerp(look.y, lookTarget.y, 0.09);
      pupilL.current?.setAttribute(
        "transform",
        `translate(${look.x.toFixed(2)} ${look.y.toFixed(2)})`
      );
      pupilR.current?.setAttribute(
        "transform",
        `translate(${look.x.toFixed(2)} ${look.y.toFixed(2)})`
      );

      // ── blink ────────────────────────────────────────────
      if (!blinking && el > nextBlink) {
        blinking = true;
        blinkT = 0;
      }
      if (blinking) {
        // quick close then open (~160ms total)
        blinkT += dt / 80;
        if (blinkT >= 2) {
          blinking = false;
          blinkT = 0;
          nextBlink = el + 2600 + Math.random() * 3800;
        }
      }
      const blinkAmt = blinking ? (blinkT < 1 ? blinkT : 2 - blinkT) : 0;

      // baseline lids by mode: listening = wide (low base), thinking = squint
      const targetBase =
        m === "listening" ? 4 : m === "thinking" ? 26 : m === "idle" ? 14 : 8;
      lidBase = lerp(lidBase, targetBase, 0.08);
      const topH = Math.min(EYE.r * 2, lidBase + blinkAmt * (EYE.r * 2));
      const botBase = m === "thinking" ? 22 : 8;
      const botH = Math.min(EYE.r * 2, botBase + blinkAmt * (EYE.r * 2));
      for (const lid of [lidL.current, lidR.current]) {
        lid?.setAttribute("height", topH.toFixed(1));
      }
      for (const lid of [lidBL.current, lidBR.current]) {
        if (lid) {
          lid.setAttribute("height", botH.toFixed(1));
          lid.setAttribute("y", (EYE.cy + EYE.r - botH).toFixed(1));
        }
      }

      // ── iris size / color / glow ─────────────────────────
      const targetIris =
        EYE.iris +
        (m === "listening" ? 5 : m === "thinking" ? -3 : 0) +
