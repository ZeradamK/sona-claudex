import { prisma } from "@/lib/db/prisma";

export async function ensureHouseholdForUser(userId: string) {
  const existing = await prisma.householdMember.findFirst({
    where: { userId },
    include: {
      household: {
        include: {
          profiles: { orderBy: { createdAt: "asc" }, take: 1 }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    const profile =
      existing.household.profiles[0] ??
      (await prisma.profile.create({
        data: {
          householdId: existing.householdId,
          displayName: "You",
          kind: "adult"
        }
      }));

    return { household: existing.household, profile };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true }
  });

  const householdName =
    user?.name?.trim().split(/\s+/)[0]
      ? `${user.name.trim().split(/\s+/)[0]}'s household`
      : "Sona household";

  const profileDisplayName = user?.name?.trim().split(/\s+/)[0] ?? "You";

  const household = await prisma.household.create({
    data: {
      name: householdName,
      members: {
        create: {
          userId,
          role: "owner"
        }
      },
      profiles: {
        create: {
          displayName: profileDisplayName,
          kind: "adult"
        }
      }
    },
    include: { profiles: true }
  });

  return { household, profile: household.profiles[0] };
}
