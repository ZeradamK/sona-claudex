import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/options";

export async function getSonaSession() {
  try {
    return await getServerSession(authOptions);
  } catch {
    return null;
  }
}

export async function requireSonaUser() {
  const session = await getSonaSession();
  if (!session?.user) return null;
  const userId = (session.user as { id?: string }).id;
  if (!userId) return null;
  return { session, userId };
}
