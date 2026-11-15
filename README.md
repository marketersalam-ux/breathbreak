# BreathBreak

A breathing coach for screen workers — and a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04) on DEV.

BreathBreak uses your webcam to measure three things for one minute — your **breathing rate**, your **pulse**, and how often you **blink** — then guides you through a one-minute box-breathing exercise and shows you the difference. It is built for people who stare at a screen all day: fast, shallow breathing and a low blink rate are the two quiet signs of screen strain, and a slow-breathing break is the simplest thing that helps.

## How it works

1. **Consent first.** The camera starts only when you press *Start measuring*. Nothing is captured before that.
2. **Measuring (60 seconds).** The Presage SmartSpectra SDK reads breathing rate (30-second average), pulse (12-second average), and blink detection from your webcam. The page shows the live numbers, a breathing waveform, and plain-language guidance when the signal needs help ("Move a little closer", "Too dark").
3. **A nudge, only if the numbers justify one.** If your breathing is faster than a typical resting pace (above 20 breaths/min) or you're blinking well below the usual 15–20 times a minute, the app suggests a breather — and says exactly why. Otherwise it tells you you're in a good rhythm.
4. **The breather (64 seconds).** Four box-breathing cycles — breathe in 4 seconds, hold 4, breathe out 4, hold 4 — guided by an animated circle and your live breathing rate.
5. **The result.** Breathing rate, blink rate, and pulse before and after, in a plain table. No score, no verdict — just the numbers.

## Privacy design

- **Local only.** The server binds to `127.0.0.1`; the page is served from your own computer.
- **Nothing is stored.** No video frame, metric, or reading is ever written to disk. All history lives in memory and is wiped when the session stops.
- **Telemetry off.** The SDK runs with `enableTelemetry: false`. Per Presage's docs, all metric computation happens on-device; the SDK contacts Presage only to authenticate the API key.
- **The camera is released when the session ends** — after the result screen, or the moment you press Stop. It never keeps running in the background.
- **No camera preview.** Frames never leave the SDK process; the page shows numbers and a breathing waveform, not video.

> For general wellness and informational purposes only. Not for medical diagnosis or treatment. BreathBreak never diagnoses anything and never makes health claims.

## Setup

Requirements: Node.js 20 or later (Node 24 recommended), a webcam, and a free Presage API key.

```bash
git clone https://github.com/marketersalam-ux/breathbreak.git
cd breathbreak
npm install
cp .env.example .env
```

Get a free API key at <https://physiology.presagetech.com/auth/register> and paste it into `.env`:

```bash
SMARTSPECTRA_API_KEY=your-key-here
```

Then:

```bash
npm start
```

Open <http://localhost:3000>. Sit in front of your camera, face and chest in view, light in front of you, and press *Start measuring*.

## Getting a good signal

The SDK measures from your face and upper chest, so a little setup matters:

- **Stable camera, not handheld.** A laptop on a desk works; a phone in your hand doesn't.
- **Light from the front.** A window or lamp behind you makes the camera expose for the background.
- **Face and chest in view**, looking at the camera, reasonably still.
- **Don't talk** while measuring — talking pauses the breathing reading.
- **Light-coloured top.** Dark clothing and tight stripes make the breathing signal hard to read.
- **Breathing rate needs ~30 seconds** before its first confident reading; blink rate needs ~60 seconds. The page says "warming up" until then — that is the SDK's own window, not a loading screen.

## Testing

```bash
npm test    # unit tests (Node's built-in runner)
npm run lint
```

The unit tests exercise the metrics pipeline and the nudge thresholds with clearly-labelled synthetic fixtures. The app itself has no mock or demo-data path: every number on screen comes from the live SDK, and a missing metric shows as "—".

## Project structure

```
server.mjs          HTTP + WebSocket server, SDK session, phase state machine
src/metrics.js      decoded-payload extraction, blink counting, sample windows
src/thresholds.js   nudge thresholds and plain-language reasons
public/             the page (index.html, app.js, style.css) — no frameworks,
                    no external assets, works fully offline once installed
tests/              unit tests (synthetic fixtures, clearly labelled)
```

## Accuracy

We tested the SDK's readings against ground truth (manual pulse count, timed breathing, counted blinks) and wrote up the honest results — including where the SDK struggled — in the [DEV submission post](https://dev.to/aheadkit). *(Link added once published.)*

## License

MIT. Built by [AheadKit](https://aheadkit.me) with the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/).
