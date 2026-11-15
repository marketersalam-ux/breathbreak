# BreathBreak — demo video script (60–90 seconds)

For Salam. First-timer friendly: you don't need to be polished, you need to be real.
The demo is one genuine session of the app, recorded on your own laptop, cut down
to 60–90 seconds. Your face appears in this video only — that's the point: the face
on screen IS the measurement working. The SDK reads pulse and breathing from your
face and upper chest, so a demo without a face would prove nothing.

## Before you record — setup checklist

Do all of this before you press record. A test run first saves a ruined take.

- [ ] Laptop on a desk, stable — NOT handheld, NOT on your lap. The breathing
      measurement needs a still camera.
- [ ] Face + upper chest in frame. Sit back a little so your shoulders are visible.
- [ ] Good light on your face — a window or lamp IN FRONT of you, not behind you.
      Light behind you makes the camera expose for the background and your face
      goes dark.
- [ ] Plain light-coloured top. No dark clothing, no tight stripes — both make
      the breathing signal hard to read.
- [ ] Quiet room. Don't talk while measuring — talking pauses the breathing reading.
- [ ] Close other apps (especially anything with notifications). Silence your phone.
- [ ] Test the app once first: `npm start`, open http://127.0.0.1:3000, run one
      FULL session (consent → 60s measuring → breather → result). Check the
      numbers appear and the nudge shows up. If anything fails, fix it now, not
      mid-recording.
- [ ] Plug the laptop into power. Close the laptop lid latch / disable sleep.
- [ ] OBS installed and tested (see below), or phone charged and on a stand for
      the fallback.

## How to record — main method: OBS (screen + webcam picture-in-picture)

OBS is free: https://obsproject.com — download, install, and follow these steps.

1. Open OBS. In the Sources box (bottom), click `+` → **Display Capture** →
   pick your screen → OK. This is the app window.
2. Click `+` again → **Video Capture Device** → pick your laptop webcam → OK.
   Drag the webcam preview into a corner of the canvas and shrink it to about
   a quarter of the screen (bottom-right works well). This is the
   picture-in-picture of your face.
3. Click **Settings → Audio** and make sure your laptop mic is selected as the
   Mic/Auxiliary Audio device. Speak a test line and watch the green audio
   meter move.
4. Click **Start Recording** (bottom-right). Do a 10-second test: say a line,
   click around the app, then **Stop Recording**. Play the file back — check
   the app is readable, your face is visible in the corner, and the audio is
   clear. If the app text is too small, zoom the browser in (Ctrl/Cmd + `+`)
   before recording for real.
5. For the real take: start OBS recording FIRST, then open the app in the
   browser and run the session. Record the WHOLE session (about 3 minutes) —
   you cut it down afterwards. Do not try to record only 90 seconds live; the
   session is longer than the final video.
6. When the result screen shows, wait 3 seconds, then stop OBS recording.

**Editing it down to 60–90 seconds:** keep the beats in the shot list below, in
order. Cut the middle of the 60-second measuring phase and the middle of the
64-second exercise (show the start, then a jump cut to near the end — the
on-screen timer makes the cut honest). Free editors that do this fine: CapCut,
DaVinci Resolve, or the built-in editor on your phone. Export 1080p if you can.

## Fallback method — phone recording the laptop screen

If OBS gives you trouble, prop your phone on a stack of books (or a tripod if
you have one) pointing at the laptop screen, with you visible beside it. Start
the phone recording, then run the session.

Honest tradeoff: this looks noticeably worse — screen glare, moiré shimmer on
the laptop display, and small text that is hard to read. It still proves the app
works, and a real recording beats no recording. But try OBS first; the test
recording in step 4 tells you within two minutes whether it works on your laptop.

## Shot list — in order, with timings (final edited video, ~75 seconds)

Timings are for the EDITED video. The lines are suggestions — say them in your
own words, however feels natural. Short and plain beats polished.

| # | Time | What to show | What to say |
|---|------|--------------|-------------|
| 1 | 0:00–0:08 | You on camera (webcam PiP large for a second, or full screen), then the app's consent screen | "This is BreathBreak. It measures how you're breathing from your webcam — then tells you if you actually need a break." |
| 2 | 0:08–0:18 | Consent screen. Click "Start measuring". Camera starts; dashboard appears | "Nothing is captured until I press start. One minute of measuring — breathing, pulse, and blinks." |
| 3 | 0:18–0:35 | Live dashboard: breathing / pulse / blink tiles filling in, breathing waveform moving. Jump-cut the middle of the 60s — keep the timer visible so the cut is honest | (No talking while measuring — the SDK pauses the breathing reading if you talk. Let the numbers speak. Optional voiceover added in editing: "It's reading my breathing rate, my pulse, and how often I blink.") |
| 4 | 0:35–0:45 | Nudge card appears with its reason. Click "Start a one-minute breather" | "It says my breathing is fast — so it's suggesting a breather, and telling me why." |
| 5 | 0:45–1:05 | Breather pacer: circle growing/shrinking, cue lines changing, live breathing rate underneath. Jump-cut across the 4 cycles — show cycle 1 and cycle 4 | (Breathe along with the circle. No talking needed. Optional voiceover in editing: "Four slow box-breathing cycles — in four, hold four, out four, hold four.") |
| 6 | 1:05–1:15 | Settling text, then the result table: before vs after | "And there's the difference — before and after, side by side." |
| 7 | 1:15–1:20 | Result screen, camera off. You on camera briefly to close | "Three minutes, measured, not guessed. That's BreathBreak." |

## Notes

- **If the nudge doesn't appear** (your numbers are all in range — good for you,
  bad for the demo): the app shows "You're in a good rhythm" with a "Take a
  breather anyway" button. Click that and carry on — and say so on camera:
  "It says I'm in a good rhythm — I'll take the breather anyway so you can see
  it." Honest and it still shows the whole loop. (Tip: recording right after a
  long screen session, when you're a bit tired, makes the nudge more likely —
  fast breathing and low blinks are exactly what screen work does.)
- **If a tile shows "—" or "warming up" for a long time:** check the hint bar
  at the top of the dashboard — it tells you what's wrong ("Too dark", "Move a
  little closer"). Fix the light or position, stop, and start a fresh session.
- **Don't re-record for a small stumble.** One natural take with a pause beats
  five stiff ones. The judges want to see a real app working on a real person.
- **Face in this video only.** The demo video is the one place your face
  appears for this challenge. The DEV post, the repo README, and everything
  else stay faceless as usual.
- **After recording:** upload the video (YouTube unlisted works well), paste
  the link into the Demo section of DEV-POST-DRAFT.md, and hand the file/link
  to the parent agent — do NOT publish the DEV post yourself unless told to.
