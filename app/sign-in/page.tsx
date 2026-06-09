"use client";

import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";

type ProviderInfo = { id: string; name: string };

// Apple first — privacy-forward identity, Apple-acquisition posture.
const BUTTON_ORDER = ["apple", "google"];

export default function SignInPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    getProviders().then((res) => {
      if (!res) return;
      setProviders(Object.values(res).map((p) => ({ id: p.id, name: p.name })));
    });
  }, []);

  const ordered = [...providers].sort(
    (a, b) => BUTTON_ORDER.indexOf(a.id) - BUTTON_ORDER.indexOf(b.id)
  );

  return (
    <main className="grid min-h-screen place-items-center bg-bg text-text">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface/70 p-8 shadow-[0_22px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="text-lg font-medium">Sona</div>
          <div className="mt-1 text-sm text-text-tertiary">
            Sign in to talk to your household
          </div>
        </div>
        <div className="grid gap-3">
          {ordered.map((p) => (
            <button
              key={p.id}
              className="grid w-full place-items-center rounded-md border border-border bg-surface px-4 py-3 text-sm transition-colors hover:bg-surface-2"
              onClick={() => signIn(p.id, { callbackUrl: "/chat" })}
              type="button"
            >
              Continue with {p.name}
            </button>
          ))}
          {ordered.length === 0 && (
            <div className="text-center text-sm text-text-tertiary">
              No sign-in providers configured.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
