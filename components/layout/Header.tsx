import type { Session } from "next-auth";

export function Header({ session }: { session: Session | null }) {
  const name = session?.user?.name ?? session?.user?.email ?? "Sona";

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <div className="text-sm font-medium text-text">Sona</div>
      <div className="text-sm text-text-secondary">{name}</div>
    </header>
  );
}
