# Sona One — Physical Product Design (v0.1)

Status: **design-stage**, product-level. Source: multi-domain hardware design pass + integration stress-test (2026-06-09). This is the engineering spec for Sona's flagship physical device. Thin-client thesis holds: **zero AI on-device** — all reasoning/memory/voice synthesis run in Sona's cloud on Gemini.

---

## 1. Product definition + the decisive stack

**Sona One** is a mains-powered desktop conversational-AI box (~95 mm diameter × 100 mm tall) with an expressive, personality-swappable animated face on a round AMOLED, far-field voice capture with **true hardware AEC** for natural barge-in, and no on-device AI. It captures audio, cancels echo, detects "Hey Sona" locally, opens a low-latency realtime link to Gemini (via a Sona-minted ephemeral token), and renders a face driven by state + emotion tags. Every box is just another claimed `Device` in a `Household` — same identity model as the browser client that already ships.

| Layer | Decision | Notes |
|---|---|---|
| **Compute** | **Raspberry Pi Compute Module 5 Lite, 2 GB, wireless** (BCM2712 quad-A76 @ 2.4 GHz, VideoCore VII, WiFi 6E + BLE) | $45 / ~$38 @ vol. Production-committed to ~2036; mature OTA + huge ecosystem. De-risks a small team. |
| **Audio front-end** | **XMOS XVF3800** 4-mic far-field voice processor (on-chip AEC, beamforming, dereverb, AGC) | **Non-negotiable** for HomePod-class barge-in. Sourced via the ReSpeaker XVF3800 module (see BOM note). |
| **Display** | **1.43″ round AMOLED, 466×466, RM67162/CO5300, QSPI** | True blacks for charm; QSPI avoids MIPI-DSI bring-up risk; commodity panel. |
| **Face renderer** | **Rive C++ runtime → framebuffer**, state-machine driven | ⚠️ **must validate on VideoCore VII first — biggest risk (see §7).** Fallback: LVGL sprites. |
| **Transport** | **Direct Gemini Live over WebSocket via a Sona-minted single-use ephemeral token** | Mirrors the existing `app/api/voice/token` pattern. **No LiveKit in v1.** |
| **OS** | **Yocto + Mender** (prod) / Raspberry Pi OS Lite (proto) | A/B partitions, signed images, atomic rollback. |
| **Wake word** | **Picovoice Porcupine** custom "Hey Sona" on the A76 cores | |
| **Power** | **USB-C, fixed 5 V / 3 A (15 W)**, pre-certified adapter | No PD negotiation, no battery in v1. |

Rejected: RK3588 (overkill GPU, price volatility, longer cert path), ESP32-only (can't run robust WebRTC + Rive + OTA), all-in-one voice modules (obscure the thin-client model + lock firmware).

---

## 2. System architecture

```
                       ┌──────────────────────── SONA ONE (box) ────────────────────────┐
 4-MIC ARRAY ─PDM/I2S─▶│ XMOS XVF3800: AEC (speaker loopback = reference) + beamforming  │
 (far-field)           │       │ clean 16 kHz mic (I2S)                                   │
                       │       ▼                                                          │
                       │  CM5 (BCM2712, Linux)                                            │
                       │   • Porcupine "Hey Sona" (always-on)                             │
                       │   • Session Manager: wake → token → WSS → stream uplink ─────────┼─┐
                       │   • downlink audio + emotion tags ◀─────────────────────────────┼─┼┐
                       │       │ audio                  │ state+emotion                   │ ││
                       │       ▼                        ▼                                 │ ││
                       │  MAX98357A → speaker     Rive Face → AMOLED                       │ ││
                       │       └── loopback ref ──▶ XVF3800 AEC                            │ ││
                       └─────────────────────────────────────────────────────────────────┘ ││
   ┌──────────────────────── SONA CLOUD (Next.js + Postgres/Prisma) ──────────────────────┐ ││
   │  POST /api/device/provision  → claim box into Household (fingerprint = Device row)    │ ││
   │  POST /api/device/token      → mint single-use Gemini Live token + device prompt + mem│◀┘│
   │  POST /api/device/telemetry  → health only (no audio/PII): latency, SNR, RSSI, errors │  │
   │  GET  /api/ota/manifest      → signed Mender artifact URL + version + hash             │  │
   └──────────────────────────────────────────────────────────────────────────────────────┘  │
   ┌──────────────────────── GOOGLE — Gemini Live (native-audio dialog) ──────────────────┐   │
   │  server-side VAD → turn-taking + barge-in;  native audio out (voice = personality)    │───┘
   └───────────────────────────────────────────────────────────────────────────────────────┘
```

**The box never holds the Gemini API key.** On each wake it asks Sona's backend for a *single-use* token (exactly like the browser does today), then streams media **directly** to Gemini for lowest latency. Only token-mint, telemetry, and OTA touch Sona's backend → preserves the thin-client thesis and adds **zero per-minute SFU cost**.

**Barge-in is split correctly:** *acoustic* echo cancellation (don't hear ourselves) = **XVF3800 hardware**, using speaker output as the AEC reference. *Conversational* turn-taking (user intends to interrupt) = **Gemini Live server-side VAD**. Both are required; neither alone suffices.

