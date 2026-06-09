import { prisma } from "@/lib/db/prisma";
import { getLLMProvider } from "@/lib/llm/provider";
import { extractFacts } from "@/lib/sona/memory/extract";
import { storeMemory } from "@/lib/sona/memory/store";

/**
 * Post-turn worker: extract durable facts from a turn, embed them, and store
 * (with light dedupe). Fire-and-forget from the chat route so it never blocks
 * the response. Returns the number of new memories written.
 *
 * NOTE: on serverless (Vercel) this should move behind `after()` or a queue so
 * the work isn't cut off when the response closes. On a long-running node
 * server it completes fine as-is.
 */
export async function rememberTurn(opts: {
  householdId: string;
  profileId?: string | null;
  userText: string;
  assistantText: string;
}): Promise<number> {
  const facts = await extractFacts(opts.userText, opts.assistantText);
  if (!facts.length) return 0;

  const provider = getLLMProvider();
  let stored = 0;

  for (const fact of facts) {
    // Light dedupe: skip if we already remember an identical fact.
    const dupe = await prisma.memory.findFirst({
      where: { householdId: opts.householdId, content: fact.content, deletedAt: null },
      select: { id: true }
    });
    if (dupe) continue;

    let embedding: number[] = [];
    try {
      [embedding] = await provider.embed([fact.content]);
    } catch {
      embedding = [];
    }

    await storeMemory({
      householdId: opts.householdId,
      profileId: opts.profileId ?? null,
      kind: fact.kind,
      content: fact.content,
      importance: fact.importance,
      embedding
    });
    stored++;
  }

  return stored;
}
