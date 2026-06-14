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

---

## 3. The conversational experience: <1 s wake-to-response + barge-in

**Latency budget (wake-end → first audible syllable), broadband: ~600–800 ms** (critic measured 450–650 ms optimistic). The key trick is **speculative connection pre-warming**: Porcupine crosses ~90% confidence partway through "…Sona," so the token mint + TLS + WSS handshake (~300 ms) overlap with the user *starting to speak their request* — Gemini already has a warm session by the time request audio flows.

**Barge-in path:** Sona speaks → speaker signal fed back as XVF3800 AEC reference → uplinked mic stream is echo-free → when the user talks over Sona, Gemini's native VAD detects it, truncates output, starts listening; box stops playback. Target interrupt latency **<300 ms**. Without hardware AEC, this fires constantly on Sona's own voice — *which is exactly why the XVF3800 is non-negotiable.*

**Fallbacks:** capacitive touch-to-talk bypasses wake-word (noisy rooms / false-rejects); cloud-unreachable → "no connection" face + chime (no offline LLM in v1).

---

## 4. Bill of Materials (corrected with integration-critic sourcing reality)

| # | Part | Role | Proto $ | Vol (10k) $ |
|---|---|---|---|---|
| 1 | CM5 Lite 2 GB wireless (BCM2712) | Compute, WiFi 6E/BLE, Rive, Porcupine | 45 | 38 |
| 2 | XMOS XVF3800 (via ReSpeaker module) + 4× Knowles PDM mics | HW AEC + beamforming + far-field array | 50 (USB module) | 24 |
| 3 | 1.43″ round AMOLED 466×466 QSPI (RM67162/CO5300) | Animated face | 22 | 18 |
| 4 | MAX98357A Class-D amp (I2S) | Speaker driver | 3 | 1.5 |
| 5 | 45 mm full-range driver, 4 Ω, voice-tuned | Playback (300 Hz–8 kHz clarity) | 6 | 4 |
| 6 | 16 GB eMMC | OS A/B + OTA staging | — (microSD proto) | 4 |
| 7 | Custom 4-layer carrier PCB ~70×70 mm | CM5 + I2S + QSPI + power + mics | — (dev board) | 6 |
| 8 | 5 V/3 A power tree + USB-C + protection | Power (3.3 V/1.8 V rails) | 4 | 3 |
| 9 | Capacitive touch (PTT + hardware mic-mute) | Wake fallback + privacy | 2 | 1.5 |
| 10 | RGB LED ring (4–6) | Listening/thinking/mute indication | 2 | 1.5 |
| 11 | Enclosure (aluminum top ring + molded PC base + acoustic foam) | Premium feel, RF, acoustics | 15 (3D-print) | 9 |
| 12 | Porcupine "Hey Sona" license | On-device wake word | 1.50 | 0.30 |
| 13 | Connectors / passives / harness | Glue | 3 | 2.5 |
| | **BOM subtotal** | | **~$160 proto** | **~$118 @ 10k** |
| | + assembly/test (vol) | | | ~$10 |
| | **Landed unit (vol)** | | | **~$128** |

**Honest verdict vs target:** corrected volume BOM is **~$118** (the synth's $105 under-counted the XVF3800 as a bare IC that XMOS doesn't sell standalone, and the OLED at dev-board price). That's **slightly over the $120 BOM goal once landed (~$128)**. Retail **$199** still works at ~1.55× landed — thin but acceptable because **the business is the cloud subscription, not hardware margin.** The XVF3800 ($24) is the line that makes the product *good* — defend it, don't cost it out. A v2 cost-down unsolders the bare XVF3800 IC onto the carrier (~$11–15).

---

## 5. Cloud infra to build on Sona's backend

The existing schema already fits: `Device` has `kind` (`edge-display`/`edge-speaker`), unique `fingerprint`, `householdId`, `lastSeenAt`; `app/api/voice/token` already mints Gemini Live ephemeral tokens server-side. New endpoints:

