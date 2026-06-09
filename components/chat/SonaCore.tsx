"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ear, EarOff, Mic, Send, Square } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { SphereScene } from "@/components/sphere/SphereScene";
import type { SphereMode } from "@/components/sphere/ParticleSphere";
import { streamChat } from "@/lib/sona/chatClient";
import { useVoice, type VoiceMode } from "@/lib/sona/voice/useVoice";
import { useWakeWord } from "@/lib/sona/voice/useWakeWord";
import { createWordEmitter } from "@/lib/sona/wordStream";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const VOICE_TO_SPHERE: Record<VoiceMode, SphereMode> = {
  idle: "idle",
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking"
};

const VOICE_TO_LABEL: Record<VoiceMode, string> = {
  idle: "Idle",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking"
};

export function SonaCore() {
  const voice = useVoice();
  const voiceActive = voice.mode !== "idle";

  const [wakeEnabled, setWakeEnabled] = useState(false);
  const wakeInFlightRef = useRef(false);

  const handleWake = useCallback(() => {
    if (wakeInFlightRef.current) return;
    wakeInFlightRef.current = true;
    setTimeout(() => {
      wakeInFlightRef.current = false;
    }, 1500);
    void voice.start();
  }, [voice]);

  const wake = useWakeWord({
    enabled: wakeEnabled,
    paused: voiceActive,
    onWake: handleWake
  });

  const [textMode, setTextMode] = useState<SphereMode>("idle");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hasConversation =
    messages.length > 0 ||
    voice.transcript.user.length > 0 ||
    voice.transcript.assistant.length > 0;

  const sphereMode: SphereMode = voiceActive
    ? VOICE_TO_SPHERE[voice.mode]
    : textMode;
  const sphereLevel = voiceActive ? voice.audioLevel : 0;

  const status = useMemo(() => {
    if (voice.error) return "Voice error";
    if (errorBanner) return "Offline";
    if (voiceActive) return VOICE_TO_LABEL[voice.mode];
    if (isStreaming) return "Thinking";
    if (wakeEnabled && wake.listening) return "Awaiting Hey Sona";
    return hasConversation ? "Ready" : "Idle";
  }, [
    voice.error,
    voice.mode,
    voiceActive,
    errorBanner,
    isStreaming,
    wakeEnabled,
    wake.listening,
    hasConversation
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const appendAssistantWord = useCallback(
    (assistantId: string, word: string) => {
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + word } : m
        )
      );
    },
    []
  );

  async function sendMessage(content: string) {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content
    };
    const assistantId = crypto.randomUUID();
    const assistantStub: Message = {
      id: assistantId,
      role: "assistant",
      content: ""
    };

    const nextHistory = [...messages, userMessage];
    setMessages([...nextHistory, assistantStub]);
    setTextMode("thinking");
    setIsStreaming(true);
    setErrorBanner(null);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const wordEmitter = createWordEmitter((word) =>
      appendAssistantWord(assistantId, word)
    );

    let firstWordSeen = false;

    try {
      await streamChat({
        conversationId,
        messages: nextHistory.map(({ role, content: c }) => ({ role, content: c })),
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "start") {
            setConversationId(event.conversationId);
            return;
          }
          if (event.type === "delta") {
            if (!firstWordSeen) {
              firstWordSeen = true;
              setTextMode("speaking");
            }
            wordEmitter.push(event.text);
            return;
          }
          if (event.type === "done") {
            wordEmitter.end();
            return;
          }
          if (event.type === "error") {
            wordEmitter.end();
            if (event.message === "gemini_api_key_missing") {
              setErrorBanner(
                "Add GEMINI_API_KEY to .env.local and restart the dev server."
              );
            } else {
              setErrorBanner("Sona had trouble responding. Try again.");
            }
          }
        }
      });
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setErrorBanner("Sona had trouble responding. Try again.");
      }
    } finally {
      wordEmitter.end();
      setIsStreaming(false);
      setTextMode("idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (voiceActive) return;
    const content = input.trim();
    if (!content || isStreaming) return;
    setInput("");
    void sendMessage(content);
  }

  function toggleWake() {
    setWakeEnabled((current) => !current);
  }

  const voiceErrorBanner = voice.error
    ? voice.error === "gemini_api_key_missing"
      ? "Add GEMINI_API_KEY to .env.local and restart the dev server."
      : voice.error.includes("getUserMedia") ||
          voice.error.includes("Permission") ||
          voice.error.includes("not-allowed")
        ? "Mic permission needed. Allow it in your browser, then try again."
        : `Voice failed: ${voice.error}`
    : null;
  const wakeErrorBanner = wakeEnabled && wake.error ? wake.error : null;
  const banner = errorBanner ?? voiceErrorBanner ?? wakeErrorBanner;

  const micButtonTitle =
    voice.mode === "idle"
      ? "Click to talk to Sona"
      : "End conversation";

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-text">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(6,182,212,0.11),transparent_26rem),radial-gradient(circle_at_50%_72%,rgba(107,33,168,0.12),transparent_30rem)]" />

      <header className="relative z-20 flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="text-sm font-medium text-text">Sona</div>
        <div className="flex items-center gap-2">
          <button
            aria-label={
              wakeEnabled ? "Disable Hey Sona wake word" : "Enable Hey Sona wake word"
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary backdrop-blur transition-colors hover:bg-surface-2",
              wakeEnabled && wake.listening && "border-cyan-300/35 text-cyan-200",
              !wake.supported && "cursor-not-allowed opacity-50"
            )}
            disabled={!wake.supported}
            onClick={toggleWake}
            title={
              !wake.supported
                ? "Wake word needs Chrome or Edge"
                : wakeEnabled
                  ? "Disable Hey Sona"
                  : "Listen for Hey Sona"
            }
            type="button"
          >
            {wakeEnabled && wake.listening ? (
              <Ear className="size-3.5" aria-hidden="true" />
            ) : (
              <EarOff className="size-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {wakeEnabled && wake.listening ? "Hey Sona" : "Wake off"}
            </span>
          </button>
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-text-secondary backdrop-blur">
            <span
              className={cn(
                "size-2 rounded-full transition-colors",
                sphereMode === "listening" && "bg-cyan-300",
                sphereMode === "thinking" && "bg-accent-warm",
                sphereMode === "speaking" && "bg-accent",
                sphereMode === "idle" && "bg-text-tertiary",
                banner && "bg-red-400"
              )}
            />
            {status}
          </div>
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
        <SphereScene
          active={hasConversation}
          audioLevel={sphereLevel}
          mode={sphereMode}
        />
      </motion.div>

      <section className="relative z-20 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-5 pb-5 sm:px-8">
        <div
          className={cn(
            "flex flex-1 flex-col transition-[padding] duration-500",
            hasConversation ? "pt-[18rem]" : "justify-end pt-[58vh]"
          )}
        >
          {banner && (
            <div className="mx-auto mb-3 max-w-2xl rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {banner}
            </div>
          )}

          {voiceActive && (voice.transcript.user || voice.transcript.assistant) && (
            <div className="mx-auto mb-4 flex w-full max-w-2xl flex-col gap-2">
              {voice.transcript.user && (
                <div className="ml-auto max-w-[min(680px,88vw)] rounded-md border border-border bg-surface/75 px-4 py-3 text-sm leading-6 text-text shadow-[0_18px_80px_rgba(0,0,0,0.18)] backdrop-blur">
                  {voice.transcript.user}
                </div>
              )}
              {voice.transcript.assistant && (
                <div className="mr-auto max-w-[min(680px,88vw)] rounded-md border border-border bg-surface-2/70 px-4 py-3 text-sm leading-6 text-text shadow-[0_18px_80px_rgba(0,0,0,0.18)] backdrop-blur">
                  {voice.transcript.assistant}
                </div>
              )}
            </div>
          )}

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
                    className={cn(
                      "max-w-[min(680px,88vw)] rounded-md border border-border px-4 py-3 text-sm leading-6 shadow-[0_18px_80px_rgba(0,0,0,0.18)] backdrop-blur",
                      message.role === "user"
                        ? "ml-auto bg-surface/75 text-text"
                        : "mr-auto bg-surface-2/70 text-text"
                    )}
                    initial={{ opacity: 0, y: 10 }}
                    key={message.id}
                    layout
                  >
                    {message.content || (
                      <span className="text-text-tertiary">…</span>
                    )}
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
              aria-label={micButtonTitle}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-2 hover:text-text",
                voice.mode === "listening" &&
                  "border-cyan-300/35 bg-cyan-300/10 text-cyan-200",
                (voice.mode === "thinking" || voice.mode === "connecting") &&
                  "border-accent-warm/35 bg-accent-warm/10 text-accent-warm",
                voice.mode === "speaking" &&
                  "border-accent/35 bg-accent/10 text-accent"
              )}
              onClick={() => {
                void voice.toggle();
              }}
              title={micButtonTitle}
              type="button"
            >
              {voice.mode === "idle" ? (
                <Mic className="size-4" aria-hidden="true" />
              ) : (
                <Square className="size-4" aria-hidden="true" />
              )}
            </button>
            <input
              className="min-w-0 flex-1 bg-transparent px-2 text-base text-text outline-none placeholder:text-text-tertiary"
              disabled={isStreaming || voiceActive}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                voiceActive
                  ? "Talk freely — Sona is listening"
                  : isStreaming
                    ? "Sona is responding…"
                    : wakeEnabled && wake.listening
                      ? 'Say "Hey Sona" or type'
                      : "Ask Sona anything"
              }
              value={input}
            />
            <button
              aria-label="Send message"
              className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-bg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!input.trim() || isStreaming || voiceActive}
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
