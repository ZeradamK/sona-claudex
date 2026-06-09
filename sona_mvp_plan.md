# Sona MVP Build Plan (v2 — Household Assistant)

## Overview
Sona is a web-first **household & personal AI assistant** — built for people who work from home, families with kids, and anyone who wants a single place to manage their day by voice. Sona sets alarms, plays music, checks the weather, orders food, talks with the kids, and keeps a long persistent memory of everything that matters about its household.

**Long-term platform vision.** The web app is v1. v2 wraps the same backend in native macOS/Windows clients (Tauri). v3 ships **thin-client edge devices** (kitchen displays, smart speakers, ambient pucks) where compute lives in Sona's cloud and the device only does mic capture, audio playback, optional small UI render, and wake-word. **Every Sona client — browser, native wrapper, edge device — is just a LiveKit participant in the household's room.** No client-side reasoning, no client-side memory, no on-device disk requirements. Sona needs internet; it does not need built-in RAM/disk on the device.

This document is the source of truth for the v1 product. Codex/builders should treat the constraints in §A as non-negotiable.

---

## §A — Product Definition

### Who Sona is for (v1)
- **Work-from-home professionals** who need a hands-free helper while they work (timers, focus music, "remind me in 20", quick web answers, calendar/email triage).
- **Parents managing a household** who need a shared family brain (school pickups, allergies, birthdays, grocery list, "what's for dinner Thursday").
- **Kids 5–12** in a parent-supervised mode (stories, age-appropriate Q&A, light homework help, kid-safe voice).

Not for v1: enterprise teams, telephony bots, romantic companions, dedicated hardware.

### What Sona does (the v1 capability set)

**Daily life utilities** (must work)
1. **Alarms & timers** — "wake me at 6:30", "60-minute focus timer", "remind me to switch the laundry in 40 min".
2. **Weather** — current, hourly, daily; contextual ("should I bike to the store?").
3. **Calendar** — read, create, move, cancel events on Google Calendar.
4. **Email triage** — Gmail read, summarise, draft replies for human approval, send.
5. **Web answers** — Tavily/Exa search with citations, spoken back conversationally.
6. **Notes / lists** — quick capture, shopping list, todo, retrieve later by voice.

**Household & ambient**
7. **Music control** — Spotify (and later Apple Music / YT Music) via Connect API: "play lo-fi", "skip", "play X on the kitchen speaker".
8. **News briefing** — morning summary on demand, sources Sona has learned the user trusts.
9. **Recipes & dinner help** — "what can I make with chicken and rice", step-by-step hands-free reading while cooking.

**Personal concierge**
10. **Food ordering — DoorDash, end-to-end in MVP.** Confirmation-required flow driven by Gemini's computer-use / browser-control model. Sona reads back order details + price + ETA, the user confirms by voice, and Sona completes the checkout, captures a screenshot of the confirmation page, and writes the order to the household audit log.
11. **Light bookings** — restaurant reservations via OpenTable MCP (when public), otherwise web-agent fallback.

**Family & kids (gated)**
12. **Kid Mode** — explicit profile per kid; warmer voice (default Sulafat or Aoede); content filter on every output via Gemini Flash classifier; parental review log; per-day usage cap; no email/web/ordering tools available.
13. **Storytime** — generated bedtime stories with parent-defined characters and themes; resumable across nights.
14. **Family memory** — Sona remembers each household member separately: birthdays, allergies, school schedules, likes/dislikes, recurring routines.

### What Sona is NOT (v1)
- Not a smart-home hub (Phase 7).
- Not a phone app first (Phase 8 — PWA covers tablet/phone for v1).
- Not a music *generator*, only a controller of existing services.
- Not an unsupervised kids' chatbot. Kid Mode is parent-gated and audited.

---

## §B — Non-negotiable constraints

- **Web-first.** Next.js 15 app + PWA install for tablets. Mobile/desktop wrappers are post-MVP.
- **Thin-client architecture.** All reasoning, memory, voice synthesis, and tool execution run in Sona's cloud. Clients (browser today, native macOS/Windows tomorrow, edge devices later) are stateless — they capture audio, render UI, and play audio. The same backend serves all of them via the same LiveKit-room + REST/SSE protocol.
- **Wake word "Hey Sona"** — Picovoice Porcupine, on-device WASM in browser; on-device DSP/MCU in edge devices. Wake-word detection never leaves the device. PTT button is always available as alternative.
- **Cycling voice sessions** (see §D). No reliance on long-lived 15-min Gemini Live sockets. Each user turn = brief session opened, completed, closed; memory carries continuity.
- **Memory is the product**, not a feature. Visible, editable, exportable. Multi-profile.
- **Native audio for voice** (Gemini Live native-audio dialog model). No STT→LLM→TTS chaining for the primary path.
- **All-Gemini runtime stack — single vendor, no exceptions.** Voice = Gemini Live native audio (chosen for best-in-class TTS and the large catalog of expressive voices); reasoning = Gemini 2.5 Flash; classifier + memory extraction = Gemini Flash; embeddings = Gemini text-embedding. One vendor, one SDK, one billing line — required for $20/mo unit economics. Even Phase 6 web-agent tasks (DoorDash ordering) run on Gemini's **computer-use / browser-control** model. There is **no Anthropic/Claude dependency anywhere** in the stack.
- **Word-by-word streaming** for assistant text. No character or line streaming.
- **Dark theme**, Google Sans Text, max font weight 500, sphere is functional voice feedback.
- **Kids:** every Kid Mode output passes a content filter; every Kid Mode session is logged for the parent; COPPA-safe defaults (no third-party data sharing, parental verifiable consent for under-13).
- **Tool calls are confirmation-required** for any action that costs money, sends an email externally, deletes data, or affects another person. Sona always reads back ("I'll order Pad Thai for $24, confirm?") before executing.

---

## §C — Stack

- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion
- Three.js (@react-three/fiber, drei) — particle sphere
- Zustand
- **LiveKit Agents (TS)** — voice orchestration, WebRTC, barge-in, reconnection
- **Gemini Live API** (Gemini 2.5 / 3.1 Flash Live native-audio dialog) — primary voice path
- **Gemini 2.5 Flash** — text reasoning for chat, tool argument formation, content filter, post-turn memory extraction
- **Gemini computer-use / browser-control (Phase 6 only)** — sandboxed cloud-browser web-agent for food ordering / no-API flows
- **Postgres + Prisma + pgvector** — relational + episodic/semantic/procedural memory
- **Redis** — session resume tokens, alarm queue, rate limits
- **NextAuth** — Google + email magic link
- **Picovoice Porcupine** — wake-word "Hey Sona" (browser WASM)
- **MCP servers (official):** Google Workspace (Gmail/Calendar), Tavily or Exa (search), Spotify (custom thin wrapper, no official MCP yet)
- **Computer Use / Operator** — for food-ordering web flows where no API exists
- **Web Push + service worker + server-side cron** — for alarms/reminders that survive a closed tab

Env vars (extends `.env.example`): adds `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SPOTIFY_CLIENT_ID/SECRET`, `OPENWEATHER_KEY`, `TAVILY_KEY` (or `EXA_KEY`), `PORCUPINE_KEY`, `WEB_PUSH_VAPID_PUBLIC/PRIVATE`.

---

## §D — Architecture: the cycling-voice pattern

**Problem:** Gemini Live caps audio-only sessions at ~15 minutes. Long-lived sockets are also expensive and over-spec'd for "talk to my house" use cases.

**Pattern:** every user utterance is a *short* live session. Continuity comes from memory, not from the socket.

```
Wake word ("Hey Sona") OR PTT button
        │
        ▼
Open Gemini Live session  ──►  user speaks utterance
        │                              │
        │                              ▼
        │                      Gemini transcribes + decides:
        │                       - direct answer (smalltalk / Q&A)
        │                       - tool call (alarm/weather/music/calendar/email/note/order)
        │                              │
        ▼                              ▼
Memory layer is read-injected     Tool executes
into Gemini's system prompt        result returns to Gemini as tool_response
on session open                          │
                                         ▼
                              Gemini speaks response (native audio)
                                         │
                                         ▼
                          Session closes; post-turn worker:
                            • persists turn to Postgres
                            • Gemini Flash extracts facts (semantic memory)
                            • updates procedural memory if new preference
                            • embeds turn summary into pgvector
```

There is **no LLM-to-LLM routing**. Gemini Live answers from its own native model on most turns; tools handle anything that touches the world. This keeps the architecture flat, latency low, and per-turn cost near-zero on average.

**Why this works:**
- Session limits become irrelevant — sessions are seconds long.
- Cost drops dramatically (no idle minutes billed).
- Memory is the connective tissue, which doubles as the product wedge.
- Reconnection is just "next utterance" — invisible to the user.
- Multi-profile is trivial: voice-ID on the utterance picks the active profile, loads that profile's memory, then opens the session.

**Latency budget per turn:**
- Wake-word detection: <100 ms (Porcupine, on-device)
- Session open + audio uplink: 200–400 ms
- Gemini Live response start: 300–600 ms
- Escalated reasoning turn (Gemini 2.5 Pro, when needed): +700–1200 ms, hidden behind a Gemini-spoken filler ("let me check that…")

**Multi-speaker handling:** lightweight speaker diarization (LiveKit Agents has built-in track + Pyannote optional) → match voice embedding against household profiles → load that profile's memory. Unknown speaker → "guest" profile with no tool access.

---

## §E — Memory architecture

Three tiers, all in Postgres with pgvector.

```
Memory {
  id              uuid
  householdId     uuid          // shared by all profiles in a home
  profileId       uuid          // which family member this is about / from
  kind            enum          // episodic | semantic | procedural
  content         text
  metadata        jsonb         // typed: Fact{subject,predicate,object,confidence,source}
  embedding       vector(1536)
  importance      float
  createdAt       timestamptz
  updatedAt       timestamptz
}
```

- **Episodic** — every turn summarised, embedded; recalled by hybrid (BM25 + cosine + recency boost).
- **Semantic** — typed facts about people, places, preferences, routines. Extracted by Gemini Flash post-turn, deduped, stored as `Fact` rows. Edited via the Memory Timeline UI.
- **Procedural** — user preferences as JSON fragments injected into the system prompt ("address Sarah by 'Mom'", "default music = lo-fi", "wake-up time = 6:30 weekdays"). User-editable.

**The Memory Timeline page** (`/memory`) is part of the MVP, not post-MVP. It is the visible, editable, searchable, exportable record of what Sona knows about the household. Per-profile and household-shared views. This is Sona's product wedge against ChatGPT/Claude/Gemini.

---

## §F — Profiles & multi-user

- **Household** = top-level account.
- **Profiles** within a household: Adult (full tool access), Adult (configurable), Kid (gated).
- Each profile has its own voice fingerprint (optional, opt-in), system prompt, Sona voice (from the 30 Gemini voices), memory namespace, tool permissions.
- Default Kid Mode tool set: alarms, weather, music (parent-curated playlists only), storytime, simple Q&A. No email, no web, no orders, no calendar mutations.

---

## §G — Phased build plan

Each phase is shippable in isolation. The MVP launches at the end of Phase 6.

### Phase 0 — Foundation reset (1 week)
- Audit current repo: confirm Phase 1 from v1 plan is complete (auth, DB, pgvector). It currently is not — `[...nextauth]` is empty, pgvector not enabled, no API routes.
- Add pgvector to Prisma via raw migration, replace `Memory.embedding Float[]` with `vector(1536)`.
- Wire NextAuth (Google + email magic link).
- Add LiveKit Cloud project + `/api/voice/token` route.
- Add Redis (Upstash for v1).
- **Done when:** auth works, DB has pgvector, LiveKit token endpoint returns valid token, repo deploys to Vercel.

### Phase 1 — Text chat with Gemini (1 week)
- `/api/chat` SSE streaming with Gemini 2.5 Flash.
- Word-by-word rendering in the existing SonaCore UI.
- Persist `Message` rows to Postgres.
- Sphere reflects state machine driven by real chat events (idle/thinking/speaking).
- **Done when:** real Gemini conversation persists across reloads. Stop using local React state.

### Phase 2 — Voice loop (cycling pattern) (2 weeks)
- LiveKit Agents (TS) worker.
- Wake-word detection (Porcupine WASM) + PTT fallback button.
- Cycling-session orchestration: open Gemini Live → tool router → close → persist.
- "Thinking filler" mechanism for escalated / tool-routed turns.
- Sphere driven by real Gemini audio amplitude.
- **Done when:** "Hey Sona, what's the time" works end-to-end on the deployed PWA.

### Phase 3 — Memory & profiles (2 weeks)
- Three-tier memory (`episodic` / `semantic` / `procedural`).
- Post-turn worker: Gemini Flash extracts facts, embeds, deduplicates.
- Memory Timeline UI at `/memory` — list, edit, soft-delete, search, export JSON.
- Household + profile model. Sign-up creates a household; invite flow adds profiles.
- Voice fingerprinting (optional opt-in) for profile auto-switching.
- **Done when:** Sona accurately answers "what do you remember about my morning routine" after a week of use, and the user can edit any fact in the timeline.

### Phase 4 — Daily-life tools (2 weeks)
- **Alarms & timers:** Postgres-backed schedule + Redis queue + server cron + Web Push to wake the PWA + audible chime fallback.
- **Weather:** OpenWeather (or Pirate Weather) tool, location from profile or last asked.
- **Calendar:** Google Workspace MCP (read/create/move/cancel).
- **Email triage:** Gmail MCP (read, summarise, draft, send-with-confirm).
- **Web answers:** Tavily MCP (or Exa).
- **Notes/lists:** Postgres-backed; voice add, voice retrieve, web view.
- **Done when:** all six tools work via voice with confirmation steps for any send/delete.

### Phase 5 — Household & ambient (1.5 weeks)
- **Spotify Connect:** OAuth, play/pause/skip/playlist, target-device picker.
- **News briefing:** morning routine that reads top headlines from user's preferred sources, learned over time.
- **Recipes:** Tavily-backed recipe search + hands-free step-by-step reading mode.
- **Done when:** "play focus music in the kitchen" works, and "walk me through this recipe" stays paused/resumable.

### Phase 6 — Concierge & Kid Mode (2 weeks)
- **Food ordering — DoorDash via Gemini computer-use / browser-control.** Sona drives the DoorDash web flow on the user's behalf in a sandboxed cloud browser. Confirmation-required: Sona reads back items + price + ETA, the user confirms by voice, then Sona completes checkout. Screenshot of the confirmation page is stored. Order written to the household audit log. Failure paths surface a clear voice error and never charge silently.
- **Kid Mode:** profile flag, content filter on every output, parental review queue at `/family/log`, daily usage cap, restricted tool set, default warmer voice (Sulafat / Aoede).
- **Storytime:** generated stories with parent-saved characters, resumable across sessions.
- **Done when:** a parent can hand a tablet with Sona to a 7-year-old and trust it for 20 minutes; the parent can review every interaction afterwards; a parent can voice-order DoorDash from Sona without touching a screen.

### Phase 7 — Polish & launch (1.5 weeks)
- Performance tuning (cold-start sphere, reconnect resilience, mobile-tablet PWA polish).
- Error handling + voice fallbacks ("I missed that, can you say again?").
- Pricing + Stripe + waitlist gate.
- Landing page, demo video, docs.
- **Done when:** product is at /sona.app with a working signup-to-first-alarm flow under 3 minutes.

### Phase 8+ — Post-MVP

**v2 — native desktop (Tauri).** macOS + Windows wrappers around the same web app, adding global hotkey, system tray, OS-level notifications, OS-level alarms, and "always-on" background mic with a system menu-bar indicator. Same backend, no protocol changes.

**v3 — edge devices (thin clients, cloud compute).** Small ARM-based devices (Raspberry Pi class, or custom) with mic array + speaker + optional small display. Firmware = wake-word (Porcupine on MCU) + LiveKit client + minimal sphere render. All reasoning/memory/voice in Sona cloud. Households claim devices into rooms ("Kitchen Sona", "Office Sona"). Multi-device presence-aware: only the closest device responds.

Other post-MVP:
- iOS / Android native (Capacitor or Expo) for OS-level alarms + background mic.
- Smart-home (Home Assistant MCP, HomeKit bridge, SmartThings).
- Apple Music + YT Music control parity.
- Voice persona library expansion + voice cloning (opt-in).
- Multi-room presence-aware audio handoff.

---

## §H — Pricing (provisional, to revisit)

Locked all-Gemini stack target: **~$0.04–0.05 per active voice-minute**, dominated by Gemini Live native-audio output. Reasoning, classification, memory extraction, and embeddings together add <$0.005/min. This is the cost basis the pricing must clear.

| Tier | $/mo | Voice min/day (household) | Profiles | Reasoning | Concierge (DoorDash + web agent) |
|---|---|---|---|---|---|
| **Free** | $0 | 15 | 1 | Gemini Flash | — |
| **Family** | **$20** | 60 (combined) | up to 5 (incl. Kid Mode) | Gemini Flash | — |
| **Family Plus** | **$40** | 180 (combined) | up to 5 | Gemini Flash + Pro escalation | ✅ |
| **BYOK** | $5 | unlimited (your key) | up to 5 | your Gemini key | ✅ |

Cost-control rules baked into the runtime:
1. **Soft daily voice cap per household.** After cap, voice mode locked; text-mode chat continues (~free).
2. **Hard monthly cap with grace.** Soft warning at 80%, hard stop at 100% — overages prompt upgrade or wait for daily refresh.
3. **Memory-driven context, not history replay.** Each turn passes top-K relevant memories + last 3 turns, never full history. Cuts input tokens ~80%.
4. **Computer Use is gated to Family Plus.** DoorDash via Gemini computer-use is the most expensive single tool call (~$0.20–0.50 per order); restricting it to the higher tier protects Family $20 unit economics.
5. **No always-on streaming.** Cycling pattern means Sona is only billed during active utterances, not idle in the background.

---

## §I — Risks & open questions

1. **Background alarms reliability.** Browser PWAs can't fire OS alarms reliably when closed. v1 mitigation: server-side cron + Web Push + audible chime. Real fix: native wrapper Phase 8.
2. **Always-listening privacy.** Wake-word is on-device (Porcupine, never leaves browser). Be explicit about this in onboarding. Provide PTT-only mode as alternative.
3. **Kid Mode liability.** COPPA + content filter false negatives. Mitigations: every output filtered, every session logged, parental review queue, conservative default refusals, no third-party data sharing. Get a lawyer before launching Kid Mode publicly.
4. **Food ordering via Computer Use.** Brittle, slow (~30–60 s end to end), can break when DoorDash redesigns. v1 ships Domino's direct API as the *reliable* path; DoorDash is the *demo* path with prominent confirmation.
5. **Voice diarization accuracy.** Misidentifying which family member is talking corrupts memory. Mitigation: confidence threshold; fall back to "who's this?" when unsure.
6. **Multi-device same-household.** Two browsers logged into one household both wake on "Hey Sona". v1 mitigation: device claim/answer protocol via LiveKit room presence.
7. **Spotify Connect requires a Premium account.** Acceptable v1 constraint; document it.
8. **Cycling pattern audio quality.** Each new session has a small TTS warm-up cost. Test extensively; pre-warm a "silent connection" 200 ms before the user finishes the wake word.

---

## §J — Final success criteria for v1

- A WFH professional uses Sona daily for 2+ weeks for timers, focus music, calendar, and email triage without falling back to ChatGPT.
- A family configures one household + 4 profiles (2 adults, 2 kids), and Sona correctly identifies who is speaking and personalises responses.
- "Hey Sona, set an alarm for 6:30, play lo-fi while I work, and remind me to switch the laundry in 40 minutes" works in a single utterance and all three actions persist correctly.
- A parent enables Kid Mode for one profile and reviews the day's interactions in the parental log.
- The Memory Timeline shows ≥30 accurate facts after a week of normal use, all editable.
- Order-from-Domino's works end-to-end via voice with audible confirmation read-back.
- Time from wake-word to first audible response is <1 second on broadband.

---

---

## §K — Apple-syncability & acquisition horizons (added 2026-06-09)

Strategic north star: Sona is a **comprehensive assistant in the "physical AI" space**, built to be **acquired by Apple** (or another major brand), and therefore **highly Apple-syncable**. Runtime stays **strictly Gemini-only** (best TTS + voice catalog); the *provider* is abstracted (`lib/llm/provider.ts`) so the model is a one-line swap — turning "all-Gemini" from a lock-in liability into a feature. The wedge is unchanged: user-owned, exportable memory.

**Honest tension:** Sona is cloud-Gemini; Apple is on-device/privacy/own-models. The answer is not to drop Gemini but to (1) abstract the provider, (2) make data user-owned/exportable/deletable, and (3) integrate Apple's *surfaces* — positioning Sona as "the household-memory layer Siri lacks," not "a better Siri."

### Horizon 1 — Web-now (in progress)
- **Sign in with Apple** — `AppleProvider` co-equal with Google, dynamic ES256 client secret (`lib/auth/apple-secret.ts`), auto-link by verified email. ✅ landed
- **LLM provider abstraction** — `lib/llm/provider.ts` (`GeminiProvider` + `AppleIntelligenceProvider` stub); chat + voice route through it. ✅ landed
- **Privacy / data-ownership** — `/api/data/export`, `/api/account/delete`, `AuditLog`, retention fields. ✅ landed
- **Memory Timeline** — `/app/memory` (list/search/edit/soft-delete/export). ✅ landed (pending memory-RAG to populate it)
- **Integration data model** — `ExternalProvider` / `SyncEntity` / `Contact` + `externalIds` on Alarm/Note. ✅ landed
- **iCloud sync** — CalDAV (Calendar + Reminders/VTODO) then CardDAV (Contacts), provider-agnostic (`lib/integrations/`). 🚧 scaffolded; needs live-iCloud testing. Apple Music/MusicKit deferred (native token).
- **Done when:** an Apple user signs in with Apple, their iCloud calendar/reminders round-trip through Sona, and they can export/delete everything from `/app/memory`.

### Horizon 2 — Native companion (Tauri macOS → iOS)
**App Intents / Siri / Shortcuts (mandatory for an Apple acquisition)**, EventKit, HealthKit, HomeKit controller, MusicKit Music User Token, Handoff/Continuity/CloudKit. Design in `docs/apple-native-rfc.md` (RFC published now so the path is credible pre-pitch).

### Horizon 3 — Physical / edge
Matter-controller ambient device, HomePod/Thread alignment, HomeKit bridge (HAP daemon). `Device.kind` already reserves `edge-display`/`edge-speaker`.

### Two compliance landmines (before any public launch / pitch)
1. **Kid Mode / COPPA** — current prompt-level Kid Mode is insufficient; needs verifiable parental consent + legal review.
2. **Voice-fingerprint accuracy** — `Profile.voiceFingerprint` is schema-only; misidentification corrupts memory. Apple diligence expects ~95%+; test and publish metrics before claiming multi-profile voice ID.

---

End of v2 plan. Iterate from here.
