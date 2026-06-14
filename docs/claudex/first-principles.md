# Claudex — First Principles (v0.1)

Status: **foundational / canonical.** This is the motto + first principles for **Claudex** (a.k.a. sona-Claudex), the enterprise software line of the Sona portfolio. Everything Claudex builds sits on top of this. Forged + adversarially sharpened 2026-06-12.

> Sibling product: **Sona One** (`docs/hardware/sona-one-product-design.md`) is consumer conversational-AI hardware. **Claudex is enterprise software** — a different buyer, a different motion.

---

## Motto

> **Run your agent fleet on a context budget, not a blank check.**

Alternates:
- *The cross-vendor control plane for agent fleets: deterministic routing, enforced budgets, shared memory.*
- *Your agents are a fleet. Stop running them like strangers.*
- *Context is a contract. Routing is a rule. Spend is a limit.*

---

## What Claudex is

Claudex is the **operational control plane for fleets of deployed AI agents** — the layer between an enterprise's heterogeneous agents (in-house, third-party, LangGraph/CrewAI-built) and the model APIs they call. It assembles context to a declared **token budget** via deterministic retrieval, **routes** each task by capability and cost through versioned rules, **deduplicates** work across the fleet through shared memory, **gates** money/identity/third-party side effects, and **enforces governance at routing time** so a violation fails *before* the prompt is built — not after.

Claudex does **not** build agents, write prompts, fine-tune, or compete on inference price. It makes the agents you already run cheaper, safer, and structurally coordinated. It stays a **thin cross-vendor seam** so a model price or capability shift is a config change, not a rewrite — which is also its defensible wedge, since single-vendor orchestrators structurally cannot route across competitors.

**Positioning stance (decided 2026-06-12): _Claude-first, not Claude-only._** Defaults, reference integrations, and the out-of-the-box experience lean Claude/Anthropic; the provider seam (P6) stays genuinely open to Gemini / OpenAI / self-hosted. "Claude-first" is a posture about *defaults*, never about hard-coding — core routing and agent code remain vendor-neutral.

---

## The first principles

Each is written so a team can point at a design decision and say *"that violates principle N."* The **teeth** are the test.

### P1 — Context is a contract
Every agent declares a per-turn **token budget**; Claudex assembles context to fit it via deterministic retrieval (hybrid vector + recency + importance). Context is granted against a stated need, never replayed wholesale.
**Teeth:** forbids append-only chat-history replay as the context source; rejects deploying an agent that hasn't declared a turn budget; forbids a context window where >50% of tokens come from turns older than *K*.

### P2 — Routing is a rule, not a vibe
Routing is a composition of explicit, **versioned rules** over capability, cost ceiling, context-fit, and load. Model-driven choice is a last-resort, heavily-observed fallback, and recurring high-confidence model decisions get **promoted into deterministic rules** over time. Agents are addressed by capability + cost profile, never by name.
**Teeth:** forbids routing that defaults to "ask an LLM which agent should handle this"; hard-coded agent names in routing rules are a bug; requires >90% of routing decisions to be deterministic and tagged as such, with the cost/latency delta between deterministic and model paths tracked.

### P3 — Budgets stop, they don't warn
Per-agent turn/day/month budgets are **hard limits** with a declared fallback ladder (downshift to a cheaper model, escalate to a human, or refuse). Soft caps warn; hard caps **halt execution before the offending call fires.**
**Teeth:** must block a tool/LLM call that would breach the turn budget *before* it fires, not bill it and flag it after; refuses to deploy an agent with no budget; a dashboard that estimates savings but can't gate execution violates this.

### P4 — Pay for work once
Identical calls on identical inputs within a task window return cached results; overlapping context is unified in a **shared fact store** keyed by `<task-id, query-hash>`; post-task summaries are shared so sibling agents don't re-derive known facts.
**Teeth:** forbids running the same LLM call twice on the same inputs inside a task window; requires surfacing "Agent A and Agent B both queried doc X" as a flagged, billable-waste event.

### P5 — Hand off a memo, not a transcript
Agents hand off via **structured artifacts** (decision, constraints, working memory, next steps, remaining budget) plus top-K shared memories. Context is **portable**: no agent-specific internal state lives in shared memory, so any agent can resume another's queue.
**Teeth:** passing the next agent a transcript (or transcript + summary) is a bug; agent-to-agent "summarize what just happened" LLM calls are forbidden; memory labeled with one agent's private internal state is forbidden; hand-off + portable-context schemas must be declared upfront.

### P6 — The provider is a seam
All model access goes through **one provider interface** (stream / complete / embed / token-count / cost). No vendor SDK calls, no provider-specific tool-call formats, and no model names outside that seam. Adding a provider means implementing the interface and nothing else.
**Teeth:** a grep for direct vendor SDK calls outside the provider module must return zero; an agent prompt or routing rule that hard-references "Claude"/"GPT"/"Gemini" violates this; a new provider that requires touching core routing or agent code violates this.

### P7 — Policy gates the route, it doesn't narrate it
Policy (data boundaries, model approvals, RBAC, secret injection, high-cost approval gates) constrains the route **before** the prompt is assembled. A blocked decision fails loudly with an audit event; it never silently proceeds.
**Teeth:** must reject an agent for a payload that breaches a data policy before prompt assembly; advisory-only policies violate this; secret injection handled outside the orchestrator violates this; a blocked route that proceeds anyway and is merely logged violates this.

### P8 — Confirm anything that touches money, identity, or others
Any tool call that moves money, asserts identity, or contacts a third party requires **explicit approval** (human or policy-gated) with a read-back before execution and a rollback on no/timeout. The agent does not get to decide whether to ask.
**Teeth:** "I'll ask only if my confidence is below X" violates this — the agent must not self-grant; a money/message/third-party call with no confirmation gate is a bug; a side effect that can't be rolled back on timeout must not be auto-issued.

### P9 — Claudex wraps the fleet; it is not the fleet
Claudex owns the **fleet layer only** — routing, budgets, shared memory, governance, and the cost/outcome observability that falls out of enforcing them. It ships no agents, optimizes no prompts, fine-tunes nothing, and never competes on inference price. **Observability is the exhaust of enforcement, not a separate product.**
**Teeth:** shipping a pre-built agent violates this; taking a position on prompt design or fine-tuning violates this; assuming all agents share one model violates this; an agent that can't emit structured cost/outcome metadata down to the individual call cannot deploy, and a deployment that can't answer "if this agent gets 10% more traffic, what's the cost delta?" in seconds is blocked.

---

## North-star metric

**Cost per successful task outcome across the fleet** — total token + tool spend ÷ tasks completed to a *verified-success* bar, tracked over time and attributable down to the individual agent and call. It captures every principle at once: it falls when context is budgeted (P1/P3), routing is deterministic and cheap (P2), work is deduplicated (P4), hand-offs are lean (P5), and governance prevents costly blocked/failed work (P7/P8) — and it's meaningless unless enforcement makes it attributable (P9).

