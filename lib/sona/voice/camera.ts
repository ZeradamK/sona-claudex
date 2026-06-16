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
