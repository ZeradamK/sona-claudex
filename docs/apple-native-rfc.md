# RFC: Sona Apple-Native Surface (App Intents · Siri · HomeKit)

Status: **Draft / design-stage** — no native code yet. This RFC exists so the
native path is *credible and proven on paper* before we build it, which is what
an Apple-acquisition conversation requires. See `project_apple_acquisition_pivot`
in memory and §K of `sona_mvp_plan.md`.

## Why this RFC now (and not the code)

Several of the integrations that matter most to Apple are **flatly impossible
from a Node/Next.js backend** — App Intents, SiriKit, EventKit writes, HealthKit
and HomeKit are device frameworks with no cloud API. They require a native
macOS/iOS companion. We are *not* building that yet (Horizon 2). But the
single most important "Apple-acquirable" signal for a household assistant is
**"it talks to Siri."** Apple will not seriously consider an assistant that
can't. Publishing this design now de-risks the pitch: we can show exactly how
Sona becomes a first-class Siri/Shortcuts/Home citizen the moment the companion
ships, without having spent the engineering up front.

## Architecture: thin native companion over the existing backend

The companion is a **thin client**, consistent with Sona's thin-client thesis.
It holds no reasoning and no memory; it authenticates (Sign in with Apple, already
wired on web) and calls the **same** backend the browser uses:

```
SwiftUI / Tauri companion (macOS first, then iOS)
  ├── Sign in with Apple  → existing NextAuth backend (Account model ready)
  ├── App Intents (Swift) → thin wrappers over Sona REST endpoints
  ├── Voice               → reuses /api/voice/token → Gemini Live WebSocket
  └── EventKit / HomeKit / HealthKit  → native frameworks, synced to iCloud
```

No protocol changes. App Intents become Swift structs whose `perform()` calls an
HTTP endpoint (`/api/alarms`, `/api/notes`, `/api/chat`, …) and returns a spoken
result. This is why Horizon 1 builds the REST/data layer first: every native
intent is a 20-line wrapper once the endpoint exists.

## App Intents to ship (v1 of the companion)

Each maps to a Sona capability and is exposed to Siri + the Shortcuts app:

| Intent | Phrase | Backend call |
|---|---|---|
| `SetAlarmIntent` | "Hey Siri, ask Sona to wake me at 6:30" | `POST /api/alarms` |
| `AddReminderIntent` | "…add milk to the Sona shopping list" | `POST /api/notes` |
| `AskSonaIntent` | "…ask Sona what's on Thursday" | `POST /api/chat` (one-shot) |
| `StartConversationIntent` | "…start Sona" | opens a Gemini Live session |
| `LogToMemoryIntent` | "…tell Sona that Mia is allergic to peanuts" | `POST /api/memory` |

`AppShortcutsProvider` registers default phrases so they work with zero user
setup. All money/email/other-person actions keep the existing confirmation rule.

## EventKit / Reminders (native) vs CalDAV (web)

- **Web (Horizon 1):** CalDAV/CardDAV pull/push to iCloud via app-specific
  password (`lib/integrations/caldav.ts`). Works without a native app.
- **Native (Horizon 2):** EventKit writes events/reminders straight into the
  system stores, which iCloud syncs automatically — lower friction, no password.
  CalDAV stays as the headless/web fallback. The `SyncEntity` model already
  carries `externalId`/`etag` for either path.

## HomeKit / Matter (the "physical AI" surface)

HomeKit has **no cloud API**; control requires the HomeKit framework on an Apple
device plus a Home hub on the LAN. Two credible roles for Sona:

1. **Companion as HomeKit controller (Horizon 2):** the native app reads/writes
   HomeKit via the framework — "Hey Sona, goodnight" runs a Home scene.
2. **Edge device as Matter node (Horizon 3):** a Sona ambient device acts as a
   Matter controller / accessory so Sona can both *be controlled by* Apple Home
   and *control* the home, cross-ecosystem. `Device.kind` already reserves
   `edge-display` / `edge-speaker`.

A small **stub** (`/api/homekit/setup` returning an 8-digit pairing code + this
RFC) is enough to make the path demonstrable before the HAP daemon exists.

## Other native-only surfaces (staged)

- **HealthKit** — household-routine context (sleep, activity). iOS-only.
- **Handoff / Continuity / CloudKit** — CloudKit as the cross-Apple-device sync
  substrate for memory; Handoff to move a conversation browser → Mac → iPhone.
  This is the concrete realization of "thin-client + iCloud sync."
- **Apple Notes** — still no cloud API; native-only, schema-stubbed via
  `Note.externalIds`.
- **Apple Music** — MusicKit playback needs a native **Music User Token**
  (`AuthenticationServices` / Keychain); unblocks the staged MusicKit wrapper.

## Phasing

1. **Now (Horizon 1, web):** REST/data layer, Sign in with Apple, CalDAV/CardDAV,
   privacy export/delete, Memory Timeline, provider abstraction. *(in progress)*
2. **Horizon 2 (native companion, Tauri macOS → iOS):** App Intents/Siri,
   EventKit, HomeKit controller, MusicKit token, HealthKit, CloudKit/Handoff.
3. **Horizon 3 (physical/edge):** Matter controller device, HomePod/Thread
   alignment, HAP daemon.

## Open questions

- Tauri (shared web stack, faster) vs native SwiftUI (best App Intents/Siri
  ergonomics) for the macOS companion. Lean Tauri for v1, native iOS later.
- Separate Apple **Bundle ID** OAuth config for the native app vs reusing the
  web **Services ID** (recommend separate — clean per-platform secrets).
- Whether memory sync moves to CloudKit (Apple-native) or stays Postgres with an
  iCloud mirror. Decide at Horizon 2.
