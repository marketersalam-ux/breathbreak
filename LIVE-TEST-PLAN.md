# BreathBreak — live test plan (one session, ~30 minutes, Nov 20–21)

One session, on Salam's own laptop (or phone camera — record which). The point is
a real accuracy check against ground truth, not a perfect score. Report what
actually happens, including misses — an honest "it struggled here" is worth more
than a polished claim, and it goes into the DEV post exactly as measured.

## Before you start — conditions to record

Fill these in first; they go into the DEV post next to the results, because the
numbers mean nothing without them.

- Date and time of day:
- Lighting (window / lamp / overhead — and is it in front of you?):
- Camera (laptop model, or phone model if using a phone):
- Distance from camera (roughly, e.g. arm's length):
- Clothing (colour, plain or patterned):
- Room (quiet? anyone else present?):
- Anything else (tired? just finished a long screen session? had tea/coffee?):

Setup reminders (same as the demo): laptop stable on a desk, face + upper chest
in frame, light on your face, plain light-coloured top, quiet room, `npm start`
and one quick check that the app runs before the real checks.

## Credit budget — read this first (Free tier: 100 credits = ~50 min)

The free trial gives **100 credits, 1 credit = 30 seconds of live measurement** —
about **50 minutes total**, renewing 15 Dec 2026. The four checks below use
roughly 5–10 minutes of measuring, and the demo recording ~3 minutes, so the
budget fits — but only if the app is NOT left measuring while idle. Rules:
- Start a measuring session only when a check is actually running; end it
  (or close the app) between checks instead of leaving it live.
- Do NOT run "just one more" full session to check something small — each
  60-second measuring window costs 2 credits.
- If the dashboard shows credits running low mid-session, skip check 4 and
  save the rest for the demo recording.
- If you run out entirely, the paid tier is Essentials $20/month (do NOT buy
  without asking — tell Nebula first).

## The four checks

Run them in order. Each one needs the app running AND a ground-truth count done
by hand at the same time — use a phone timer and count carefully.

### Check 1 — Pulse: manual wrist count vs SDK pulse

1. Start a measuring session. Let it run so the pulse tile is showing a live
   number (it needs ~12 seconds of window before the first confident reading).
2. Find your pulse at your wrist (two fingers, below the thumb). When the timer
   hits a round mark, count beats for **30 seconds**, then double it for BPM.
   Do this **twice** (two separate 30-second counts) and note the SDK pulse
   reading shown at the same time as each count.
3. Write down: your two manual counts, the two SDK readings, and the
   difference for each.

### Check 2 — Breathing: timed breathing at a set pace vs SDK breathing rate

1. Start a fresh measuring session. Breathe at a steady, deliberate pace of
   **6 breaths per minute** — that's one full breath (in + out) every
   10 seconds. Use a phone timer: breathe in for 5 seconds, out for 5 seconds,
   and keep it going for the full 60-second measuring window.
2. Note the SDK breathing-rate reading (the tile, and the baseline number the
   app reports at the end of measuring). Ground truth here is 6 breaths/min —
   you set the pace, so you know what the true number is.
3. If holding exactly 6/min for a full minute is hard, do your best and note
   it — "pace drifted in the last 15 seconds" is a valid note, not a failure.

### Check 3 — Blinks: deliberate counted blinks vs app blink count

1. Start a fresh measuring session. Over the 60-second measuring window, blink
   deliberately **20 times**, counting each one. Spread them out — roughly one
   blink every 3 seconds — and keep a tally on paper or with finger taps.
2. Note the app's blink count / blink rate at the end of measuring. Ground
   truth is 20 blinks in 60 seconds = 20 blinks/min.
3. Note anything odd: did the app miss blinks when they came close together?
   Did it count anything that wasn't a blink?

### Check 4 — Second breathing pace (if time allows)

1. Same as check 2, but at a different pace — **12 breaths per minute**
   (one breath every 5 seconds: in 2–3 seconds, out 2–3 seconds) for the
   60-second window.
2. Note the SDK reading vs the 12/min ground truth. Two paces (6 and 12) show
   whether the SDK tracks across a range or only near one pace.
3. Skip this one if you're short on time — checks 1–3 are the core.

## Results table — fill in during the session

| Check | Ground truth | SDK / app reading | Difference | Notes |
|---|---|---|---|---|
| 1a. Pulse (30s count #1) | ___ BPM (___ beats × 2) | ___ BPM | ___ BPM | |
| 1b. Pulse (30s count #2) | ___ BPM (___ beats × 2) | ___ BPM | ___ BPM | |
| 2. Breathing at 6/min | 6 breaths/min | ___ breaths/min | ___ | Pace held? Drifted? |
| 3. Blinks (20 in 60s) | 20 blinks/min | ___ blinks/min | ___ | Missed/extra blinks? |
| 4. Breathing at 12/min (if run) | 12 breaths/min | ___ breaths/min | ___ | |

Also note, in your own words: anything that surprised you, anywhere the app
struggled (signal hints, "warming up" that took long, a tile stuck on "—"), and
whether the nudge fired when it should have.

## Where the numbers go

- Copy the filled-in table + the conditions + your notes into the **Accuracy**
  section of `DEV-POST-DRAFT.md`, replacing the `[LIVE TEST — ...]`
  placeholders. One line per check is enough — the placeholders are marked
  exactly where each number belongs.
- Do NOT round the results into a better story. If the pulse was off by 8 BPM,
  write 8 BPM. If the blink count missed a third of the blinks, write that.
  The DEV post already says the honest version is the point — the numbers just
  have to match what happened.
- If a check failed outright (no reading at all, app error), write that too,
  with what the screen showed. A failed check with a reason is still a result.

## Timing (~30 minutes total)

| Block | Minutes |
|---|---|
| Setup + record conditions + quick app check | ~5 |
| Check 1 — pulse (two 30s counts inside one session) | ~5 |
| Check 2 — breathing at 6/min (one full session) | ~5 |
| Check 3 — blinks (one full session) | ~5 |
| Check 4 — breathing at 12/min (optional) | ~5 |
| Write up notes + fill in the table | ~5 |

Tip: run this BEFORE the demo-video recording if both are on the same day —
you'll know the app's behaviour (and your own numbers) before the camera rolls,
and the demo take will go smoother for it.
