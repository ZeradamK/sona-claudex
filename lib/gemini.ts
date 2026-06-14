import { GoogleGenAI } from "@google/genai";

const globalForGemini = globalThis as unknown as {
  gemini?: GoogleGenAI;
};

export const gemini =
  globalForGemini.gemini ??
  new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

if (process.env.NODE_ENV !== "production") {
  globalForGemini.gemini = gemini;
}

/**
 * Sona is an all-Gemini runtime stack:
 *   - text reasoning  → flash
 *   - voice (S2S)     → flashLive (Phase 2)
 *   - embeddings      → embedding
 *
 * Override any of these via env if a newer model rolls out.
 */
export const GEMINI_MODELS = {
  flash: process.env.GEMINI_MODEL_FLASH ?? "gemini-2.5-flash",
  // Native-audio dialog model: the model itself hears and speaks, preserving
  // paralinguistics (pauses, tone, backchannels) — unlike the half-cascade
  // "*-live" variants that lose them. This is what makes turn-taking feel human.
  flashLive:
    process.env.GEMINI_MODEL_FLASH_LIVE ??
    "gemini-2.5-flash-native-audio-preview-12-2025",
  // gemini-embedding-001 supports configurable output dimensionality; we use
  // 1536 to match prisma Memory.embedding vector(1536). (text-embedding-004
  // was fixed at 768, which would not fit the column.)
  embedding: process.env.GEMINI_MODEL_EMBEDDING ?? "gemini-embedding-001"
} as const;

/** Must match prisma `Memory.embedding vector(<n>)`. */
export const EMBEDDING_DIMENSIONS = Number(
  process.env.GEMINI_EMBEDDING_DIM ?? 1536
);
