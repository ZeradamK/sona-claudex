import { NextResponse } from "next/server";

import { requireSonaUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete  body: { confirm: "DELETE" }
 * Right-to-be-forgotten. Deletes every household the user OWNS (cascading all
 * household data — memories, messages, alarms, notes, contacts, sync state),
 * then the user (cascading accounts/sessions). Requires explicit confirmation.
 */
export async function POST(req: Request) {
  const auth = await requireSonaUser();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "confirmation_required", hint: 'POST { "confirm": "DELETE" }' },
      { status: 400 }
    );
  }

  try {
    const ownerMemberships = await prisma.householdMember.findMany({
      where: { userId: auth.userId, role: "owner" },
      select: { householdId: true }
    });
    const ownedHouseholdIds = ownerMemberships.map((m) => m.householdId);

    // Best-effort audit before the cascade removes the household (and its log).
    await Promise.all(
      ownedHouseholdIds.map((householdId) =>
        prisma.auditLog
          .create({ data: { householdId, action: "account_deleted", details: { by: auth.userId } } })
          .catch(() => {})
      )
    );

    await prisma.$transaction([
      ...(ownedHouseholdIds.length
        ? [prisma.household.deleteMany({ where: { id: { in: ownedHouseholdIds } } })]
        : []),
      prisma.user.delete({ where: { id: auth.userId } })
    ]);

    return NextResponse.json({ ok: true, deletedHouseholds: ownedHouseholdIds.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "delete_failed" },
      { status: 500 }
    );
  }
}
