export type ChatEvent =
  | { type: "start"; conversationId: string; persisted?: boolean }
  | { type: "delta"; text: string }
  | { type: "done"; stopReason?: string | null }
  | { type: "error"; message: string };

export type StreamChatArgs = {
  conversationId?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal?: AbortSignal;
  onEvent: (event: ChatEvent) => void;
};

export async function streamChat({
  conversationId,
  messages,
  signal,
  onEvent
}: StreamChatArgs) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, messages }),
    signal
  });

  if (!response.ok || !response.body) {
    let errorCode = `chat_http_${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json?.error) errorCode = json.error;
    } catch {
      // body wasn't JSON; keep status code as the error
    }
    onEvent({ type: "error", message: errorCode });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = rawEvent
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (dataLine) {
        const payload = dataLine.slice(6);
        try {
          onEvent(JSON.parse(payload) as ChatEvent);
        } catch {
          // ignore malformed event
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}
