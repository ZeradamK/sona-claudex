"use client";

/**
 * Thin wrapper over @google/genai's live.connect WebSocket.
 *
 * The browser receives a single-use ephemeral token from /api/voice/token
 * (the long-lived API key never leaves the server) and uses it to connect
 * directly to Gemini Live. The session config (persona, voice, modalities,
 * automatic VAD) is locked into the token at mint time, so the client
 * cannot tamper with Sona's behaviour.
 *
 * Server-side automatic VAD owns turn-taking. The client streams mic audio
 * continuously for the lifetime of the session; the server detects end of
 * speech and barge-in. We never send audioStreamEnd from the client.
 */

import { GoogleGenAI, Modality } from "@google/genai";

import { base64ToBytes, bytesToBase64 } from "@/lib/sona/voice/audio";

export type ToolCallFn = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
};

export type LiveSessionEvent =
  | { type: "open" }
  | { type: "audioOut"; pcm: Int16Array }
  | { type: "inputTranscript"; text: string }
  | { type: "outputTranscript"; text: string }
  | { type: "turnComplete" }
  | { type: "interrupted" }
  | { type: "toolCall"; calls: ToolCallFn[] }
  | { type: "resumeHandle"; handle: string }
  | { type: "error"; message: string }
  | { type: "close" };

export type LiveSessionHandle = {
  sendPcm: (int16: Int16Array) => void;
  /** Send one camera frame (base64 JPEG) so the model can see the user/room. */
  sendVideoFrame: (jpegBase64: string) => void;
  /** Inject a text turn (e.g. relay grounded web-search results to speak). */
  sendClientContent: (text: string) => void;
  /** Reply to a model tool call so it keeps going after the side effect runs. */
  sendToolResponse: (
    responses: Array<{ id?: string; name: string; response: Record<string, unknown> }>
  ) => void;
  close: () => void;
};

type ConnectArgs = {
  token: string;
  model: string;
  onEvent: (event: LiveSessionEvent) => void;
  /** Resume a prior session (preserves context across a reconnect). */
  resumeHandle?: string;
};

export async function openLiveSession({
  token,
  model,
  onEvent,
  resumeHandle
}: ConnectArgs): Promise<LiveSessionHandle> {
  const ai = new GoogleGenAI({
    apiKey: token,
    apiVersion: "v1alpha"
  });

  // Once the socket closes, sends would spam "WebSocket is already CLOSED"
  // (the mic/camera keep firing). Gate every send on this so a drop is silent.
  let open = false;

  const session = await ai.live.connect({
    model,
    callbacks: {
      onopen: () => {
        open = true;
        onEvent({ type: "open" });
      },
      onmessage: (msg) => {
        const serverContent = (
          msg as unknown as { serverContent?: Record<string, unknown> }
        ).serverContent;

        const modelTurn = serverContent?.modelTurn as
          | { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> }
          | undefined;

        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            const inline = part.inlineData;
            if (inline?.data) {
              const bytes = base64ToBytes(inline.data);
              const aligned = new Int16Array(bytes.length / 2);
              for (let i = 0; i < aligned.length; i++) {
                aligned[i] = (bytes[i * 2] | (bytes[i * 2 + 1] << 8)) << 16 >> 16;
              }
              onEvent({ type: "audioOut", pcm: aligned });
            }
          }
        }

        const inputT = (serverContent?.inputTranscription as
          | { text?: string }
          | undefined)?.text;
        if (inputT) onEvent({ type: "inputTranscript", text: inputT });

        const outputT = (serverContent?.outputTranscription as
          | { text?: string }
          | undefined)?.text;
        if (outputT) onEvent({ type: "outputTranscript", text: outputT });

        if (serverContent?.turnComplete) onEvent({ type: "turnComplete" });
        if (serverContent?.interrupted) onEvent({ type: "interrupted" });

        // Tool calls — the model driving its avatar (set_mood / play_gesture).
        const toolCall = (
          msg as unknown as {
            toolCall?: { functionCalls?: ToolCallFn[] };
          }
        ).toolCall;
        if (toolCall?.functionCalls?.length) {
          onEvent({ type: "toolCall", calls: toolCall.functionCalls });
        }

        // Session-resumption handle — save it so we can reconnect with context.
        const resumption = (
          msg as unknown as {
            sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string };
          }
        ).sessionResumptionUpdate;
        if (resumption?.resumable && resumption.newHandle) {
          onEvent({ type: "resumeHandle", handle: resumption.newHandle });
        }
      },
      onerror: (e: unknown) => {
        open = false;
        const message =
          (e as { message?: string })?.message ??
          (e instanceof Error ? e.message : "live_error");
        onEvent({ type: "error", message });
      },
      onclose: () => {
        open = false;
        onEvent({ type: "close" });
      }
    },
    config: {
      responseModalities: [Modality.AUDIO],
      // Resume prior context when reconnecting; {} just enables handles.
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {}
    }
  });

  return {
    sendPcm: (int16: Int16Array) => {
      if (!open) return;
      const bytes = new Uint8Array(
        int16.buffer,
        int16.byteOffset,
        int16.byteLength
      );
      session.sendRealtimeInput({
        audio: {
          data: bytesToBase64(bytes),
          mimeType: "audio/pcm;rate=16000"
        }
      });
    },
    sendVideoFrame: (jpegBase64: string) => {
      if (!open) return;
      // Same realtime-input channel as audio; the model fuses vision with the
      // spoken turn. `media` is the canonical field for still frames (serializes
      // to mediaChunks[]); data is RAW base64, no data: URL prefix. ~1 fps from
      // CameraCapture keeps image-token cost sane.
      session.sendRealtimeInput({
        media: { data: jpegBase64, mimeType: "image/jpeg" }
      });
    },
    close: () => {
      try {
        session.close();
      } catch {
        // ignore
      }
    }
  };
}
