/* BreathBreak — frontend logic.
 *
 * Talks to the local server over WebSocket at ws://<host>/ws.
 * Every number shown on screen comes from a server message — this file
 * never invents, fakes, or placeholder-fills a metric. A null metric
 * is shown as "—".
 *
 * The box-breathing pacer runs on the client clock (4-second phases);
 * the server is authoritative only for the state transitions
 * (exercising -> settling -> done).
 *
 * No camera preview is ever shown: the SDK owns the camera and frames
 * never leave the server process.
 */

'use strict';

/* ---------------- Configuration ---------------- */

const WS_URL = 'ws://' + location.host + '/ws';

// Exercise timing (client clock). One box-breathing cycle is 4 phases x 4s.
const PHASE_SECONDS = 4;
const PHASES = [
  { key: 'inhale', cue: 'Breathe in…',  label: 'Inhale · 4 seconds', circleClass: 'phase-inhale' },
  { key: 'hold',   cue: 'Hold…',        label: 'Hold · 4 seconds',   circleClass: 'phase-inhale phase-hold' },
  { key: 'exhale', cue: 'Breathe out…', label: 'Exhale · 4 seconds', circleClass: 'phase-exhale' },
  { key: 'hold',   cue: 'Hold…',        label: 'Hold · 4 seconds',   circleClass: 'phase-exhale phase-hold' },
];
const CYCLE_SECONDS = PHASE_SECONDS * PHASES.length; // 16s per cycle
const TOTAL_CYCLES = 4;
const EXERCISE_SECONDS = 64; // matches the server's exerciseSeconds: 4 full box-breathing cycles x 16s

// Breathing-trace sparkline keeps the last ~60 seconds at ~2 samples/sec.
const TRACE_MAX_POINTS = 120;

/* ---------------- State ---------------- */

let socket = null;
let socketWanted = true;      // false once the user stops the session
let pendingStart = false;     // user pressed Start while the socket was still opening
let currentState = 'idle';
let baseline = null;          // last {"type":"baseline"} message
let latestMetrics = null;     // last {"type":"metrics"} message

let sessionStartMs = null;    // when measuring began (for the session timer)
let timerInterval = null;

let pacerStartMs = null;      // when the exercise began (client clock)
let pacerInterval = null;
let pacerPhaseIndex = -1;     // -1 = pacer not running

let settlingStartMs = null;   // when the settling state began
let settlingInterval = null;

const tracePoints = [];       // breathTrace values, oldest first (nulls = gaps)

/* ---------------- DOM helpers ---------------- */

const $ = (id) => document.getElementById(id);

const screens = {
  consent: $('screen-consent'),
  dashboard: $('screen-dashboard'),
  exercise: $('screen-exercise'),
  result: $('screen-result'),
  error: $('screen-error'),
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
}

/* Format a metric value: one decimal, trailing ".0" stripped. Null -> "—". */
function fmt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function fmtClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/* ---------------- WebSocket ---------------- */

function connect() {
  socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    $('connection-note').hidden = true;
    if (pendingStart) {
      pendingStart = false;
      send({ type: 'start' });
    }
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return; // ignore non-JSON frames
    }
    handleMessage(msg);
  });

  socket.addEventListener('close', () => {
    stopTimers();
    // A close after the user pressed Stop is expected; anything else
    // while a session is live is a lost connection.
    if (socketWanted && currentState !== 'idle' && currentState !== 'done') {
      showError('The connection to the local server was lost. Make sure the server is running, then try again.');
    }
  });

  socket.addEventListener('error', () => {
    // The 'close' handler above reports the problem; nothing to do here.
  });
}

function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

/* ---------------- Incoming messages ---------------- */

function handleMessage(msg) {
  switch (msg.type) {
    case 'status':
      setState(msg.state, msg.detail);
      break;
    case 'metrics':
      latestMetrics = msg;
      updateMetrics(msg);
      break;
    case 'baseline':
      baseline = msg;
      renderNudge();
      break;
    case 'result':
      renderResult(msg);
      break;
    case 'error':
      showError(msg.message || 'Something went wrong. Please try again.');
      break;
    default:
      break; // ignore unknown message types
  }
}

/* ---------------- State machine ---------------- */

function setState(state, detail) {
  currentState = state;

  switch (state) {
    case 'idle':
      socketWanted = true;
      stopTimers();
      resetDashboard();
      showScreen('consent');
      break;

    case 'starting':
      $('session-status').textContent = detail || 'Starting the camera…';
      showScreen('dashboard');
      break;

    case 'measuring':
      if (sessionStartMs === null) startSessionTimer();
      $('session-status').textContent = detail || 'Measuring…';
      $('nudge-card').hidden = true;
      showScreen('dashboard');
      break;

    case 'ready':
      $('session-status').textContent = detail || 'Baseline ready';
      renderNudge();
      showScreen('dashboard');
      break;

    case 'exercising':
      startPacer();
      $('settling').hidden = true;
      $('pacer-wrap').hidden = false;
      $('exercise-live').hidden = false;
      showScreen('exercise');
      break;

    case 'settling':
      stopPacer();
      startSettlingTimer();
      $('pacer-wrap').hidden = true;
      $('exercise-live').hidden = true;
      $('settling').hidden = false;
      showScreen('exercise');
      break;

    case 'done':
      stopTimers();
      showScreen('result');
      break;

    case 'error':
      stopTimers();
      showError(detail || 'Something went wrong. Please try again.');
      break;

    default:
      break;
  }
}

function showError(message) {
  currentState = 'error';
  stopTimers();
  $('error-message').textContent = message;
  showScreen('error');
}

/* ---------------- Metrics ---------------- */

function updateMetrics(msg) {
  // Breathing rate — needs ~30s to warm up.
  if (msg.breathingRate && msg.breathingRate.value !== null) {
    $('metric-breathing').textContent = fmt(msg.breathingRate.value);
    $('note-breathing').textContent = '';
    $('exercise-breathing').textContent = fmt(msg.breathingRate.value);
  } else {
    $('metric-breathing').textContent = '—';
    $('note-breathing').textContent = 'warming up… (~30s)';
    $('exercise-breathing').textContent = '—';
  }

  // Pulse.
  if (msg.pulseRate && msg.pulseRate.value !== null) {
    $('metric-pulse').textContent = fmt(msg.pulseRate.value);
    $('note-pulse').textContent = '';
  } else {
    $('metric-pulse').textContent = '—';
    $('note-pulse').textContent = 'warming up…';
  }

  // Blink rate — needs ~60s to warm up.
  if (msg.blinkRate !== null && msg.blinkRate !== undefined) {
    $('metric-blinks').textContent = fmt(msg.blinkRate);
    $('note-blinks').textContent = '';
  } else {
    $('metric-blinks').textContent = '—';
    $('note-blinks').textContent = 'warming up… (~60s)';
  }

  // Validation hint bar.
  const hintBar = $('hint-bar');
  const hintText = $('hint-text');
  let hint;
  if (msg.validation && msg.validation.code !== 0) {
    hintBar.classList.remove('hint-ok');
    hintBar.classList.add('hint-warn');
    hint = msg.validation.hint || 'Adjust your position for a clearer signal';
  } else {
    hintBar.classList.remove('hint-warn');
    hintBar.classList.add('hint-ok');
    hint = 'Signal looks good';
  }
  // Talking pauses the breathing measurement — say so plainly.
  if (msg.talking) hint += ' · Talking pauses the breathing reading';
  hintText.textContent = hint;

  // Breathing trace sparkline.
  if ('breathTrace' in msg) {
    tracePoints.push(msg.breathTrace);
    if (tracePoints.length > TRACE_MAX_POINTS) tracePoints.shift();
    drawTrace();
  }
}

function resetDashboard() {
  $('metric-breathing').textContent = '—';
  $('metric-pulse').textContent = '—';
  $('metric-blinks').textContent = '—';
  $('note-breathing').textContent = 'warming up… (~30s)';
  $('note-pulse').textContent = 'warming up…';
  $('note-blinks').textContent = 'warming up… (~60s)';
  $('exercise-breathing').textContent = '—';
  $('session-timer').textContent = '0:00';
  $('session-status').textContent = 'Measuring…';
  $('nudge-card').hidden = true;
  $('hint-bar').classList.remove('hint-warn');
  $('hint-bar').classList.add('hint-ok');
  $('hint-text').textContent = 'Signal looks good';
  tracePoints.length = 0;
  drawTrace();
  baseline = null;
  latestMetrics = null;
  pacerPhaseIndex = -1;
  $('pacer-circle').className = 'pacer-circle';
  $('pacer-cue').textContent = 'Breathe in…';
  $('pacer-phase').textContent = 'Inhale · 4 seconds';
  $('exercise-cycle').textContent = 'Cycle 1 of 4';
  $('exercise-remaining').textContent = EXERCISE_SECONDS + 's remaining';
}

/* ---------------- Breathing-trace sparkline ---------------- */

function drawTrace() {
  const canvas = $('breath-trace');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const values = tracePoints.filter((v) => v !== null && v !== undefined);
  const note = $('trace-note');
  if (values.length < 2) {
    note.textContent = values.length === 0
      ? 'Waiting for the breathing signal…'
      : 'Collecting the breathing signal…';
    return;
  }
  note.textContent = 'Live breathing waveform — each rise and fall is a breath.';

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const range = (max - min) || 1;
  const pad = 10;

  // Midline.
  ctx.strokeStyle = '#e5e0d5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Trace. Null samples break the line (a gap, not a zero).
  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let penDown = false;
  tracePoints.forEach((v, i) => {
    const x = (i / (TRACE_MAX_POINTS - 1)) * width;
    if (v === null || v === undefined) {
      penDown = false;
      return;
    }
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    if (penDown) {
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      penDown = true;
    }
  });
  ctx.stroke();
}

/* ---------------- Nudge card ---------------- */

function renderNudge() {
  if (!baseline || currentState !== 'ready') return;

  const card = $('nudge-card');
  const heading = $('nudge-heading');
  const reasons = $('nudge-reasons');
  const good = $('nudge-good');
  const btnMain = $('btn-exercise');
  const btnAnyway = $('btn-exercise-anyway');

  reasons.innerHTML = '';

  if (baseline.nudge) {
    heading.textContent = 'Your body could use a breather';
    good.hidden = true;
    btnMain.hidden = false;
    btnAnyway.hidden = true;
    const list = Array.isArray(baseline.reasons) ? baseline.reasons : [];
    list.forEach((reason) => {
      const li = document.createElement('li');
      li.textContent = reason;
      reasons.appendChild(li);
    });
    reasons.hidden = list.length === 0;
  } else {
    heading.textContent = 'Looking steady';
    good.hidden = false;
    btnMain.hidden = true;
    btnAnyway.hidden = false;
    reasons.hidden = true;
  }

  card.hidden = false;
}

/* ---------------- Pacer (client clock) ---------------- */

function startPacer() {
  if (pacerInterval !== null) return; // already running
  pacerStartMs = Date.now();
  pacerPhaseIndex = -1;
  tickPacer();
  pacerInterval = setInterval(tickPacer, 100);
}

function tickPacer() {
  const elapsedMs = Date.now() - pacerStartMs;
  const elapsedSec = elapsedMs / 1000;

  // Phase within the current 16-second cycle.
  const cyclePositionSec = elapsedSec % CYCLE_SECONDS;
  const phaseIndex = Math.min(
    PHASES.length - 1,
    Math.floor(cyclePositionSec / PHASE_SECONDS)
  );

  if (phaseIndex !== pacerPhaseIndex) {
    pacerPhaseIndex = phaseIndex;
    const phase = PHASES[phaseIndex];
    $('pacer-circle').className = 'pacer-circle ' + phase.circleClass;
    $('pacer-cue').textContent = phase.cue;
    $('pacer-phase').textContent = phase.label;
  }

  // Cycle count, capped at 4. The exercise is 4 cycles x 16s = 64s, so
  // the pacer ends exactly on the last hold; the server's "settling"
  // state then takes over.
  const cycle = Math.min(TOTAL_CYCLES, Math.floor(elapsedSec / CYCLE_SECONDS) + 1);
  $('exercise-cycle').textContent = 'Cycle ' + cycle + ' of ' + TOTAL_CYCLES;

  const remaining = Math.max(0, EXERCISE_SECONDS - Math.floor(elapsedSec));
  $('exercise-remaining').textContent = remaining + 's remaining';
}

function stopPacer() {
  if (pacerInterval !== null) {
    clearInterval(pacerInterval);
    pacerInterval = null;
  }
  pacerPhaseIndex = -1;
}

/* ---------------- Timers ---------------- */

function startSessionTimer() {
  sessionStartMs = Date.now();
  if (timerInterval !== null) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    $('session-timer').textContent = fmtClock(
      Math.floor((Date.now() - sessionStartMs) / 1000)
    );
  }, 500);
}

// The protocol gives no settling duration, so instead of a countdown to
// an invented number we show elapsed settling time, counting up.
function startSettlingTimer() {
  settlingStartMs = Date.now();
  if (settlingInterval !== null) clearInterval(settlingInterval);
  $('settling-countdown').textContent = '0s';
  settlingInterval = setInterval(() => {
    $('settling-countdown').textContent =
      Math.floor((Date.now() - settlingStartMs) / 1000) + 's';
  }, 500);
}

function stopTimers() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (settlingInterval !== null) {
    clearInterval(settlingInterval);
    settlingInterval = null;
  }
  sessionStartMs = null;
  settlingStartMs = null;
  stopPacer();
}

/* ---------------- Result ---------------- */

function renderResult(msg) {
  const before = msg.before || {};
  const after = msg.after || {};

  $('result-breathing-before').textContent = fmt(before.breathingRate);
  $('result-breathing-after').textContent = fmt(after.breathingRate);
  $('result-blinks-before').textContent = fmt(before.blinkRate);
  $('result-blinks-after').textContent = fmt(after.blinkRate);
  $('result-pulse-before').textContent = fmt(before.pulseRate);
  $('result-pulse-after').textContent = fmt(after.pulseRate);

  // Plain-language summary, built only from numbers the server sent.
  const parts = [];

  if (before.breathingRate != null && after.breathingRate != null) {
    if (after.breathingRate < before.breathingRate) {
      parts.push('Your breathing slowed from ' + fmt(before.breathingRate) +
        ' to ' + fmt(after.breathingRate) + ' breaths per minute.');
    } else if (after.breathingRate > before.breathingRate) {
      parts.push('Your breathing quickened a little, from ' + fmt(before.breathingRate) +
        ' to ' + fmt(after.breathingRate) + ' breaths per minute.');
    } else {
      parts.push('Your breathing rate stayed at ' + fmt(after.breathingRate) +
        ' breaths per minute.');
    }
  }

  if (before.blinkRate != null && after.blinkRate != null &&
      after.blinkRate > before.blinkRate) {
    parts.push('You blinked more often afterwards — ' + fmt(after.blinkRate) +
      ' blinks a minute, up from ' + fmt(before.blinkRate) + '.');
  }

  if (before.pulseRate != null && after.pulseRate != null &&
      after.pulseRate < before.pulseRate) {
    parts.push('Your pulse eased from ' + fmt(before.pulseRate) +
      ' to ' + fmt(after.pulseRate) + ' beats per minute.');
  }

  $('summary-line').textContent = parts.length > 0
    ? parts.join(' ')
    : 'One minute of slow breathing, done. Your numbers are above.';

  const seconds = msg.exerciseSeconds || EXERCISE_SECONDS;
  $('result-note').textContent =
    'Measured after a ' + seconds + '-second box-breathing exercise. ' +
    'Small changes are normal — the habit matters more than any single session.';
}

/* ---------------- Buttons ---------------- */

$('btn-start').addEventListener('click', () => {
  if (!send({ type: 'start' })) {
    // Socket not open yet — send as soon as it connects.
    pendingStart = true;
    $('connection-note').hidden = false;
    if (!socket || socket.readyState === WebSocket.CLOSED) connect();
  }
});

$('btn-exercise').addEventListener('click', () => send({ type: 'start-exercise' }));
$('btn-exercise-anyway').addEventListener('click', () => send({ type: 'start-exercise' }));

function stopSession() {
  send({ type: 'stop' });
  // The server answers with {"type":"status","state":"idle"}, which
  // returns us to the consent screen. If the socket is already gone,
  // go back ourselves.
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    socketWanted = false;
    setState('idle');
    socketWanted = true;
  }
}

$('btn-stop-dashboard').addEventListener('click', stopSession);
$('btn-stop-exercise').addEventListener('click', stopSession);
$('btn-stop-result').addEventListener('click', stopSession);

$('btn-measure-again').addEventListener('click', () => {
  resetDashboard();
  send({ type: 'start' });
});

$('btn-try-again').addEventListener('click', () => location.reload());

/* ---------------- Boot ---------------- */

drawTrace(); // empty trace with its "waiting" note
connect();
