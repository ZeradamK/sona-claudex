import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { authOptions } from "@/lib/auth/options";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/chat");
  }

  return (
    <main className="flex min-h-screen items-center px-6 py-12 sm:px-10">
      <AuthPanel />
    </main>
  );
}
