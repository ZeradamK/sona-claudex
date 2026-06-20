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

        // Collect the full facial + body rig (this game model has 110 joints:
        // jaw, every lip, mouth corners, cheeks, eyelids, 6 eyebrows, eyeballs,
        // neck upper/lower, spine) so the avatar can move like Sona's RPM build —
        // speaking mouth, eye saccades, brow emphasis, blink, head-sway, breathing.
        const lowerLips: Bone[] = [];
        const upperLips: Bone[] = [];
        const mouthCorners: Bone[] = [];
        const cheeks: Bone[] = [];
        const upperEyelids: Bone[] = [];
        const lowerEyelids: Bone[] = [];
        const eyebrows: Bone[] = [];
        const eyeballs: Bone[] = [];
        let jaw: Bone | null = null;
        let neckUpper: Bone | null = null;
        let neckLower: Bone | null = null;
        let spineUpper: Bone | null = null;
        let spineMiddle: Bone | null = null;
        let headBone: { getWorldPosition: (v: unknown) => void } | null = null;
        model.traverse((o: unknown) => {
          const n = o as Bone & {
            isBone?: boolean;
            getWorldPosition?: (v: unknown) => void;
          };
          if (!n.isBone) return;
          const name = (n.name || "").toLowerCase();
          if (name.includes("unused")) return;
          n.userData = n.userData || {};
          n.userData.rx = n.rotation.x;
          n.userData.ry = n.rotation.y;
          n.userData.rz = n.rotation.z;
          if (/jaw/.test(name)) jaw = jaw ?? n;
          else if (/lip lower/.test(name)) lowerLips.push(n);
          else if (/lip upper/.test(name)) upperLips.push(n);
          else if (/mouth corner/.test(name)) mouthCorners.push(n);
          else if (/cheek.*upper/.test(name)) cheeks.push(n);
          else if (/eyelid.*upper/.test(name)) upperEyelids.push(n);
          else if (/eyelid.*lower/.test(name)) lowerEyelids.push(n);
          else if (/eyebrow/.test(name)) eyebrows.push(n);
          else if (/eyeball/.test(name)) eyeballs.push(n);
          else if (/neck upper/.test(name)) neckUpper = neckUpper ?? n;
          else if (/neck lower/.test(name)) neckLower = neckLower ?? n;
          else if (/spine upper/.test(name)) spineUpper = spineUpper ?? n;
          else if (/spine middle/.test(name)) spineMiddle = spineMiddle ?? n;
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

        // Rig-less models (e.g. a static Sketchfab mesh with 0 bones / 0 visemes)
        // can't lip-sync — there's no geometry to move. To keep them from being a
        // frozen statue we sway/bob the WHOLE model about the head, and bob more
        // when speech is flowing so it reads as engaged. Pivot at the head so the
        // rotation looks like a head/torso lean, not an orbit.
        const rigless =
          !jaw &&
          !neckUpper &&
          !spineUpper &&
          eyeballs.length === 0 &&
          upperEyelids.length === 0;
        type Pivot = {
          rotation: { x: number; y: number };
          position: { y: number };
        };
        let pivot: Pivot | null = null;
        if (rigless) {
          const g = new THREE.Group();
          g.position.copy(target);
          model.position.sub(target); // keep world position; head sits at pivot
          g.add(model);
          scene.add(g);
          pivot = g as unknown as Pivot;
        }
        const pivotBaseY = pivot ? pivot.position.y : 0;

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

        // ── Animation state ──────────────────────────────────────────────
        const t0 = performance.now();
        let mouth = 0; // 0..1 speech openness (smoothed)
        let brow = 0; // 0..1 brow emphasis, follows speech peaks
        let peak = 0; // decaying envelope of recent speech peaks
        // Gaze: small saccades biased toward the camera so the eyes feel alive.
        let gazeX = 0;
        let gazeY = 0;
        let gazeTX = 0;
        let gazeTY = 0;
        let nextSaccade = 600;
        // Blink.
        let nextBlink = 1500;
        let blink = 0;
        let blinking = false;
        let blinkT = 0;
        const rand = () => Math.random();

        function tick(now: number) {
          const t = (now - t0) / 1000;
          const ms = now - t0;

          // ── Mouth from audio (smoothed + gated → no jitter / glitch) ──
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
          // Slower attack / faster release reads as natural speech.
          mouth += (targetMouth - mouth) * (targetMouth > mouth ? 0.35 : 0.22);
          // Brow emphasis rises on speech peaks, eases back down.
          peak = Math.max(peak * 0.94, targetMouth);
          brow += (peak - brow) * 0.08;

          // Viseme variety so the mouth isn't a metronome hinge: blend an open
          // component (jaw) with a wide/round component (corners) during speech.
          const open = mouth;
          const wide = 0.5 + 0.5 * Math.sin(t * 6.3);
          if (jaw) {
            const j = jaw as Bone;
            j.rotation.x = j.userData.rx - open * 0.3; // drop the jaw
          }
          for (const lp of lowerLips)
            lp.rotation.x = lp.userData.rx - open * 0.1;
          for (const lp of upperLips)
            lp.rotation.x = lp.userData.rx + open * 0.04;
          for (const mc of mouthCorners) {
            mc.rotation.z = mc.userData.rz + open * wide * 0.06;
            mc.rotation.x = mc.userData.rx - open * 0.03;
          }
          for (const ch of cheeks)
            ch.rotation.x = ch.userData.rx - open * 0.02;

          // ── Eyes: micro-saccades, biased toward the camera (looks at you) ──
          if (ms > nextSaccade) {
            gazeTX = (rand() - 0.5) * 0.18; // horizontal
            gazeTY = (rand() - 0.5) * 0.1; // vertical
            nextSaccade = ms + 700 + rand() * 2200;
          }
          gazeX += (gazeTX - gazeX) * 0.25; // snap fast, then hold
          gazeY += (gazeTY - gazeY) * 0.25;
          for (const eb of eyeballs) {
            eb.rotation.y = eb.userData.ry + gazeX;
            eb.rotation.x = eb.userData.rx + gazeY;
          }

          // ── Blink (upper + lower lids) ──
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
              nextBlink = ms + 2200 + rand() * 3500;
            }
          }
          for (const el of upperEyelids)
            el.rotation.x = el.userData.rx + blink * 0.5;
          for (const el of lowerEyelids)
            el.rotation.x = el.userData.rx - blink * 0.2;

          // ── Eyebrows: idle micro-raise + speech emphasis ──
          const browLift = brow * 0.05 + Math.sin(t * 0.5) * 0.012;
          for (const eb of eyebrows) eb.rotation.x = eb.userData.rx - browLift;

          // ── Head-sway + breathing (layered, Sona-style life) ──
          const speakNod = open * Math.sin(t * 4.2) * 0.012;
          if (neckUpper) {
            const nb = neckUpper as Bone;
            nb.rotation.y = nb.userData.ry + Math.sin(t * 0.45) * 0.045 + gazeX * 0.25;
            nb.rotation.x = nb.userData.rx + Math.sin(t * 0.62) * 0.02 + speakNod;
            nb.rotation.z = nb.userData.rz + Math.sin(t * 0.33) * 0.015;
          }
          if (neckLower) {
            const nb = neckLower as Bone;
            nb.rotation.y = nb.userData.ry + Math.sin(t * 0.31) * 0.02;
          }
          const breath = Math.sin(t * 0.8) * 0.008;
          if (spineUpper) {
            const sb = spineUpper as Bone;
            sb.rotation.x = sb.userData.rx + breath;
          }
          if (spineMiddle) {
            const sb = spineMiddle as Bone;
            sb.rotation.x = sb.userData.rx + breath * 0.6;
          }

          // Rig-less fallback (no bones): lean/bob the whole model about the head,
          // more when speech is flowing — engaged, even without a moving mouth.
          if (pivot) {
            pivot.rotation.y = Math.sin(t * 0.5) * 0.03 + open * Math.sin(t * 3.5) * 0.025;
            pivot.rotation.x = Math.sin(t * 0.7) * 0.014 + open * 0.012;
            pivot.position.y = pivotBaseY + Math.sin(t * 0.8) * 0.004;
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
