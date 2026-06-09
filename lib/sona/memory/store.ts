import { prisma } from "@/lib/db/prisma";

/**
 * Storage + retrieval for Sona's memory tier, backed by Postgres + pgvector.
 *
 * `Memory.embedding` is a pgvector column (Unsupported in Prisma's typed API),
 * so writes/reads of the vector itself go through raw SQL. Everything else uses
 * the typed client. Similarity is cosine distance (`<=>`).
 */

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export type StoreMemoryInput = {
  householdId: string;
  profileId?: string | null;
  kind: string; // semantic | procedural | episodic
  content: string;
  importance?: number;
  embedding?: number[];
};

export async function storeMemory(input: StoreMemoryInput): Promise<string> {
  const mem = await prisma.memory.create({
    data: {
      householdId: input.householdId,
      profileId: input.profileId ?? null,
      kind: input.kind,
      content: input.content,
      importance: input.importance ?? 0.5
    },
    select: { id: true }
  });

  if (input.embedding && input.embedding.length > 0) {
    const vec = toVectorLiteral(input.embedding);
    await prisma.$executeRaw`UPDATE "Memory" SET embedding = ${vec}::vector WHERE id = ${mem.id}`;
  }

  return mem.id;
}

export type MemoryHit = {
  id: string;
  kind: string;
  content: string;
  importance: number;
  distance: number;
};

/** Top-K most similar non-deleted memories for a household, by cosine distance. */
export async function searchMemories(
  householdId: string,
  embedding: number[],
  k = 6
): Promise<MemoryHit[]> {
  if (!embedding.length) return [];
  const vec = toVectorLiteral(embedding);

  return prisma.$queryRaw<MemoryHit[]>`
    SELECT id, kind, content, importance,
           (embedding <=> ${vec}::vector) AS distance
    FROM "Memory"
    WHERE "householdId" = ${householdId}
      AND "deletedAt" IS NULL
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${k}
  `;
}
