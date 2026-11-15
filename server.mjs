// BreathBreak — local server.
//
// Runs the Presage SmartSpectra SDK on the local camera, streams the
// decoded metrics to the page over WebSocket, and walks one session
// through its phases:
//
//   idle -> starting -> measuring (60s) -> ready
//     -> exercising (64s = 4 box-breathing cycles) -> settling (30s) -> done
//
// Privacy design, enforced here rather than promised in prose:
// - The server binds to 127.0.0.1 only; nothing leaves this computer.
// - The SDK runs with telemetry OFF. Per Presage's docs, all metric
//   computation happens on-device; the SDK contacts Presage only to
//   authenticate the API key.
// - No video frame, metric, or reading is ever written to disk. All
//   history lives in memory and is wiped when the session stops.
// - The camera is released the moment a session ends (Stop, or the
//   result screen) — it never keeps running in the background.
// - The app never shows a number it did not measure: a missing metric
//   is null on the wire, and the page renders it as "—".
//
// Usage: SMARTSPECTRA_API_KEY=... npm start, then open
// http://localhost:3000 (see README.md and .env.example).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import {
  SmartSpectraSDK,
  CameraSelection,
  MetricType,
  ValidationCode,
  SmartSpectraErrorCode,
  decodeMetrics,
} from '@smartspectra/node-sdk';

import { extractReadings, BlinkTracker, SampleWindow } from './src/metrics.js';
import { assessBaseline } from './src/thresholds.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const API_KEY = process.env.SMARTSPECTRA_API_KEY || process.env.PRESAGE_API_KEY || '';

// Phase lengths.
const MEASURING_SECONDS = 60;
const EXERCISE_SECONDS = 64; // 4 full box-breathing cycles x 16s
const SETTLING_SECONDS = 30;

// How often the server pushes metrics to the page. The SDK emits much
// faster; 2 Hz is plenty for a dashboard and keeps the page calm.
const BROADCAST_MS = 500;
// A metric older than this is stale — report null, never a frozen number.
const STALE_AFTER_MS = 3000;

// Request only what the page displays. (Requesting an Unavailable metric
// makes start() fail — see the SDK metrics guide.)
const REQUESTED_METRICS = [
  MetricType.BREATHING_RATE,
  MetricType.CHEST_BREATHING, // upper trace, for the live breathing waveform
  MetricType.PULSE_RATE,
  MetricType.BLINKING,
  MetricType.TALKING, // breathing rate is invalid while talking; say so
];

// Friendly fallback text for validation codes, used when the SDK's own
// hint is empty. (The SDK usually supplies a hint; these are a backstop.)
const VALIDATION_FRIENDLY = {
  [ValidationCode.kNoFaceFound]: 'No face in view — sit in front of the camera.',
  [ValidationCode.kMultipleFacesFound]: 'More than one face in view — the measurement needs just you.',
  [ValidationCode.kFaceNotCentered]: 'Move so your face is centred in the frame.',
  [ValidationCode.kFaceSizeOutOfRange]: 'Move closer to or further from the camera.',
  [ValidationCode.kTooDark]: 'Too dark — add light in front of you.',
  [ValidationCode.kTooBright]: 'Too bright — reduce the light behind you.',
  [ValidationCode.kChestNotVisible]: 'Move back a little so your chest is in view.',
  [ValidationCode.kCameraTuning]: 'Camera is adjusting…',
  [ValidationCode.kFrameRateTooLow]: 'Camera frame rate is too low.',
  [ValidationCode.kExcessiveMotion]: 'Try to sit still for a moment.',
  [ValidationCode.kFaceTooClose]: 'Move a little further from the camera.',
  [ValidationCode.kFaceTooFar]: 'Move a little closer to the camera.',
  [ValidationCode.kFaceTooHigh]: 'Move down a little in the frame.',
  [ValidationCode.kFaceTooLow]: 'Move up a little in the frame.',
  [ValidationCode.kFaceNotForward]: 'Face the camera directly.',
};

function friendlyError(code, message) {
  switch (code) {
    case SmartSpectraErrorCode.kAuthenticationFailed:
      return 'The API key was rejected. Check SMARTSPECTRA_API_KEY in your .env file.';
    case SmartSpectraErrorCode.kInputUnavailable:
      return 'No camera available. Plug in a webcam or check the camera permission, then try again.';
    case SmartSpectraErrorCode.kNetworkError:
      return "Couldn't reach Presage to check the API key — check your internet connection.";
    case SmartSpectraErrorCode.kConfigurationFailed:
      return 'The SDK rejected the requested metrics (configuration error). Please report this as a bug.';
    case SmartSpectraErrorCode.kCreditExhausted:
      return 'The Presage trial credit is exhausted.';
    case SmartSpectraErrorCode.kMetricNotAuthorized:
      return 'This API key is not authorized for one of the requested metrics.';
    default:
      return message ? `SmartSpectra error (${code}): ${message}` : `SmartSpectra error (${code}).`;
  }
}

// ---------------------------------------------------------------------------
// Session — one SDK instance, one set of in-memory history, one phase machine.
// ---------------------------------------------------------------------------

class Session {
  constructor(broadcast) {
    this.broadcast = broadcast; // (object) => void — send to all WS clients
    this.state = 'idle';
    this.sdk = null;
    this.timers = [];
    this.broadcastTimer = null;
    this.decodeWarned = false;

    // Latest readings (null = not yet measured / stale).
    this.latest = {
      breathingRate: null,
      pulseRate: null,
      breathTrace: null,
      blinking: null,
      talking: null,
      validation: { code: ValidationCode.kOk, hint: 'Signal looks good' },
    };
    this.lastMetricsAt = 0;
    this.lastValidationAt = 0;

    // In-memory history, wiped on stop. Never written to disk.
    this.blinks = new BlinkTracker();
    this.breathingSamples = new SampleWindow();
    this.pulseSamples = new SampleWindow();

    // Phase timestamps (ms since epoch).
    this.measuringStart = 0;
    this.measuringEnd = 0;
    this.settlingStart = 0;
    this.settlingEnd = 0;
    this.baseline = null;
  }

  setState(state, detail) {
    this.state = state;
    this.broadcast({ type: 'status', state, detail });
    console.log(`[session] ${state}${detail ? ` — ${detail}` : ''}`);
  }

  fail(code, message) {
    this.failWithMessage(String(code), friendlyError(code, message));
  }

  failWithMessage(code, message) {
    this.clearTimers();
    this.stopBroadcastLoop();
    this.destroySdk().catch(() => {});
    this.setState('error', message);
    this.broadcast({ type: 'error', code, message });
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  later(ms, fn) {
    const t = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t);
      fn();
    }, ms);
    this.timers.push(t);
  }

  async start() {
    if (this.state !== 'idle' && this.state !== 'done') {
      this.broadcast({ type: 'status', state: this.state });
      return;
    }
    if (!API_KEY) {
      this.failWithMessage(
        'missing_api_key',
        'No API key. Add SMARTSPECTRA_API_KEY to your .env file (see README.md).'
      );
      return;
    }

    this.setState('starting', 'Starting the camera…');

    // Fail fast with a clear message when there is no camera at all.
    let cameras = [];
    try {
      cameras = SmartSpectraSDK.availableCameras();
    } catch {
      cameras = [];
    }
    if (cameras.length === 0) {
      this.fail(
        SmartSpectraErrorCode.kInputUnavailable,
        'No camera was found on this computer.'
      );
      return;
    }

    // Fresh history for a fresh session.
    this.blinks.reset();
    this.breathingSamples.clear();
    this.pulseSamples.clear();
    this.baseline = null;
    this.lastMetricsAt = 0;
    this.lastValidationAt = 0;
    this.latest = {
      breathingRate: null,
      pulseRate: null,
      breathTrace: null,
      blinking: null,
      talking: null,
      validation: { code: ValidationCode.kOk, hint: 'Signal looks good' },
    };

    try {
      this.sdk = new SmartSpectraSDK({
        apiKey: API_KEY,
        requestedMetrics: REQUESTED_METRICS,
        enableTelemetry: false,
      });

      this.sdk.on('metrics', (buf) => this.onMetrics(buf));
      this.sdk.on('validationStatus', (code, _ts, hint) => this.onValidation(code, hint));
      this.sdk.on('processingStatus', (status) => {
        if (status === 5) this.fail(SmartSpectraErrorCode.kProcessingFailed, 'The SDK entered an error state.');
      });
      this.sdk.on('error', (code, message) => this.fail(code, message));

      // Note: no checkDeviceReadiness() call here. It needs a camera
      // selected first and reports device capacity, not key validity —
      // start() below is the authoritative gate: it validates the API key
      // and surfaces kAuthenticationFailed for a bad one.
      this.sdk.useCamera(CameraSelection.default);
      this.sdk.start();
    } catch (err) {
      const code = err && typeof err.code === 'number' ? err.code : SmartSpectraErrorCode.kProcessingFailed;
      this.fail(code, err && err.message ? err.message : 'Could not start the SDK.');
      return;
    }

    this.measuringStart = Date.now();
    this.setState('measuring', 'Measuring — sit still, face the camera, and breathe normally.');
    this.startBroadcastLoop();

    // Watchdog A: the pipeline is dead if nothing at all arrives within
    // 20 seconds (no camera stream, no auth). Fail loudly instead of
    // showing "warming up" forever.
    this.later(20_000, () => {
      if (this.state !== 'measuring' && this.state !== 'starting') return;
      if (this.lastMetricsAt === 0 && this.lastValidationAt === 0) {
        this.failWithMessage(
          'no_signal',
          "The camera session didn't start — no signal arrived within 20 seconds. Check the camera and the API key, then try again."
        );
      }
    });
    // Watchdog B: the camera is streaming (validation events arrive) but
    // no measurements come through — the usual cause is a rejected API
    // key, but the user may also just not be in frame yet. Warn, don't fail.
    this.later(90_000, () => {
      if (this.state !== 'measuring') return;
      if (this.lastMetricsAt === 0 && this.lastValidationAt > 0) {
        this.broadcast({
          type: 'status',
          state: 'measuring',
          detail: 'Still waiting for measurements — make sure your face is in frame and well lit. If it is, the API key may be invalid.',
        });
      }
    });

    this.later(MEASURING_SECONDS * 1000, () => this.finishMeasuring());
  }

  onMetrics(buf) {
    let decoded;
    try {
      decoded = decodeMetrics(buf);
    } catch {
      return;
    }
    if (Buffer.isBuffer(decoded)) {
      if (!this.decodeWarned) {
        this.decodeWarned = true;
        console.warn('[session] decodeMetrics returned a raw Buffer; metrics skipped.');
      }
      return;
    }
    const readings = extractReadings(decoded);
    const now = Date.now();
    this.lastMetricsAt = now;

    // Only confident samples enter the history: a breathing or pulse value
    // with confidence 0 comes from an incomplete window and means nothing.
    if (readings.breathingRate && readings.breathingRate.confidence > 0) {
      this.latest.breathingRate = readings.breathingRate;
      this.breathingSamples.add(readings.breathingRate.value, now);
    }
    if (readings.pulseRate && readings.pulseRate.confidence > 0) {
      this.latest.pulseRate = readings.pulseRate;
      this.pulseSamples.add(readings.pulseRate.value, now);
    }
    if (readings.breathTrace !== null) this.latest.breathTrace = readings.breathTrace;
    if (readings.blinking !== null) {
      this.latest.blinking = readings.blinking;
      this.blinks.observe(readings.blinking, now);
    }
    if (readings.talking !== null) this.latest.talking = readings.talking;
  }

  onValidation(code, hint) {
    this.lastValidationAt = Date.now();
    this.latest.validation = {
      code,
      hint: hint || VALIDATION_FRIENDLY[code] || 'Adjust your position for a clearer signal',
    };
  }

  startBroadcastLoop() {
    this.stopBroadcastLoop();
    this.broadcastTimer = setInterval(() => this.broadcastMetrics(), BROADCAST_MS);
  }

  stopBroadcastLoop() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  broadcastMetrics() {
    if (this.state === 'idle' || this.state === 'error') return;
    const now = Date.now();
    const stale = now - this.lastMetricsAt > STALE_AFTER_MS || this.lastMetricsAt === 0;
    const msg = {
      type: 'metrics',
      t: now,
      breathingRate: stale ? null : this.latest.breathingRate,
      pulseRate: stale ? null : this.latest.pulseRate,
      // Blink rate needs a full 60-second window before it means anything.
      blinkRate: now - this.measuringStart >= 60_000 ? this.blinks.ratePerMinute(now) : null,
      blinksTotal: this.blinks.total,
      breathTrace: stale ? null : this.latest.breathTrace,
      talking: stale ? false : Boolean(this.latest.talking),
      validation: this.latest.validation,
    };
    this.broadcast(msg);
  }

  finishMeasuring() {
    if (this.state !== 'measuring') return;
    this.measuringEnd = Date.now();
    const breathingRate = this.breathingSamples.averageBetween(this.measuringStart, this.measuringEnd);
    const pulseRate = this.pulseSamples.averageBetween(this.measuringStart, this.measuringEnd);
    const blinkRate = this.blinks.countInRange(this.measuringStart, this.measuringEnd);
    // The measuring window is 60s, so the blink count IS the per-minute rate.
    this.baseline = { breathingRate, pulseRate, blinkRate };
    const { nudge, reasons } = assessBaseline(this.baseline);
    this.broadcast({ type: 'baseline', ...this.baseline, nudge, reasons });
    this.setState('ready', 'Baseline ready.');
  }

  startExercise() {
    if (this.state !== 'ready') return;
    this.setState('exercising', 'Follow the circle — breathe in, hold, breathe out, hold.');
    this.later(EXERCISE_SECONDS * 1000, () => this.finishExercise());
  }

  finishExercise() {
    if (this.state !== 'exercising') return;
    this.settlingStart = Date.now();
    this.setState('settling', 'Measuring how your breathing settles…');
    this.later(SETTLING_SECONDS * 1000, () => this.finishSettling());
  }

  async finishSettling() {
    if (this.state !== 'settling') return;
    this.settlingEnd = Date.now();
    const afterBreathing = this.breathingSamples.averageBetween(this.settlingStart, this.settlingEnd);
    const afterPulse = this.pulseSamples.averageBetween(this.settlingStart, this.settlingEnd);
    // Blink rate over the 30-second settling window, scaled to per-minute.
    const afterBlinks =
      (this.blinks.countInRange(this.settlingStart, this.settlingEnd) * 60) / SETTLING_SECONDS;
    this.broadcast({
      type: 'result',
      before: this.baseline,
      after: { breathingRate: afterBreathing, pulseRate: afterPulse, blinkRate: afterBlinks },
      exerciseSeconds: EXERCISE_SECONDS,
    });
    this.setState('done', 'Done — the camera is off.');
    // The session is over: release the camera now, don't let it idle.
    await this.destroySdk();
    this.stopBroadcastLoop();
  }

  async destroySdk() {
    if (!this.sdk) return;
    const sdk = this.sdk;
    this.sdk = null;
    // A hung native teardown must never hang the server: race each step
    // against a timeout and move on. (Observed in testing: stop/destroy
    // can block when the pipeline never reached a running state.)
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise.then(() => true).catch(() => false),
        new Promise((resolve) => setTimeout(() => {
          console.warn(`[session] ${label} timed out after ${ms}ms; continuing.`);
          resolve(false);
        }, ms)),
      ]);
    await withTimeout(Promise.resolve().then(() => sdk.stopAsync()), 10_000, 'stopAsync');
    await withTimeout(Promise.resolve().then(() => sdk.destroy()), 10_000, 'destroy');
  }

  async stop() {
    this.clearTimers();
    this.stopBroadcastLoop();
    await this.destroySdk();
    // Wipe all in-memory history.
    this.blinks.reset();
    this.breathingSamples.clear();
    this.pulseSamples.clear();
    this.baseline = null;
    this.lastMetricsAt = 0;
    this.lastValidationAt = 0;
    this.setState('idle');
  }
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server (localhost only).
// ---------------------------------------------------------------------------

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
};

const server = http.createServer((req, res) => {
  const entry = STATIC_FILES[req.url];
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const filePath = path.join(PUBLIC_DIR, entry.file);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Could not read file');
      return;
    }
    res.writeHead(200, { 'Content-Type': entry.type });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

const session = new Session(broadcast);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'status', state: session.state }));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'start') session.start().catch((err) => console.error('[session] start failed:', err));
    else if (msg.type === 'start-exercise') session.startExercise();
    else if (msg.type === 'stop') session.stop().catch((err) => console.error('[session] stop failed:', err));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`BreathBreak running at http://${HOST}:${PORT}`);
  if (!API_KEY) {
    console.warn('No API key found. Add SMARTSPECTRA_API_KEY to your .env file (see README.md).');
  }
});

process.on('SIGINT', async () => {
  console.log('\nShutting down…');
  await session.stop().catch(() => {});
  server.close(() => process.exit(0));
});
