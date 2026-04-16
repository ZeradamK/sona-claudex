"use client";

import { Canvas } from "@react-three/fiber";

import {
  ParticleSphere,
  type SphereMode
} from "@/components/sphere/ParticleSphere";

type SphereSceneProps = {
  mode?: SphereMode;
  active?: boolean;
  audioLevel?: number;
};

export function SphereScene({
  mode = "idle",
  active = false,
  audioLevel = 0
}: SphereSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.4], fov: 42 }}
      className="h-full w-full"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
    >
      <ParticleSphere active={active} audioLevel={audioLevel} mode={mode} />
    </Canvas>
  );
}
