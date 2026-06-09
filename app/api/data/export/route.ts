import { NextResponse } from "next/server";

import { requireSonaUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ensureHouseholdForUser } from "@/lib/sona/household";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/data/export
 * Full, user-owned JSON export of everything Sona knows about this household.
 * The "your data is yours" proof point for the Apple-acquisition / privacy
 * posture. Encrypted integration credentials are deliberately excluded.
 */
export async function GET() {
  const auth = await requireSonaUser();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ctx = await ensureHouseholdForUser(auth.userId).catch(() => null);
  if (!ctx) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
  const householdId = ctx.household.id;

  const [members, profiles, devices, messages, memories, alarms, notes, contacts] =
    await Promise.all([
      prisma.householdMember.findMany({ where: { householdId } }),
      prisma.profile.findMany({ where: { householdId } }),
      prisma.device.findMany({ where: { householdId } }),
      prisma.message.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
      prisma.memory.findMany({ where: { householdId, deletedAt: null } }),
      prisma.alarm.findMany({ where: { householdId } }),
      prisma.note.findMany({ where: { householdId } }),
      prisma.contact.findMany({ where: { householdId } })
    ]);

  await prisma.user
    .update({ where: { id: auth.userId }, data: { lastExportedAt: new Date() } })
    .catch(() => {});
  await prisma.auditLog
    .create({ data: { householdId, action: "data_exported", details: { by: auth.userId } } })
    .catch(() => {});

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    household: {
      id: ctx.household.id,
      name: ctx.household.name,
      createdAt: ctx.household.createdAt
    },
    members,
    profiles,
    devices,
    messages,
    memories,
    alarms,
    notes,
    contacts
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="sona-export-${householdId}.json"`
    }
  });
}
