/**
 * CameraCapture — one getUserMedia video stream, shown in a preview <video> and
 * sampled to JPEG frames that are streamed to Gemini Live so the agent can
 * actually SEE the user and the room.
 *
 * Frames are downscaled to `maxDim` on the long edge (Gemini downsamples images
 * anyway) and emitted as raw base64 (no data: prefix) at `fps`. ~1 fps is the
 * Live-API norm for continuous vision — enough for situational awareness while
 * keeping image-token cost sane.
 */

const DEFAULT_FPS = 1;
const DEFAULT_MAX_DIM = 768;
const DEFAULT_QUALITY = 0.7;

export type CameraFrame = { data: string; mimeType: "image/jpeg" };

export class CameraCapture {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private ownsVideo = false;
  private canvas: HTMLCanvasElement | null = null;
  private timer: number | null = null;

  async start(opts: {
    onFrame: (frame: CameraFrame) => void;
    videoEl?: HTMLVideoElement | null;
    fps?: number;
    maxDim?: number;
    quality?: number;
  }) {
    const {
      onFrame,
      videoEl,
      fps = DEFAULT_FPS,
      maxDim = DEFAULT_MAX_DIM,
      quality = DEFAULT_QUALITY
    } = opts;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    let video = videoEl ?? null;
    if (!video) {
      video = document.createElement("video");
      this.ownsVideo = true;
    }
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play();
    } catch {
      // autoplay can reject without a gesture; the stream still renders frames
    }
    this.video = video;
    this.canvas = document.createElement("canvas");

    const capture = () => {
      const v = this.video;
      const c = this.canvas;
      if (!v || !c || !v.videoWidth || !v.videoHeight) return;
      const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.max(1, Math.round(v.videoWidth * scale));
      const h = Math.max(1, Math.round(v.videoHeight * scale));
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const url = c.toDataURL("image/jpeg", quality);
      const comma = url.indexOf(",");
      const data = comma >= 0 ? url.slice(comma + 1) : "";
      if (data) onFrame({ data, mimeType: "image/jpeg" });
    };

    const intervalMs = Math.max(200, Math.round(1000 / fps));
    this.timer = window.setInterval(capture, intervalMs);
  }

