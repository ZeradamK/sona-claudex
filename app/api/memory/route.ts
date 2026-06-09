import { NextResponse } from "next/server";

import { requireSonaUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ensureHouseholdForUser } from "@/lib/sona/household";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMORY_SELECT = {
  id: true,
  kind: true,
  content: true,
  importance: true,
  profileId: true,
  createdAt: true,
  updatedAt: true
} as const;

// GET /api/memory?q=&kind= — list the household's memories for the Timeline.
export async function GET(req: Request) {
  const auth = await requireSonaUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ctx = await ensureHouseholdForUser(auth.userId).catch(() => null);
  if (!ctx) return NextResponse.json({ memories: [], persisted: false });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const kind = url.searchParams.get("kind")?.trim();

  const memories = await prisma.memory.findMany({
    where: {
      householdId: ctx.household.id,
      deletedAt: null,
      ...(kind ? { kind } : {}),
      ...(q ? { content: { contains: q, mode: "insensitive" as const } } : {})
    },
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: MEMORY_SELECT
  });

  return NextResponse.json({ memories, persisted: true });
}

// PATCH /api/memory  body: { id, content?, importance? } — edit a fact.
export async function PATCH(req: Request) {
  const auth = await requireSonaUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, content, importance } = (await req.json().catch(() => ({}))) as {
    id?: string;
    content?: string;
    importance?: number;
  };
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const ctx = await ensureHouseholdForUser(auth.userId).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "database_unavailable" }, { status: 503 });

  // Scope the edit to the caller's household.
  const existing = await prisma.memory.findFirst({
    where: { id, householdId: ctx.household.id }
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const memory = await prisma.memory.update({
    where: { id },
    data: {
      ...(content !== undefined ? { content } : {}),
      ...(importance !== undefined ? { importance } : {})
    },
    select: MEMORY_SELECT
  });
  await prisma.auditLog
    .create({ data: { householdId: ctx.household.id, action: "memory_edited", details: { id } } })
    .catch(() => {});

  return NextResponse.json({ memory });
}

// DELETE /api/memory?id= — soft-delete a fact (recoverable; export still omits it).
export async function DELETE(req: Request) {
  const auth = await requireSonaUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const ctx = await ensureHouseholdForUser(auth.userId).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "database_unavailable" }, { status: 503 });

  const existing = await prisma.memory.findFirst({
    where: { id, householdId: ctx.household.id }
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.memory.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.auditLog
    .create({ data: { householdId: ctx.household.id, action: "memory_deleted", details: { id } } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
