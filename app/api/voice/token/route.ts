import { NextResponse } from "next/server";

import { requireSonaUser } from "@/lib/auth/session";
import { getLLMProvider } from "@/lib/llm/provider";
import { ensureHouseholdForUser } from "@/lib/sona/household";
import { getPersonality } from "@/lib/sona/personalities";
import { buildPersona } from "@/lib/sona/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "gemini_api_key_missing" }, { status: 503 });
  }

  // The client picks which personality to talk to (Sona, Alfred, …).
  let personalityId: string | undefined;
  try {
    const body = (await req.json()) as { personalityId?: string };
    personalityId = body.personalityId;
  } catch {
    // no body → default personality
  }
  const personality = getPersonality(personalityId);

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

  const persona = buildPersona(personality, profile, { spoken: true });
  const voiceName = personality.voiceName;

  try {
    const result = await getLLMProvider().mintVoiceToken({ persona, voiceName });
    return NextResponse.json({ ...result, personalityId: personality.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "token_mint_failed" },
      { status: 500 }
    );
  }
}
