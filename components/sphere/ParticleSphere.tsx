"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  linkFragmentShader,
  linkVertexShader,
  particleFragmentShader,
  particleVertexShader
} from "@/components/sphere/shaders/particleSphereShaders";

export type SphereMode = "idle" | "listening" | "thinking" | "speaking";

type ParticleSphereProps = {
  mode?: SphereMode;
  active?: boolean;
  audioLevel?: number;
  particleCount?: number;
};

const stateWeights: Record<SphereMode, [number, number, number, number]> = {
  idle: [1, 0, 0, 0],
  listening: [0, 1, 0, 0],
  thinking: [0, 0, 1, 0],
  speaking: [0, 0, 0, 1]
};

function createSphereAssets(particleCount: number) {
  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < particleCount; i += 1) {
    const y = 1 - (i / (particleCount - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    const index = i * 3;

    positions[index] = Math.cos(theta) * radius;
    positions[index + 1] = y;
    positions[index + 2] = Math.sin(theta) * radius;
    seeds[i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    sizes[i] = 2.4 + seeds[i] * 3.2;
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  particleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const linkStride = 5;
  const linksPerPoint = 2;
  const linkCount = Math.floor(particleCount / linkStride) * linksPerPoint;
  const linkPositions = new Float32Array(linkCount * 2 * 3);
  const linkSeeds = new Float32Array(linkCount * 2);
  let linkOffset = 0;
  let seedOffset = 0;

  for (let i = 0; i < particleCount; i += linkStride) {
    const nearIndexes = [i + 1, i + 34];

    for (const rawNearIndex of nearIndexes) {
      const nearIndex = rawNearIndex % particleCount;
      const from = i * 3;
      const to = nearIndex * 3;

      linkPositions[linkOffset] = positions[from];
      linkPositions[linkOffset + 1] = positions[from + 1];
      linkPositions[linkOffset + 2] = positions[from + 2];
      linkPositions[linkOffset + 3] = positions[to];
      linkPositions[linkOffset + 4] = positions[to + 1];
      linkPositions[linkOffset + 5] = positions[to + 2];
      linkSeeds[seedOffset] = seeds[i];
      linkSeeds[seedOffset + 1] = seeds[nearIndex];
      linkOffset += 6;
      seedOffset += 2;
    }
  }

  const linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linkPositions, 3)
  );
  linkGeometry.setAttribute("aSeed", new THREE.BufferAttribute(linkSeeds, 1));

  return { linkGeometry, particleGeometry };
}

export function ParticleSphere({
  mode = "idle",
  active = false,
  audioLevel = 0,
  particleCount = 4200
}: ParticleSphereProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linksRef = useRef<THREE.LineSegments>(null);
  const stateVector = useMemo(() => new THREE.Vector4(1, 0, 0, 0), []);
  const targetVector = useMemo(() => new THREE.Vector4(1, 0, 0, 0), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uActive: { value: 0 },
      uLineOpacity: { value: 0.04 },
      uState: { value: stateVector }
    }),
    [stateVector]
  );
  const { linkGeometry, particleGeometry } = useMemo(
    () => createSphereAssets(particleCount),
    [particleCount]
  );

  useFrame(({ clock }, delta) => {
    const points = pointsRef.current;
    const [idle, listening, thinking, speaking] = stateWeights[mode];

    targetVector.set(idle, listening, thinking, speaking);
    stateVector.lerp(targetVector, 1 - Math.exp(-delta * 4.2));

    const time = clock.getElapsedTime();
    const syntheticAudio =
      mode === "speaking"
        ? 0.2 + Math.sin(time * 8.6) * 0.07 + Math.sin(time * 13.1) * 0.045
        : mode === "listening"
          ? 0.13 + Math.sin(time * 5.4) * 0.055
          : mode === "thinking"
            ? 0.08 + Math.sin(time * 2.6) * 0.025
            : 0.035 + Math.sin(time * 1.2) * 0.018;
    const amplitudeTarget = Math.max(audioLevel, syntheticAudio);

    uniforms.uTime.value = time;
    uniforms.uAmplitude.value +=
      (THREE.MathUtils.clamp(amplitudeTarget, 0, 1) -
        uniforms.uAmplitude.value) *
      (1 - Math.exp(-delta * 7.5));
    uniforms.uActive.value +=
      ((active ? 1 : 0) - uniforms.uActive.value) *
      (1 - Math.exp(-delta * 3.2));

    if (points) {
      points.rotation.y += delta * (mode === "listening" ? 0.08 : 0.045);
      points.rotation.x = Math.sin(time * 0.22) * 0.035;
      points.rotation.z = Math.sin(time * 0.17) * 0.026;
    }

    if (linksRef.current && points) {
      linksRef.current.rotation.copy(points.rotation);
    }

    const lineTarget =
      0.035 +
      stateVector.y * 0.09 +
      stateVector.z * 0.07 +
      stateVector.w * 0.105;
    uniforms.uLineOpacity.value +=
      (lineTarget - uniforms.uLineOpacity.value) *
      (1 - Math.exp(-delta * 5.5));
  });

  return (
    <group>
      <lineSegments ref={linksRef} geometry={linkGeometry}>
        <shaderMaterial
          attach="material"
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fragmentShader={linkFragmentShader}
          transparent
          uniforms={uniforms}
          vertexShader={linkVertexShader}
        />
      </lineSegments>
      <points ref={pointsRef} geometry={particleGeometry}>
        <shaderMaterial
          attach="material"
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fragmentShader={particleFragmentShader}
          transparent
          uniforms={uniforms}
          vertexShader={particleVertexShader}
        />
      </points>
    </group>
  );
}
