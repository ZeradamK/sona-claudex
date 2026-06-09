"use client";

import { useCallback, useEffect, useState } from "react";

type Memory = {
  id: string;
  kind: string;
  content: string;
  importance: number;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
};

const KIND_LABELS: Record<string, string> = {
  semantic: "Facts",
  episodic: "Moments",
  procedural: "Preferences"
};

export default function MemoryTimelinePage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [persisted, setPersisted] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setMemories(data.memories ?? []);
      setPersisted(data.persisted ?? true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 200);
    return () => clearTimeout(t);
  }, [query, load]);

  const remove = async (id: string) => {
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    setMemories((m) => m.filter((x) => x.id !== id));
  };

  const edit = async (mem: Memory) => {
    const next = window.prompt("Edit fact", mem.content);
    if (next == null || next.trim() === mem.content) return;
    const res = await fetch("/api/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: mem.id, content: next.trim() })
    });
    const data = await res.json();
    if (data.memory) {
      setMemories((m) => m.map((x) => (x.id === mem.id ? data.memory : x)));
    }
  };

  const grouped = memories.reduce<Record<string, Memory[]>>((acc, m) => {
    (acc[m.kind] ??= []).push(m);
    return acc;
  }, {});

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-bg px-6 py-12 text-text">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">What Sona remembers</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Your household memory — visible, editable, and yours to export or delete.
          </p>
        </div>
        <a
          href="/api/data/export"
          className="shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-2"
        >
          Export all
        </a>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search memories…"
        className="mb-8 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-text-tertiary"
      />

      {!persisted && (
        <p className="mb-6 rounded-md border border-border bg-surface/60 px-4 py-3 text-sm text-text-tertiary">
          Running without a database — memories aren’t being persisted yet.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : memories.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          Nothing yet. As you talk to Sona, the facts it learns about your household
          will appear here — every one editable and deletable.
        </p>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([kind, items]) => (
            <section key={kind}>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                {KIND_LABELS[kind] ?? kind}
              </h2>
              <ul className="space-y-2">
                {items.map((m) => (
                  <li
                    key={m.id}
                    className="group flex items-start justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3"
                  >
                    <span className="text-sm">{m.content}</span>
                    <span className="flex shrink-0 gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => edit(m)}
                        className="text-xs text-text-tertiary hover:text-text"
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(m.id)}
                        className="text-xs text-text-tertiary hover:text-text"
                        type="button"
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
