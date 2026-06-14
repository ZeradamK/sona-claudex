"use client";

/**
 * /voice — a stripped voice-only harness for tuning turn-taking latency.
 *
 * No chat box, no wake word: just the sphere, one talk button, the live
 * transcript, and a latency HUD (voice-to-voice round trip). This is the page
 * the Raspberry Pi boots into as a Chromium kiosk — the Pi is a dumb glass
 * terminal; all the real work (Gemini Live WSS, PCM capture/playback) runs in
 * the browser, and the API key never leaves /api/voice/token.
 */

import { Mic, Square } from "lucide-react";

