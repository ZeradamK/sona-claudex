import { NextResponse } from "next/server";

import { requireSonaUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getLLMProvider } from "@/lib/llm/provider";
import { ensureHouseholdForUser } from "@/lib/sona/household";
import { buildPersona } from "@/lib/sona/persona";
import { buildMemoryContext } from "@/lib/sona/memory/retrieve";
import { rememberTurn } from "@/lib/sona/memory/remember";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatBody = {
  conversationId?: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

const HISTORY_LIMIT = 24;
const MAX_OUTPUT_TOKENS = 1024;

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "gemini_api_key_missing" },
      { status: 503 }
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user" || !last.content?.trim()) {
    return NextResponse.json({ error: "last_message_must_be_user" }, { status: 400 });
  }

  // Auth + persistence are optional in dev mode. If we have a session AND
  // the database is reachable we persist; otherwise the turn is ephemeral.
  const auth = await requireSonaUser();
  let persistContext: Awaited<ReturnType<typeof ensureHouseholdForUser>> | null = null;
  if (auth) {
    try {
      persistContext = await ensureHouseholdForUser(auth.userId);
    } catch {
      persistContext = null;
    }
  }

  const conversationId = body.conversationId ?? crypto.randomUUID();

  if (persistContext) {
    try {
      await prisma.message.create({
        data: {
          householdId: persistContext.household.id,
          profileId: persistContext.profile.id,
          conversationId,
          role: "user",
          content: last.content
        }
      });
    } catch {
      persistContext = null;
    }
  }

  const history = body.messages
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }));

  let systemInstruction = buildPersona(persistContext?.profile ?? null);
  // Inject the household's most relevant memories (top-K vector search) so Sona
  // answers with context — the memory wedge. Only when we have a DB-backed
  // household; degrades silently otherwise.
  if (persistContext) {
    const memoryContext = await buildMemoryContext(
      persistContext.household.id,
      last.content
    ).catch(() => "");
    if (memoryContext) systemInstruction += `\n\n${memoryContext}`;
  }
  const provider = getLLMProvider();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "start", conversationId, persisted: Boolean(persistContext) });

      let assistantText = "";
      let stopReason: string | null = null;

      try {
        const result = provider.streamText({
          history,
          systemInstruction,
          maxOutputTokens: MAX_OUTPUT_TOKENS
        });

        for await (const chunk of result) {
          if (chunk.text) {
            assistantText += chunk.text;
            send({ type: "delta", text: chunk.text });
          }
          if (chunk.finishReason) stopReason = chunk.finishReason;
        }

        if (persistContext && assistantText.trim().length > 0) {
          try {
            await prisma.message.create({
              data: {
                householdId: persistContext.household.id,
                profileId: persistContext.profile.id,
                conversationId,
                role: "assistant",
                content: assistantText,
                metadata: {
                  provider: provider.id,
                  stopReason
                }
              }
            });
          } catch {
            // ignore persistence failure; the turn was still streamed
          }

          // Post-turn memory: extract durable facts → embed → store. Fire and
          // forget so it never blocks the response; this is what populates the
          // Memory Timeline and feeds future retrieval.
          void rememberTurn({
            householdId: persistContext.household.id,
            profileId: persistContext.profile.id,
            userText: last.content,
            assistantText
          }).catch(() => {});
        }

        send({ type: "done", stopReason });
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream_failed";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
