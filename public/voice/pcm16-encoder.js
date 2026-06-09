/**
 * Sona mic encoder. Runs in the AudioWorklet thread.
 * Receives 128-frame Float32 chunks from the mic and posts back Int16 PCM.
 * The AudioContext is constructed at 16 kHz so no resampling is needed.
 */
class PCM16Encoder extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }
    const ch = input[0];
    const out = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    this.port.postMessage(out, [out.buffer]);
    return true;
  }
}

registerProcessor("pcm16-encoder", PCM16Encoder);
