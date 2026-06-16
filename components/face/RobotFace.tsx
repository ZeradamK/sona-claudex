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

