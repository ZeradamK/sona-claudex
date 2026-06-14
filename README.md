# sona-claudex

Sona is a warm, capable household voice assistant — and the home of **seamless,
low-latency voice-to-voice** built on Gemini Live native-audio. Talk to it like a
person: it tolerates pauses and breaks, doesn't cut you off mid-thought, lets you
barge in, and corrects you gently.

## What's here

- **Seamless voice agent** — `lib/sona/voice/*` + `app/voice/` (a stripped test
  harness). Server-side VAD tuned for natural turn-taking; the model itself hears
  and speaks (`gemini-2.5-flash-native-audio-preview-12-2025`), preserving pauses
  and tone. Ephemeral tokens keep the API key off the client (and off the Pi).
  See [docs/voice/seamless-voice.md](docs/voice/seamless-voice.md).
- **Sona One** — the physical-AI product design (CM5 + XVF3800 + AMOLED).
  See [docs/hardware/sona-one-product-design.md](docs/hardware/sona-one-product-design.md).
- **Claudex** — the enterprise agent-ops layer: run your agent fleet on a context
  budget, not a blank check.
  See [docs/claudex/first-principles.md](docs/claudex/first-principles.md).

## Stack

Next.js 15 · all-Gemini runtime behind a swappable LLM provider seam · Prisma +
pgvector · NextAuth (Google + Sign in with Apple).

## Run the voice harness

```bash
npm install
# .env.local needs at least GEMINI_API_KEY
npm run dev
# open http://localhost:3000/voice — tap, talk, pause mid-sentence, interrupt
```

Tune turn-taking live (no redeploy) via `SONA_VAD_*` env vars — see
[.env.example](.env.example).

## Raspberry Pi

The same app runs on a Pi as a Chromium kiosk pointed at `/voice` (the Pi is a
dumb glass terminal; all the work runs in the browser). Steps in the voice doc.
