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

export type LiveSessionEvent =
  | { type: "open" }
  | { type: "audioOut"; pcm: Int16Array }
  | { type: "inputTranscript"; text: string }
  | { type: "outputTranscript"; text: string }
  | { type: "turnComplete" }
  | { type: "interrupted" }
  | { type: "error"; message: string }
  | { type: "close" };

export type LiveSessionHandle = {
  sendPcm: (int16: Int16Array) => void;
  close: () => void;
};

type ConnectArgs = {
  token: string;
  model: string;
  onEvent: (event: LiveSessionEvent) => void;
};

export async function openLiveSession({
  token,
  model,
  onEvent
}: ConnectArgs): Promise<LiveSessionHandle> {
  const ai = new GoogleGenAI({
    apiKey: token,
    apiVersion: "v1alpha"
  });

  const session = await ai.live.connect({
    model,
    callbacks: {
      onopen: () => onEvent({ type: "open" }),
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
      },
      onerror: (e: unknown) => {
        const message =
          (e as { message?: string })?.message ??
          (e instanceof Error ? e.message : "live_error");
        onEvent({ type: "error", message });
      },
      onclose: () => onEvent({ type: "close" })
    },
    config: {
      responseModalities: [Modality.AUDIO]
    }
  });

  return {
    sendPcm: (int16: Int16Array) => {
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
    close: () => {
      try {
        session.close();
      } catch {
        // ignore
      }
    }
  };
}
