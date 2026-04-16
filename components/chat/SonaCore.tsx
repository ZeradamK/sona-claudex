"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Mic, Send, Square } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { SphereScene } from "@/components/sphere/SphereScene";
import type { SphereMode } from "@/components/sphere/ParticleSphere";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user";
  content: string;
};

export function SonaCore() {
  const [mode, setMode] = useState<SphereMode>("idle");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasConversation = messages.length > 0;

  const status = useMemo(() => {
    if (mode === "listening") return "Listening";
    if (mode === "thinking") return "Thinking";
    if (mode === "speaking") return "Speaking";
    return hasConversation ? "Ready" : "Idle";
  }, [hasConversation, mode]);

  useEffect(() => {
    return () => {
      timeouts.current.forEach(clearTimeout);
    };
  }, []);

  function clearModeTimers() {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }

  function queueConversationMotion() {
    clearModeTimers();
    setIsListening(false);
    setMode("thinking");
    timeouts.current.push(
      setTimeout(() => setMode("speaking"), 780),
      setTimeout(() => setMode("idle"), 3200)
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();

    if (!content) return;

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content
      }
    ]);
    setInput("");
    queueConversationMotion();
  }

  function toggleListening() {
    clearModeTimers();
    setIsListening((current) => {
      const next = !current;
      setMode(next ? "listening" : "idle");
      return next;
    });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(6,182,212,0.11),transparent_26rem),radial-gradient(circle_at_50%_72%,rgba(107,33,168,0.12),transparent_30rem)]" />

      <header className="relative z-20 flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="text-sm font-medium text-text">Sona</div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary backdrop-blur">
          <span
            className={cn(
              "size-2 rounded-full transition-colors",
              mode === "listening" && "bg-cyan-300",
              mode === "thinking" && "bg-accent-warm",
              mode === "speaking" && "bg-accent",
              mode === "idle" && "bg-text-tertiary"
            )}
          />
          {status}
        </div>
      </header>

      <motion.div
        animate={{
          height: hasConversation ? 210 : 520,
          opacity: 1,
          top: hasConversation ? 74 : "48%",
          width: hasConversation ? 210 : 520,
          y: hasConversation ? 0 : "-50%"
        }}
        className="pointer-events-none absolute left-1/2 z-10 max-h-[62vw] max-w-[62vw] -translate-x-1/2"
        initial={false}
        transition={{ type: "spring", stiffness: 90, damping: 24, mass: 0.9 }}
      >
        <SphereScene active={hasConversation} mode={mode} />
      </motion.div>

      <section className="relative z-20 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-5 pb-5 sm:px-8">
        <div
          className={cn(
            "flex flex-1 flex-col transition-[padding] duration-500",
            hasConversation ? "pt-[18rem]" : "justify-end pt-[58vh]"
          )}
        >
          <AnimatePresence initial={false}>
            {messages.length > 0 && (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex flex-col gap-3"
                exit={{ opacity: 0, y: 12 }}
                initial={{ opacity: 0, y: 12 }}
              >
                {messages.map((message) => (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="ml-auto max-w-[min(680px,88vw)] rounded-md border border-border bg-surface/75 px-4 py-3 text-sm leading-6 text-text shadow-[0_18px_80px_rgba(0,0,0,0.18)] backdrop-blur"
                    initial={{ opacity: 0, y: 10 }}
                    key={message.id}
                    layout
                  >
                    {message.content}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form
            className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-md border border-border bg-surface/85 p-2 shadow-[0_22px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl"
            onSubmit={handleSubmit}
          >
            <button
              aria-label={isListening ? "Stop listening" : "Start listening"}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-2 hover:text-text",
                isListening && "border-cyan-300/35 bg-cyan-300/10 text-cyan-200"
              )}
              onClick={toggleListening}
              title={isListening ? "Stop listening" : "Start listening"}
              type="button"
            >
              {isListening ? (
                <Square className="size-4" aria-hidden="true" />
              ) : (
                <Mic className="size-4" aria-hidden="true" />
              )}
            </button>
            <input
              className="min-w-0 flex-1 bg-transparent px-2 text-base text-text outline-none placeholder:text-text-tertiary"
              onChange={(event) => {
                setInput(event.target.value);
                if (!isListening && mode === "idle" && event.target.value) {
                  setMode("listening");
                }
                if (!event.target.value && !isListening) {
                  setMode("idle");
                }
              }}
              placeholder="Ask Sona anything"
              value={input}
            />
            <button
              aria-label="Send message"
              className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-bg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!input.trim()}
              title="Send message"
              type="submit"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
