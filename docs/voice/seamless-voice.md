# Sona seamless voice — how it works & how to run it

Goal: humanized, low-latency voice-to-voice. Sona understands pauses and breaks,
doesn't cut you off mid-thought, lets you barge in, and gently corrects you.
The browser is the test client today; the **same app** runs on a Raspberry Pi as
a Chromium kiosk tomorrow (the Pi is a dumb glass terminal — all the real work
runs in the browser).

## Architecture (no new services)

```
 mic 16kHz PCM16 ──▶ AudioWorklet ──▶ liveSession (WSS) ──▶ Gemini Live
   (getUserMedia)     pcm16-encoder        │  ephemeral token
                                           ▼
 speaker 24kHz ◀── SpeakerPlayback ◀── audioOut chunks
```

- **Native-audio dialog model** — `gemini-2.5-flash-native-audio-preview-12-2025`.
  The model itself hears and speaks, so pauses, tone, and backchannels survive.
  (The half-cascade `*-live` variants lose paralinguistics — don't use them here.)
- **Server-side VAD owns turn-taking.** The client streams mic audio continuously
  and never sends an end-of-speech signal; Gemini decides when you're done and
  when you're barging in.
- **Ephemeral token security.** The long-lived `GEMINI_API_KEY` never reaches the
  browser (or the Pi). `/api/voice/token` mints a single-use token with the
  persona, voice, and VAD config baked in, so the client can't tamper with
  Sona's behaviour.

## The turn-taking tuning (this is the whole game)

`lib/llm/provider.ts` → `VAD_CONFIG`, all env-overridable:

| Param | Value | Why |
|---|---|---|
| `startOfSpeechSensitivity` | `START_SENSITIVITY_HIGH` | notice you instantly → snappy barge-in |
| `endOfSpeechSensitivity` | `END_SENSITIVITY_LOW` | **be patient deciding you're done** — the #1 "don't cut me off" lever |
| `silenceDurationMs` | `700` | trailing silence before Sona takes the turn (600–800 = natural) |
| `prefixPaddingMs` | `300` | keep audio before speech onset so the first syllable isn't clipped |

Tune live (no redeploy) via env: `SONA_VAD_END_SENSITIVITY`, `SONA_VAD_SILENCE_MS`,
`SONA_VAD_START_SENSITIVITY`, `SONA_VAD_PREFIX_PADDING_MS`. In a noisy kitchen,
raise `SONA_VAD_SILENCE_MS` (e.g. 800–900).

Barge-in is automatic: when you talk over Sona, the server emits `interrupted`,
and `SpeakerPlayback.flush()` stops every live audio source within ~1 frame
(`lib/sona/voice/audio.ts`).

The spoken persona (`lib/sona/persona.ts`, `buildPersona(profile, {spoken:true})`)
tells Sona to keep replies short, treat a pause as "still thinking", backchannel,
read back numbers/times, and correct gently.

## Run it in the browser (the test harness)

```bash
# .env.local needs at least GEMINI_API_KEY
npm run dev
# open http://localhost:3000/voice  (or whatever PORT)
```

`app/voice/page.tsx` is the stripped harness: the particle sphere, one talk
button, the live transcript, and a **latency HUD** (voice-to-voice round trip:
you stopped talking → Sona started). Tap, talk, pause mid-sentence, interrupt
her — verify she waits for you and stops instantly when you cut in. Watch the ms
chip; ~250–700ms voice-to-voice is the target.

## Run it on a Raspberry Pi (kiosk)

The Pi runs the **exact same** Next.js app — nothing Pi-specific in the code.
Point a kiosk Chromium at the `/voice` route of your Sona host:

```bash
chromium-browser --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  http://<sona-host>/voice
```

Everything that matters is browser-standard and runs identically on Chromium-on-ARM:
`getUserMedia` 16kHz capture, the AudioWorklet PCM encoder, the `SpeakerPlayback`
Web Audio queue, and the WSS to Gemini. The Pi just supplies a USB/I²S mic and a
speaker; the same `/api/voice/token` backend keeps the key off the device.

Verify two Pi-specific things on the **target network** before deploying:
1. Kiosk Chromium has mic permission and autoplay (the flags above handle both;
   `--use-fake-ui-for-media-stream` auto-accepts the mic prompt — drop it if you
   want a real prompt).
2. The Pi's WiFi holds a persistent WebSocket under continuous 16kHz upstream
   audio — that's the one real difference from a dev laptop.

## Later (not needed for testing)

