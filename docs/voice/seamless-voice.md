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

