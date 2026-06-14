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

