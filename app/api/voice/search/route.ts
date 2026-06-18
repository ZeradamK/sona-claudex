import { NextResponse } from "next/server";

import { getLLMProvider } from "@/lib/llm/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Grounded web search for the voice loop. The live native-audio session can't
 * ground without dropping its socket, so the client calls this OUTSIDE the
 * session and relays the answer back in (see useVoice searchAndRelay).
 */
export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "gemini_api_key_missing" }, { status: 503 });
  }

  let query = "";
  try {
    const body = (await req.json()) as { query?: string };
    query = (body.query ?? "").trim();
  } catch {
    // ignore — empty query handled below
  }
  if (!query) {
    return NextResponse.json({ error: "empty_query" }, { status: 400 });
  }

  try {
    const answer = await getLLMProvider().searchWeb(query.slice(0, 500));
