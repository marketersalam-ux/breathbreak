// Pure helpers for turning decoded SmartSpectra payloads into the readings
// BreathBreak shows. No I/O, no SDK calls — fully unit-tested.
//
// The SDK delivers each metric as a repeated time-series of samples; for a
// current reading we take the latest sample's `value`.
// See https://smartspectra.presagetech.com/docs/nodejs/metrics

/**
 * Last element of a sample series, or null when there is none.
 * @param {Array|undefined} series
 * @returns {object|null}
 */
export function latestSample(series) {
  if (!Array.isArray(series) || series.length === 0) return null;
  const last = series[series.length - 1];
  return last === undefined ? null : last;
}

/**
 * Pull the readings BreathBreak uses out of one decoded `metrics` event
 * payload. Returns nulls for anything absent — never throws, never
 * invents a value. A raw Buffer (decoder not registered) yields all nulls.
 * @param {object|Buffer|null|undefined} decoded
 * @returns {{breathingRate: {value: number, confidence: number}|null, pulseRate: {value: number, confidence: number}|null, breathTrace: number|null, blinking: boolean|null, talking: boolean|null}}
 */
export function extractReadings(decoded) {
  const out = {
    breathingRate: null,
    pulseRate: null,
    breathTrace: null,
    blinking: null,
    talking: null,
  };
  if (!decoded || typeof decoded !== 'object' || Buffer.isBuffer(decoded)) return out;

  const breathing = latestSample(decoded.breathing?.rate);
  if (breathing && typeof breathing.value === 'number') {
    out.breathingRate = {
      value: breathing.value,
      confidence: typeof breathing.confidence === 'number' ? breathing.confidence : 0,
    };
  }

  const pulse = latestSample(decoded.cardio?.pulseRate);
  if (pulse && typeof pulse.value === 'number') {
    out.pulseRate = {
      value: pulse.value,
      confidence: typeof pulse.confidence === 'number' ? pulse.confidence : 0,
    };
  }

  const trace = latestSample(decoded.breathing?.upperTrace);
  if (trace && typeof trace.value === 'number') out.breathTrace = trace.value;

  const blink = latestSample(decoded.face?.blinking);
  if (blink && typeof blink.detected === 'boolean') out.blinking = blink.detected;

  const talk = latestSample(decoded.face?.talking);
  if (talk && typeof talk.detected === 'boolean') out.talking = talk.detected;

  return out;
}

// Blink counting: the SDK reports blinking as a per-frame boolean.
// One blink = one false → true edge. A short refractory window guards
// against a single blink flickering the detector on and off.
export const BLINK_REFRACTORY_MS = 200;
export const BLINK_WINDOW_MS = 60_000;

export class BlinkTracker {
  constructor() {
    this.blinkTimes = []; // timestamps (ms) of counted blinks, oldest first
    this.prevDetected = false;
    this.lastBlinkAt = -Infinity;
    this.totalCount = 0;
  }

  /**
   * Feed one blink-detection sample.
   * @param {boolean|null|undefined} detected
   * @param {number} nowMs — timestamp in milliseconds
   */
  observe(detected, nowMs) {
    if (detected === null || detected === undefined) return;
    if (detected && !this.prevDetected && nowMs - this.lastBlinkAt >= BLINK_REFRACTORY_MS) {
      this.blinkTimes.push(nowMs);
      this.lastBlinkAt = nowMs;
      this.totalCount += 1;
    }
    this.prevDetected = detected;
    this.prune(nowMs);
  }

  prune(nowMs) {
    const cutoff = nowMs - BLINK_WINDOW_MS;
    while (this.blinkTimes.length > 0 && this.blinkTimes[0] < cutoff) {
      this.blinkTimes.shift();
    }
  }

  /** Blinks in the last 60 seconds — which is the per-minute rate. */
  ratePerMinute(nowMs) {
    this.prune(nowMs);
    return this.blinkTimes.length;
  }

  /** Blinks whose timestamps fall inside [startMs, endMs]. */
  countInRange(startMs, endMs) {
    return this.blinkTimes.filter((t) => t >= startMs && t <= endMs).length;
  }

  get total() {
    return this.totalCount;
  }

  reset() {
    this.blinkTimes = [];
    this.prevDetected = false;
    this.lastBlinkAt = -Infinity;
    this.totalCount = 0;
  }
}

// A timestamped value store for averaging a metric over a time window.
export class SampleWindow {
  constructor() {
    this.samples = []; // { t, value }, oldest first
  }

  add(value, nowMs) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    this.samples.push({ t: nowMs, value });
    // Bound memory: nothing older than 10 minutes is ever averaged.
    const cutoff = nowMs - 10 * 60 * 1000;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  /** Mean of samples inside [startMs, endMs]; null when there are none. */
  averageBetween(startMs, endMs) {
    const inRange = this.samples.filter((s) => s.t >= startMs && s.t <= endMs);
    if (inRange.length === 0) return null;
    const sum = inRange.reduce((acc, s) => acc + s.value, 0);
    return sum / inRange.length;
  }

  clear() {
    this.samples = [];
  }
}
