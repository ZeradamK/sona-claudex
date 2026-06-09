import { getLLMProvider } from "@/lib/llm/provider";

/**
 * Post-turn fact extraction. After a conversation turn, ask Gemini Flash to
 * pull out durable, household-relevant facts worth remembering long-term. This
 * is the semantic/procedural tier of Sona's memory — the product wedge.
 */

export type ExtractedFact = {
  content: string;
  kind: "semantic" | "procedural";
  importance: number; // 0..1
};

const EXTRACTION_SYSTEM = `You extract durable facts about a household from one conversation turn.

Return ONLY JSON: {"facts":[{"content":"...","kind":"semantic|procedural","importance":0.0}]}

Rules:
- Keep only STABLE, long-term-useful facts: names, relationships, allergies, routines, preferences, recurring schedules, important dates, places.
- "semantic" = a fact about a person/place/thing. "procedural" = a standing preference for how Sona should behave.
- importance 0..1: allergies/safety ~0.9, names/relationships ~0.8, preferences ~0.5, trivia ~0.2.
- SKIP pleasantries, one-off requests, weather/time questions, and anything ephemeral.
- If nothing is worth saving, return {"facts":[]}. Never invent facts not present in the turn.`;

export async function extractFacts(
  userText: string,
  assistantText: string
): Promise<ExtractedFact[]> {
  const provider = getLLMProvider();
  const prompt = `User: ${userText}\nAssistant: ${assistantText}\n\nExtract durable household facts as JSON.`;

  let raw: string;
  try {
    raw = await provider.complete({
      prompt,
      systemInstruction: EXTRACTION_SYSTEM,
      maxOutputTokens: 512,
      responseMimeType: "application/json"
    });
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { facts?: ExtractedFact[] };
    return (parsed.facts ?? [])
      .filter((f) => typeof f?.content === "string" && f.content.trim().length > 0)
      .slice(0, 8)
      .map((f) => ({
        content: f.content.trim(),
        kind: f.kind === "procedural" ? "procedural" : "semantic",
        importance:
          typeof f.importance === "number"
            ? Math.min(1, Math.max(0, f.importance))
            : 0.5
      }));
  } catch {
    return [];
  }
}
