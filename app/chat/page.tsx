import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { authOptions } from "@/lib/auth/options";

export default async function ChatPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen bg-bg text-text">
      <Sidebar />
      <section className="flex min-w-0 flex-1 flex-col">
        <Header session={session} />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-[520px] text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-text-tertiary">
              Protected route
            </p>
            <h1 className="mt-3 text-3xl font-medium tracking-normal text-text">
              Sona chat foundation is ready.
            </h1>
            <p className="mt-4 text-base leading-7 text-text-secondary">
              The next phase adds the functional particle sphere before the
              streaming chat UI is wired in.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
