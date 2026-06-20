"use client";

/**
 * ModelAvatar — renders an arbitrary rigged GLB (e.g. a game-ripped character
 * like Alfred) that ISN'T a Ready-Player-Me/TalkingHead avatar. It frames the
 * head/upper body, lights it, and drives a real facial rig from Sona's live
 * audio: jaw + lower lips open with speech, plus idle blinking, head-sway and
 * breathing so it feels alive (Sona-style life) without morph-target visemes.
 *
 * Dev pose debug: /voice?pose=open forces the mouth open; ?hidePrim=8 hides
 * glTF primitives by index (that's how the glasses are removed — prim 8).
 */

import { useEffect, useRef } from "react";

type AudioTap = { ctx: AudioContext; node: AudioNode };

type Props = {
  url: string;
  active: boolean;
  getAudioTap: () => AudioTap | null;
  /** Primitive indices (glTF primitive order) to hide — e.g. the glasses. */
  hidePrimitives?: number[];
  className?: string;
  onError?: (msg: string) => void;
};

type Bone = {
  name: string;
  rotation: { x: number; y: number; z: number };
  userData: Record<string, number>;
};

export function ModelAvatar({
  url,
  active,
  getAudioTap,
  hidePrimitives,
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

        const params = new URLSearchParams(window.location.search);
        const forceOpen = params.get("pose") === "open";
        const hideExtra = (params.get("hidePrim") || "")
          .split(",")
          .map((s) => parseInt(s, 10))
          .filter((n) => !Number.isNaN(n));
        const hideSet = new Set([...(hidePrimitives ?? []), ...hideExtra]);

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
        const camera = new THREE.PerspectiveCamera(26, width / height, 0.01, 5000);
        scene.add(new THREE.AmbientLight(0xffffff, 1.15));
        const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
        key.position.set(1, 2, 2.5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xd4af37, 0.55);
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

        // Hide requested primitives (e.g. the glasses). A multi-primitive glTF
        // mesh is split by GLTFLoader into one single-material child mesh per
        // primitive, in primitive order — so we index by encounter order and
        // hide the whole child. (The old array-material path never fired here.)
        if (hideSet.size) {
          let pi = 0;
          model.traverse((o: unknown) => {
            const mesh = o as { isMesh?: boolean; visible?: boolean };
            if (!mesh.isMesh) return;
            if (hideSet.has(pi)) mesh.visible = false;
            pi++;
          });
        }

        // Collect facial + body bones to animate.
        const lowerLips: Bone[] = [];
        const upperEyelids: Bone[] = [];
        let jaw: Bone | null = null;
        let neck: Bone | null = null;
        let spine: Bone | null = null;
        let headBone: { getWorldPosition: (v: unknown) => void } | null = null;
        model.traverse((o: unknown) => {
          const n = o as Bone & {
            isBone?: boolean;
            getWorldPosition?: (v: unknown) => void;
          };
          if (!n.isBone) return;
          const name = (n.name || "").toLowerCase();
          n.userData = n.userData || {};
          n.userData.rx = n.rotation.x;
          n.userData.ry = n.rotation.y;
          n.userData.rz = n.rotation.z;
          if (/jaw/.test(name) && !jaw) jaw = n;
          else if (/lip lower/.test(name)) lowerLips.push(n);
          else if (/eyelid.*upper/.test(name)) upperEyelids.push(n);
          else if (/neck upper/.test(name) && !neck) neck = n;
          else if (/spine upper/.test(name) && !spine) spine = n;
          if (/neck upper|^head$/.test(name))
            headBone = n as unknown as { getWorldPosition: (v: unknown) => void };
        });

        // Frame the head + shoulders.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const target = new THREE.Vector3();
        const hb = headBone as { getWorldPosition: (v: unknown) => void } | null;
        if (hb) hb.getWorldPosition(target);
        else target.set(center.x, box.min.y + size.y * 0.86, center.z);
        camera.position.set(target.x, target.y + size.y * 0.01, target.z + maxDim * 0.52);
        camera.lookAt(target);

        // Audio analyser on the speech tap.
        let analyser: AnalyserNode | null = null;
        let abuf: Float32Array<ArrayBuffer> | null = null;
        function ensureAnalyser() {
          if (analyser) return;
          const tap = getTapRef.current();
          if (!tap) return;
          analyser = tap.ctx.createAnalyser();
          analyser.fftSize = 512;
          abuf = new Float32Array(analyser.fftSize);
          tap.node.connect(analyser);
        }

        const t0 = performance.now();
        let mouth = 0;
        let nextBlink = 1500;
        let blink = 0;
        let blinking = false;
        let blinkT = 0;
        function tick(now: number) {
          const t = (now - t0) / 1000;
          const ms = now - t0;

          // Mouth from audio (smoothed + gated → no jitter / glitch).
          ensureAnalyser();
          let amp = 0;
          if (analyser && abuf) {
            analyser.getFloatTimeDomainData(abuf);
            let sum = 0;
            for (let i = 0; i < abuf.length; i++) sum += abuf[i] * abuf[i];
            amp = Math.sqrt(sum / abuf.length) * 7;
          }
          if (amp < 0.06) amp = 0; // silence gate
          let targetMouth = activeRef.current ? Math.min(1, amp) : 0;
          if (forceOpen) targetMouth = 1;
          // Slower attack/faster release reads as natural speech.
          mouth += (targetMouth - mouth) * (targetMouth > mouth ? 0.35 : 0.22);

          if (jaw) {
            const j = jaw as Bone;
            j.rotation.x = j.userData.rx - mouth * 0.3; // open
          }
          for (const lp of lowerLips) {
            lp.rotation.x = lp.userData.rx - mouth * 0.12;
          }

          // Idle blink.
          if (!blinking && ms > nextBlink) {
            blinking = true;
            blinkT = 0;
          }
          if (blinking) {
            blinkT += 0.13;
            blink = blinkT < 1 ? blinkT : 2 - blinkT;
            if (blinkT >= 2) {
              blinking = false;
              blink = 0;
              nextBlink = ms + 2200 + Math.random() * 3500;
            }
          }
          for (const el of upperEyelids) {
            el.rotation.x = el.userData.rx + blink * 0.5;
          }

          // Gentle head-sway + breathing (Sona-style life), no whole-model jerk.
          if (neck) {
            const nb = neck as Bone;
            nb.rotation.y = nb.userData.ry + Math.sin(t * 0.45) * 0.04;
            nb.rotation.x = nb.userData.rx + Math.sin(t * 0.62) * 0.02;
          }
          if (spine) {
            const sb = spine as Bone;
            sb.rotation.x = sb.userData.rx + Math.sin(t * 0.8) * 0.008;
          }

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
  }, [url, hidePrimitives]);

  return <div ref={mountRef} className={className} />;
}
