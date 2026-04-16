"use client";

import { signIn } from "next-auth/react";
import { Github, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AuthPanel() {
  return (
    <div className="flex w-full max-w-[440px] flex-col items-start gap-8">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          Phase 1 foundation
        </div>
        <div className="space-y-3">
          <h1 className="text-5xl font-medium tracking-normal text-text">
            Sona
          </h1>
          <p className="max-w-[32rem] text-base leading-7 text-text-secondary">
            A persistent AI assistant starting with secure auth, a protected
            chat surface, and the dark visual system that will carry the voice
            orb and streaming UI.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => signIn("google", { callbackUrl: "/chat" })}>
          Continue with Google
        </Button>
        <Button variant="outline" disabled title="GitHub auth lands after Google">
          <Github className="size-4" aria-hidden="true" />
          GitHub later
        </Button>
      </div>
    </div>
  );
}
