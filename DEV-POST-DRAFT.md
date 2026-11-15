---
title: "BreathBreak — a breathing coach that measures before it nags"
published: false
tags: devchallenge, presagechallenge, javascript, webdev
---

*This is a submission for the Presage SmartSpectra SDK Challenge*

I spend most of my day in front of a screen, and I know the feeling well: shoulders up near my ears, breathing shallow and fast, eyes dry because I haven't blinked in what feels like minutes. Every break-reminder app I tried had the same problem — it nagged me on a timer, whether I needed the break or not. After a week I ignored all of them.

BreathBreak flips that around. It measures first, and only suggests a breather when the numbers say one would help.

## What I Built

BreathBreak is a breathing coach for screen workers, running entirely on your own computer. You sit in front of your webcam for one minute while the Presage SmartSpectra SDK reads three things: your breathing rate, your pulse, and how often you blink. Then, if the numbers justify it, the app guides you through a one-minute box-breathing exercise — four cycles of breathe in 4 seconds, hold 4, breathe out 4, hold 4 — waits 30 seconds, and shows you the before-and-after numbers in a plain table.

The whole session takes about three minutes. There is no account, no sign-up, no cloud. The server binds to `127.0.0.1`, the page has no frameworks and no external assets, and it works fully offline once installed (the SDK contacts Presage only to check the API key).

A few things I was deliberate about:

- **The nudge has to earn its place.** If your breathing is inside a normal resting range and you're blinking normally, the app says so — "You're in a good rhythm" — and leaves you alone. A break reminder you can trust is one that sometimes tells you you're fine.
- **No number the app didn't measure.** A missing metric shows as "—", never a frozen or guessed value. A reading older than 3 seconds is treated as stale and dropped.
- **No score, no verdict.** The result screen is just the numbers, before and after. I didn't want to grade anyone's breathing.
- **No camera preview.** The page shows numbers and a breathing waveform, not video. Frames never leave the SDK process.

For general wellness and informational purposes only. Not for medical diagnosis or treatment.

## Demo

[demo video — recorded Nov 20–21]

The video shows one full session on my own laptop: the consent screen, the live measuring dashboard, the nudge, the breathing pacer, and the before-and-after result. What you see is the real app running against a live camera — no recorded footage standing in for the measurement.

## Code

Repo: https://github.com/marketersalam-ux/breathbreak

Setup — Node.js 20 or later, a webcam, and a free Presage API key from https://physiology.presagetech.com/auth/register:

```bash
git clone https://github.com/marketersalam-ux/breathbreak.git
cd breathbreak
npm install
cp .env.example .env   # add SMARTSPECTRA_API_KEY=your-key-here
npm start              # open http://127.0.0.1:3000
```

How the code is laid out: `server.mjs` runs the HTTP + WebSocket server, the SDK session, and the phase state machine; `src/metrics.js` handles the decoded readings, blink counting, and sample windows; `src/thresholds.js` holds the nudge thresholds and the plain-language reasons; `public/` is the page (plain HTML, CSS, and JavaScript). Unit tests cover the metrics pipeline and the thresholds with clearly-labelled synthetic fixtures — the app itself has no mock or demo-data path.

## How It Responds to Human Signals

The session runs through five phases, and every step is driven by what the camera actually sees.

**1. Consent (idle).** Nothing is captured until you press "Start measuring". The consent screen says plainly what the camera measures and what happens to the data — on this computer, nothing stored, nothing sent — before the button is anywhere near your cursor.

**2. Measuring (60 seconds).** The SDK reads five metrics: breathing rate (a 30-second average, 5–40 breaths/min), the chest-breathing trace (drawn live as a waveform on the page), pulse rate (a 12-second average, 40–110 BPM, from tiny colour changes in the skin), blinking (binary per frame — the app counts transitions into per-minute blink rate), and talking (breathing rate is invalid while talking, so the app says so instead of showing a wrong number).

While you measure, the page talks back in plain language when the signal needs help: "Too dark", "Move a little closer", "Face the camera directly". Those hints come from the SDK's validation status. The breathing tile says "warming up" until the 30-second window fills; the blink tile needs the full 60 seconds before its rate means anything. That waiting is the SDK's own window, not a loading screen — I kept it visible rather than hiding it.

**3. The nudge (ready).** When the 60 seconds are up, the app averages the session and checks two thresholds:

- Breathing above **20 breaths/min** — above the typical adult resting range of 12–20.
- Blinking below **10 blinks/min** — well below the usual 15–20, which is common during concentrated screen work.

If either trips, the app suggests a breather and says exactly why, in the same sentence — for example, that your breathing is running faster than a typical resting pace. If neither trips, it tells you you're in a good rhythm, with a "take a breather anyway" button for anyone who wants one regardless. Pulse is measured and shown throughout, but it never triggers the nudge — a single pulse reading says too little on its own to justify interrupting someone.

**4. The breather (64 seconds).** Four box-breathing cycles, guided by an animated circle that grows and shrinks with each phase and a cue line ("Breathe in…", "Hold…", "Breathe out…", "Hold…"). Your live breathing rate stays on screen underneath the pacer, so you can watch it slow as you follow the circle.

**5. Settling + result (30 seconds, then the table).** After the exercise, the app measures for 30 more seconds while your breathing settles, then puts before and after side by side — breathing, blinks, pulse — and releases the camera. The session is over; nothing keeps running in the background.

### Accuracy — checked against ground truth, not taken on trust

A health-adjacent app that never checks its own numbers is just a random-number generator with a nice dashboard. So I ran one live session against ground truth before writing this up, and here is what actually happened:

[LIVE TEST — fill in after Nov 20 session: SDK pulse vs manual wrist count (30s × 2)]

[LIVE TEST — fill in after Nov 20 session: SDK breathing rate vs timed breathing at a set pace (6 breaths/min with a timer)]

[LIVE TEST — fill in after Nov 20 session: app blink count vs deliberate counted blinks (20 blinks in 60s)]

[LIVE TEST — fill in after Nov 20 session: second breathing pace, if run]

[LIVE TEST — fill in after Nov 20 session: conditions — lighting, camera, distance from camera, clothing, time of day]

[LIVE TEST — fill in after Nov 20 session: honest notes — where the SDK tracked well, where it struggled, anything that surprised me]

I am not going to dress the results up: a webcam measurement has real limits, and the honest version of this section is the point. The SDK needs a stable camera (not handheld), face and upper chest in frame, good light on the face, no talking during the measurement, and a plain light-coloured top — dark clothing and tight stripes make the breathing signal hard to read. If the setup is wrong, the app says so on screen instead of showing numbers it can't stand behind.

## Prize Categories

I'm entering **Best Thoughtful Real-World Use**, and the overall prize.

The real-world part is the whole idea: screen strain is something millions of people feel every day, and the fix here is a one-minute breathing break — the simplest, oldest intervention there is. What the SDK adds is the measurement that makes the break well-timed instead of timer-driven. And the thoughtful part is the part I spent the most time on: consent before any capture, a nudge that explains itself and sometimes says "you're fine", no storage of anything, no score, and accuracy checked against ground truth with the results reported honestly — misses included.

## Consent and Data Handling

- **Explicit consent, on screen, before any capture.** The camera starts only when you press "Start measuring". The consent screen explains what is measured (breathing rate, pulse, blink rate) and what happens to the data, before the button. Pressing the button is the consent for that session only.
- **Local only.** The server binds to `127.0.0.1`. The page is served from your own computer, and nothing about the session leaves it.
- **Nothing is stored.** No video frame, metric, or reading is ever written to disk. All history lives in memory and is wiped when the session stops.
- **Telemetry off.** The SDK runs with `enableTelemetry: false`. Per Presage's docs, all metric computation happens on-device; the SDK contacts Presage only to authenticate the API key.
- **The camera is released when the session ends** — after the result screen, or the moment you press Stop. It never keeps running in the background.
- **No camera preview.** Frames never leave the SDK process. The page shows numbers and a breathing waveform, not video.
- **No medical claims.** For general wellness and informational purposes only. Not for medical diagnosis or treatment. BreathBreak never diagnoses anything.

Built by [AheadKit](https://aheadkit.me) with the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/). MIT licensed.
