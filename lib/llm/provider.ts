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
  /** Grounded web search (googleSearch). Runs OUTSIDE the live voice session —
   * the live native-audio session can't ground without dropping its socket, so
   * the voice loop relays this result in via sendClientContent. */
  searchWeb(query: string): Promise<string>;
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
 *  - silenceDurationMs 300   → ms of trailing silence before Sona takes the
 *    turn. THE response-latency lever: every turn waits this long after you stop
 *    before she starts. 300 + END_SENSITIVITY_LOW feels near-instant while still
 *    not cutting mid-word. Raise toward 500–700 in a noisy room if she jumps in
 *    early; she already processes your speech AS you talk, so this is just the
 *    end-of-turn gate, not thinking time.
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
  silenceDurationMs: Number(process.env.SONA_VAD_SILENCE_MS ?? 300)
} as const;

/**
 * Avatar control tools. The live model calls these to drive its own face and
 * body — so expression is tied to what it actually feels/sees, not faked from
 * audio. The client routes the calls to TalkingHead (setMood / playGesture).
 */
const AVATAR_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "set_mood",
        description:
          "Set your facial expression to match how you feel right now. Call it whenever your feeling shifts so your face fits your words — smile when you're warm or pleased, soften when gentle, etc. Default back to neutral when calm.",
        parameters: {
          type: "OBJECT",
          properties: {
            mood: {
              type: "STRING",
              enum: ["neutral", "happy", "love", "sad", "angry", "fear", "disgust"],
              description:
                "happy = smiling and warm; love = affectionate/fond; neutral = calm and pleasant."
            }
          },
          required: ["mood"]
        }
      },
      {
        name: "play_gesture",
        description:
          "Play a natural hand/body gesture to react and punctuate, like a person would. Wave back with 'handup' when greeted or when you SEE the person wave at the camera; 'thumbup' to approve; 'ok'; 'shrug' when unsure; 'index' to point a thought. Use them sparingly and naturally.",
        parameters: {
          type: "OBJECT",
          properties: {
            gesture: {
              type: "STRING",
              enum: ["handup", "index", "ok", "thumbup", "thumbdown", "side", "shrug"],
              description: "handup = raise hand / wave hello."
            },
            hand: {
              type: "STRING",
              enum: ["left", "right"],
              description: "Optional. Which hand; defaults to right for a natural wave."
            }
          },
          required: ["gesture"]
        }
      }
    ]
  }
];

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

    // Tools for the live session — both OPT-IN. Verified the hard way (headless
    // browser): in the realtime native-audio bidi flow, BOTH googleSearch
    // grounding AND custom functionDeclarations drop the WebSocket the moment
    // they fire, and she goes silent — even though both work in one-shot API
    // turns. So real web search can't live inside this session today; it needs a
    // separate grounded call relayed in (see notes). Left gated for experiments.
    const tools: unknown[] = [];
    if (process.env.SONA_WEB_SEARCH === "1") tools.push({ googleSearch: {} });
    if (process.env.SONA_AVATAR_TOOLS === "1") tools.push(...AVATAR_TOOLS);

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
              automaticActivityDetection: VAD_CONFIG
            },
            // Web search (googleSearch) on by default — safe with native-audio.
            // Avatar function-call tools are still OPT-IN (SONA_AVATAR_TOOLS=1):
            // their client tool-response handshake drops the WebSocket and she
            // stops speaking. Disable web search with SONA_WEB_SEARCH=0.
            ...(tools.length ? { tools } : {}),
            // Session resumption is safe and stays on (SONA_SESSION_RESUMPTION=0
            // to disable).
            ...(process.env.SONA_SESSION_RESUMPTION === "0"
              ? {}
              : { sessionResumption: {} })
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
