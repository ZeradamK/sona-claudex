"use client";

/**
 * ModelAvatar — renders an arbitrary rigged GLB (e.g. a game-ripped character
 * like Alfred) that ISN'T a Ready-Player-Me/TalkingHead avatar, so it has no
 * visemes. It frames the head/upper body, lights it, idles, and drives a
 * jaw-bone "open mouth" from Sona's live audio amplitude — bone-based lip-sync
 * for models without morph-target visemes.
 *
 * three.js is browser-only, so it's dynamic-imported inside the effect.
 */

import { useEffect, useRef } from "react";

type AudioTap = { ctx: AudioContext; node: AudioNode };

type Props = {
  url: string;
  active: boolean;
  getAudioTap: () => AudioTap | null;
  /** Recolor the hair mesh (e.g. silver). */
  hairColor?: string;
  className?: string;
  onError?: (msg: string) => void;
};

export function ModelAvatar({
  url,
  active,
  getAudioTap,
  hairColor,
  className,
  onError
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const getTapRef = useRef(getAudioTap);
  const onErrorRef = useRef(onError);
  const activeRef = useRef(active);
  getTapRef.current = getAudioTap;
  onErrorRef.current = onError;
  activeRef.current = active;

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      const mount = mountRef.current;
      if (!mount) return;
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import(
          "three/examples/jsm/loaders/GLTFLoader.js"
        );
        if (disposed) return;

        const width = mount.clientWidth || 480;
        const height = mount.clientHeight || 560;

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance"
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(28, width / height, 0.01, 5000);

        // Studio-ish lighting for a dignified look.
        scene.add(new THREE.AmbientLight(0xffffff, 1.1));
        const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
        key.position.set(1, 2, 2.5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xd4af37, 0.6);
        rim.position.set(-2, 1.5, -1.5);
        scene.add(rim);
        const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5);
        fill.position.set(-1.5, 0.5, 2);
        scene.add(fill);

        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) {
          renderer.dispose();
          return;
        }
        const model = gltf.scene;
        scene.add(model);

        // Recolor hair if requested.
        if (hairColor) {
          model.traverse((o: unknown) => {
            const m = o as {
              isMesh?: boolean;
              name?: string;
              material?: unknown;
            };
            if (m.isMesh && /hair/i.test(m.name ?? "")) {
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              for (const mat of mats as Array<{
                map?: unknown;
                color?: { set: (h: string) => void };
                needsUpdate?: boolean;
              }>) {
                if (!mat) continue;
                mat.map = null;
                mat.color?.set(hairColor);
                mat.needsUpdate = true;
              }
            }
          });
        }

        // Find the jaw bone (for lip-sync) and a head bone (for framing).
        let jaw: { rotation: { x: number }; userData: Record<string, number> } | null =
          null;
        let headBone: { getWorldPosition: (v: unknown) => unknown } | null = null;
        model.traverse((o: unknown) => {
          const n = o as {
            isBone?: boolean;
            name?: string;
            rotation?: { x: number };
            userData?: Record<string, number>;
            getWorldPosition?: (v: unknown) => unknown;
          };
          const name = (n.name ?? "").toLowerCase();
          if (n.isBone) {
            if (!jaw && /jaw/.test(name)) {
              n.userData = n.userData || {};
              n.userData.restX = n.rotation?.x ?? 0;
              jaw = n as never;
            }
            if (/head\s*neck\s*upper|^head$|head_upper/.test(name)) {
              headBone = n as never;
            }
          }
        });

        // Frame the upper body (head + shoulders) using the bounding box.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        // Target the head region: top of the bbox, slightly down.
        const target = new THREE.Vector3();
        if (headBone) {
          (headBone as { getWorldPosition: (v: unknown) => void }).getWorldPosition(
            target
          );
        } else {
          target.set(center.x, box.min.y + size.y * 0.86, center.z);
        }
        // Distance to frame ~head+shoulders.
        const dist = maxDim * 0.55;
        camera.position.set(target.x, target.y + size.y * 0.02, target.z + dist);
        camera.lookAt(target);

        // Audio analyser on the live speech tap (for jaw movement).
        let analyser: AnalyserNode | null = null;
        let buf: Float32Array<ArrayBuffer> | null = null;
        function ensureAnalyser() {
          if (analyser) return;
          const tap = getTapRef.current();
          if (!tap) return;
          analyser = tap.ctx.createAnalyser();
          analyser.fftSize = 512;
          buf = new Float32Array(analyser.fftSize);
          tap.node.connect(analyser);
        }

        const t0 = performance.now();
        let jawCur = 0;
        function tick() {
          const t = (performance.now() - t0) / 1000;
          ensureAnalyser();
          // Speaking amplitude → jaw open.
          let amp = 0;
          if (analyser && buf) {
            analyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            amp = Math.min(1, Math.sqrt(sum / buf.length) * 6);
          }
          const targetJaw = activeRef.current ? amp : 0;
          jawCur += (targetJaw - jawCur) * 0.4; // smooth
          if (jaw) {
            const j = jaw as { rotation: { x: number }; userData: { restX: number } };
            j.rotation.x = j.userData.restX + jawCur * 0.32;
          }
          // Subtle idle sway.
          model.rotation.y = Math.sin(t * 0.5) * 0.05;
          model.position.y = Math.sin(t * 0.9) * 0.004 * maxDim;

          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);

        function onResize() {
          const w = mount!.clientWidth || width;
          const h = mount!.clientHeight || height;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
        window.addEventListener("resize", onResize);

        cleanup = () => {
          window.removeEventListener("resize", onResize);
          try {
            analyser?.disconnect();
          } catch {
            // ignore
          }
          renderer.dispose();
          renderer.domElement.remove();
          scene.traverse((o: unknown) => {
            const m = o as {
              geometry?: { dispose?: () => void };
              material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
            };
            m.geometry?.dispose?.();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) mat?.dispose?.();
          });
        };
      } catch (e) {
        onErrorRef.current?.(e instanceof Error ? e.message : "model_load_failed");
      }
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup();
    };
  }, [url, hairColor]);

  return <div ref={mountRef} className={className} />;
}
