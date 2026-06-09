import { getLLMProvider } from "@/lib/llm/provider";
import { searchMemories } from "@/lib/sona/memory/store";

/**
 * Build the memory block injected into the system prompt for a turn. Embeds the
 * incoming user message, vector-searches the household's memories, and formats
 * the top hits. Memory-driven context (top-K) instead of full-history replay is
 * the cost-control lever from the plan (§H) — and the reason Sona feels like it
 * remembers you.
 */
export async function buildMemoryContext(
  householdId: string,
  query: string
): Promise<string> {
  if (!query.trim()) return "";

  const provider = getLLMProvider();
  let embedding: number[] = [];
  try {
    [embedding] = await provider.embed([query]);
  } catch {
    return "";
  }

  const hits = await searchMemories(householdId, embedding ?? [], 6).catch(
    () => []
  );
  if (!hits.length) return "";

  const lines = hits.map((h) => `- ${h.content}`).join("\n");
  return `What you remember about this household (weave in naturally when relevant — do not recite as a list):\n${lines}`;
}
