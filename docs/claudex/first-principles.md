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

