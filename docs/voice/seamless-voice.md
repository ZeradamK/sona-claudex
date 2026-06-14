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

