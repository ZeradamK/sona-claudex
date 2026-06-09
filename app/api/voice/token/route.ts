import { NextResponse } from "next/server";

import { requireSonaUser } from "@/lib/auth/session";
import { getLLMProvider } from "@/lib/llm/provider";
import { ensureHouseholdForUser } from "@/lib/sona/household";
import { buildPersona } from "@/lib/sona/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_VOICE = process.env.SONA_DEFAULT_VOICE ?? "Sulafat";

export async function POST() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "gemini_api_key_missing" }, { status: 503 });
  }

  const auth = await requireSonaUser();
  let profile:
    | Awaited<ReturnType<typeof ensureHouseholdForUser>>["profile"]
    | null = null;
  if (auth) {
    try {
      const ctx = await ensureHouseholdForUser(auth.userId);
      profile = ctx.profile;
    } catch {
      profile = null;
    }
  }

  const persona = buildPersona(profile);
  const voiceName = profile?.voiceId ?? DEFAULT_VOICE;

  try {
    const result = await getLLMProvider().mintVoiceToken({ persona, voiceName });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "token_mint_failed" },
      { status: 500 }
    );
  }
}
