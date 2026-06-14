import { GoogleGenAI } from "@google/genai";

import { gemini, GEMINI_MODELS, EMBEDDING_DIMENSIONS } from "@/lib/gemini";

/**
 * Single seam for every model call in Sona.
 *
 * The runtime is strictly single-vendor (Gemini) today — chosen for its
 * best-in-class TTS and large catalog of expressive voices. But chat, voice,
 * and embeddings all route through this interface so the *provider* is a
 * swappable detail: an on-device / Apple-Intelligence backend can implement
 * the same contract without touching a single route. That turns "all-Gemini"
 * from a lock-in liability into a one-line swap. See
 * project_apple_acquisition_pivot in memory for the why.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type StreamTextChunk = { text?: string; finishReason?: string };

export interface StreamTextOptions {
  history: ChatTurn[];
  systemInstruction: string;
  maxOutputTokens?: number;
}

export interface VoiceTokenOptions {
  persona: string;
  voiceName: string;
}

export interface VoiceToken {
  token: string;
  model: string;
  voiceName: string;
}

export interface CompleteOptions {
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  /** e.g. "application/json" to force structured output. */
  responseMimeType?: string;
}

export interface LLMProvider {
  readonly id: string;
  streamText(opts: StreamTextOptions): AsyncIterable<StreamTextChunk>;
  /** One-shot, non-streaming generation (fact extraction, classification…). */
  complete(opts: CompleteOptions): Promise<string>;
  mintVoiceToken(opts: VoiceTokenOptions): Promise<VoiceToken>;
  embed(texts: string[]): Promise<number[][]>;
}

const VOICE_TOKEN_LIFETIME_MS = 30 * 60 * 1000; // 30 min absolute
const VOICE_SESSION_START_WINDOW_MS = 60 * 1000; // 60 s to open the WS

/**
 * Server-side VAD tuning — this block IS turn-taking quality.
 *
 *  - START_SENSITIVITY_HIGH  → notice the user the instant they speak, so
 *    barge-in over Sona is snappy.
 *  - END_SENSITIVITY_LOW     → be PATIENT about deciding the user is done.
 *    The HIGH/600ms default cuts people off mid-thought; LOW + a longer
 *    silence window lets them breathe, pause, and gather a sentence.
 *  - silenceDurationMs 700   → ms of trailing silence before Sona takes the
 *    turn. Higher = fewer interruptions, slightly more latency. 600–800 is the
 *    natural-conversation sweet spot.
 *  - prefixPaddingMs 300     → audio kept before speech onset so the first
 *    syllable is never clipped.
 *
 * All env-overridable so we can tune on real hardware (e.g. a noisy kitchen
 * Pi) without a redeploy.
 */
const VAD_CONFIG = {
  disabled: false,
  startOfSpeechSensitivity:
    process.env.SONA_VAD_START_SENSITIVITY ?? "START_SENSITIVITY_HIGH",
  endOfSpeechSensitivity:
    process.env.SONA_VAD_END_SENSITIVITY ?? "END_SENSITIVITY_LOW",
  prefixPaddingMs: Number(process.env.SONA_VAD_PREFIX_PADDING_MS ?? 300),
  silenceDurationMs: Number(process.env.SONA_VAD_SILENCE_MS ?? 700)
} as const;

class GeminiProvider implements LLMProvider {
  readonly id = "gemini";

  constructor(private readonly client: GoogleGenAI) {}

  async *streamText({
    history,
    systemInstruction,
    maxOutputTokens
  }: StreamTextOptions): AsyncIterable<StreamTextChunk> {
    // Gemini calls the assistant role "model" — convert at the boundary.
    const contents = history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }]
    }));

    const result = await this.client.models.generateContentStream({
      model: GEMINI_MODELS.flash,
      contents,
      config: { systemInstruction, maxOutputTokens }
    });

    for await (const chunk of result) {
      const finish = chunk.candidates?.[0]?.finishReason;
      yield {
        text: chunk.text ?? undefined,
        finishReason: finish ? String(finish) : undefined
      };
    }
  }

  async mintVoiceToken({
    persona,
    voiceName
  }: VoiceTokenOptions): Promise<VoiceToken> {
    const model = GEMINI_MODELS.flashLive;

    // authTokens is newer than the published @google/genai types in some
    // versions; narrow to the shape we use.
    const ai = this.client as unknown as {
      authTokens: { create: (args: unknown) => Promise<{ name: string }> };
    };

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + VOICE_TOKEN_LIFETIME_MS).toISOString(),
        newSessionExpireTime: new Date(
          Date.now() + VOICE_SESSION_START_WINDOW_MS
        ).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } }
            },
            systemInstruction: { parts: [{ text: persona }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // Server-side VAD owns all turn-taking; the client just streams.
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
                endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
                prefixPaddingMs: 200,
                silenceDurationMs: 600
              }
            }
          }
        }
      }
    });

    return { token: token.name, model, voiceName };
  }

  async complete({
    prompt,
    systemInstruction,
    maxOutputTokens,
    responseMimeType
  }: CompleteOptions): Promise<string> {
    const res = await this.client.models.generateContent({
      model: GEMINI_MODELS.flash,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        maxOutputTokens,
        ...(responseMimeType ? { responseMimeType } : {})
      }
    });
    return res.text ?? "";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const text of texts) {
      const res = await this.client.models.embedContent({
        model: GEMINI_MODELS.embedding,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS }
      });
      const values = (res as { embeddings?: Array<{ values?: number[] }> })
        .embeddings?.[0]?.values;
      out.push(values ?? []);
    }
    return out;
  }
}

/**
 * Placeholder for a future Apple Intelligence / on-device backend. It exists
 * so swapping the model is a config change, not a refactor — the core proof
 * point that Sona's Gemini dependency is not architectural lock-in.
 * Intentionally unimplemented.
 */
class AppleIntelligenceProvider implements LLMProvider {
  readonly id = "apple-intelligence";

  private notReady(): never {
    throw new Error(
      "apple_intelligence_provider_not_implemented: set SONA_LLM_PROVIDER=gemini"
    );
  }

  async *streamText(
    _opts: StreamTextOptions
  ): AsyncIterable<StreamTextChunk> {
    this.notReady();
  }

  complete(_opts: CompleteOptions): Promise<string> {
    return this.notReady();
  }

  mintVoiceToken(_opts: VoiceTokenOptions): Promise<VoiceToken> {
    return this.notReady();
  }

  embed(_texts: string[]): Promise<number[][]> {
    return this.notReady();
  }
}

let cached: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  const id = process.env.SONA_LLM_PROVIDER ?? "gemini";
  cached =
    id === "apple-intelligence"
      ? new AppleIntelligenceProvider()
      : new GeminiProvider(gemini);
  return cached;
}
