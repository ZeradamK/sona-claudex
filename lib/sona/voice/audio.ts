/**
 * Browser audio plumbing for Sona's voice loop.
 *   MicCapture       — 16 kHz mono PCM16 capture, RMS amplitude readout
 *   SpeakerPlayback  — 24 kHz mono PCM16 scheduled queue, RMS amplitude readout
 */

const MIC_RATE = 16000;
const SPEAKER_RATE = 24000;
// HeadAudio derives visemes from the playing signal with a small processing
// latency, so the mouth would otherwise trail the sound (a "dubbed" look). We
// tap the speech BEFORE this delay and play it AFTER, so the audio reaches the
// ears exactly when the avatar's mouth forms the shape. ~90ms ≈ HeadAudio's
// window/classify latency; barely perceptible as response delay.
const LIPSYNC_DELAY_SEC = 0.09;

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;

  async start(onPcmChunk: (int16: Int16Array) => void) {
    this.ctx = new AudioContext({ sampleRate: MIC_RATE });

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: MIC_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    await this.ctx.audioWorklet.addModule("/voice/pcm16-encoder.js");

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.ctx, "pcm16-encoder");
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);

    this.source.connect(this.worklet);
    this.source.connect(this.analyser);

    this.worklet.port.onmessage = (event) => {
      if (event.data instanceof Int16Array) onPcmChunk(event.data);
    };
  }

  level(): number {
    if (!this.analyser || !this.analyserBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) {
      sum += this.analyserBuf[i] * this.analyserBuf[i];
    }
    return Math.min(1, Math.sqrt(sum / this.analyserBuf.length) * 3);
  }

  async stop() {
    try {
      this.worklet?.disconnect();
      this.source?.disconnect();
      this.analyser?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.ctx?.close();
    } catch {
      // ignore
    }
    this.worklet = null;
    this.source = null;
    this.analyser = null;
    this.analyserBuf = null;
    this.stream = null;
    this.ctx = null;
  }
}

export class SpeakerPlayback {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Float32Array<ArrayBuffer> | null = null;
  private gain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private nextPlayTime = 0;
  // Every source currently scheduled or playing. flush() stops them all for an
  // instant barge-in, instead of only refusing to schedule *new* chunks.
  private live = new Set<AudioBufferSourceNode>();

  async start() {
    this.ctx = new AudioContext({ sampleRate: SPEAKER_RATE });
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyserBuf = new Float32Array(this.analyser.fftSize);

    // gain is the lip-sync tap (pre-delay). Playback path is delayed so the
    // sound lands in sync with the visemes HeadAudio derives from that tap.
    this.delay = this.ctx.createDelay(1);
    this.delay.delayTime.value = LIPSYNC_DELAY_SEC;
    this.gain.connect(this.delay);
    this.delay.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.nextPlayTime = this.ctx.currentTime;
  }

  enqueue(int16: Int16Array) {
    if (!this.ctx || !this.gain) return;
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float[i] = int16[i] / 0x8000;
    }
    const buf = this.ctx.createBuffer(1, float.length, SPEAKER_RATE);
    buf.getChannelData(0).set(float);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);

    // Track the node so a barge-in flush can stop it mid-playback; drop it
    // from the set once it finishes on its own.
    this.live.add(src);
    src.onended = () => {
      this.live.delete(src);
    };

    const now = this.ctx.currentTime;
    if (this.nextPlayTime < now) this.nextPlayTime = now;
    src.start(this.nextPlayTime);
    this.nextPlayTime += buf.duration;
  }

  /** Seconds of audio still queued (unplayed). */
  remaining(): number {
    if (!this.ctx) return 0;
    return Math.max(0, this.nextPlayTime - this.ctx.currentTime);
  }

  /** The AudioContext speech is played through (for sharing a graph). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * The node carrying Sona's speech — a tap point for lip-sync. HeadAudio
   * connects here to derive visemes from the exact audio that's playing, so the
   * avatar's mouth is automatically in sync. It's a no-output sink, so tapping
   * it doesn't change playback.
   */
  get speechNode(): GainNode | null {
    return this.gain;
  }

  level(): number {
    if (!this.analyser || !this.analyserBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) {
      sum += this.analyserBuf[i] * this.analyserBuf[i];
    }
    return Math.min(1, Math.sqrt(sum / this.analyserBuf.length) * 3);
  }

  /** Barge-in: silence everything already playing AND stop scheduling. */
  flush() {
    for (const src of this.live) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // already stopped / ended
      }
    }
    this.live.clear();
    if (this.ctx) this.nextPlayTime = this.ctx.currentTime;
  }

  async stop() {
    try {
      this.flush();
      this.gain?.disconnect();
      this.delay?.disconnect();
      this.analyser?.disconnect();
      await this.ctx?.close();
    } catch {
      // ignore
    }
    this.gain = null;
    this.delay = null;
    this.analyser = null;
    this.analyserBuf = null;
    this.ctx = null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
