// Unit tests for src/metrics.js.
//
// NOTE ON TEST DOUBLES: the decoded-metric payloads below are synthetic
// fixtures built ONLY to exercise the extraction and counting logic.
// They are test doubles — the app itself never sees mock data, and no
// mock path exists anywhere in server.mjs or src/. Every number the app
// shows comes from the real SDK.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  latestSample,
  extractReadings,
  BlinkTracker,
  SampleWindow,
  BLINK_REFRACTORY_MS,
} from '../src/metrics.js';

test('latestSample returns the last element, or null', () => {
  assert.equal(latestSample([{ value: 1 }, { value: 2 }]).value, 2);
  assert.equal(latestSample([]), null);
  assert.equal(latestSample(undefined), null);
  assert.equal(latestSample(null), null);
});

function fullPayload() {
  // TEST DOUBLE — shape mirrors a real decoded `metrics` event payload.
  return {
    breathing: {
      rate: [
        { value: 14.2, confidence: 0.8, stable: true, timestamp: 1000 },
        { value: 15.1, confidence: 0.9, stable: true, timestamp: 2000 },
      ],
      upperTrace: [{ value: 0.42, confidence: 0.9, timestamp: 2000 }],
    },
    cardio: {
      pulseRate: [{ value: 72, confidence: 0.95, stable: true, timestamp: 2000 }],
    },
    face: {
      blinking: [{ detected: true, timestamp: 2000 }],
      talking: [{ detected: false, timestamp: 2000 }],
    },
  };
}

test('extractReadings pulls the latest samples from a full payload', () => {
  const r = extractReadings(fullPayload());
  assert.deepEqual(r.breathingRate, { value: 15.1, confidence: 0.9 });
  assert.deepEqual(r.pulseRate, { value: 72, confidence: 0.95 });
  assert.equal(r.breathTrace, 0.42);
  assert.equal(r.blinking, true);
  assert.equal(r.talking, false);
});

test('extractReadings returns nulls for missing groups and empty series', () => {
  const r = extractReadings({ breathing: { rate: [] }, cardio: {} });
  assert.equal(r.breathingRate, null);
  assert.equal(r.pulseRate, null);
  assert.equal(r.breathTrace, null);
  assert.equal(r.blinking, null);
  assert.equal(r.talking, null);
});

test('extractReadings tolerates null, undefined, and raw Buffers', () => {
  for (const input of [null, undefined, Buffer.from([1, 2, 3]), 'nope', 42]) {
    const r = extractReadings(input);
    assert.equal(r.breathingRate, null);
    assert.equal(r.pulseRate, null);
    assert.equal(r.breathTrace, null);
    assert.equal(r.blinking, null);
    assert.equal(r.talking, null);
  }
});

test('extractReadings ignores non-numeric values', () => {
  const r = extractReadings({
    breathing: { rate: [{ value: 'fast', confidence: 1 }] },
    cardio: { pulseRate: [{ value: null, confidence: 1 }] },
    face: { blinking: [{ detected: 'yes' }] },
  });
  assert.equal(r.breathingRate, null);
  assert.equal(r.pulseRate, null);
  assert.equal(r.blinking, null);
});

test('BlinkTracker counts one blink per false->true edge', () => {
  const t = new BlinkTracker();
  // One blink spans several frames of `true`; it must count once.
  t.observe(false, 0);
  t.observe(true, 100);
  t.observe(true, 133);
  t.observe(true, 166);
  t.observe(false, 200);
  assert.equal(t.total, 1);
  // A second blink well after the refractory window counts again.
  t.observe(true, 1000);
  t.observe(false, 1100);
  assert.equal(t.total, 2);
});

test('BlinkTracker refractory window swallows flicker', () => {
  const t = new BlinkTracker();
  t.observe(false, 0);
  t.observe(true, 100);
  t.observe(false, 150);
  // A second edge inside the refractory window is the same blink.
  t.observe(true, 100 + BLINK_REFRACTORY_MS - 50);
  assert.equal(t.total, 1);
  // An edge after the window is a new blink.
  t.observe(false, 1000);
  t.observe(true, 1000 + BLINK_REFRACTORY_MS + 50);
  assert.equal(t.total, 2);
});

test('BlinkTracker ignores null samples', () => {
  const t = new BlinkTracker();
  t.observe(null, 0);
  t.observe(undefined, 100);
  assert.equal(t.total, 0);
});

test('BlinkTracker ratePerMinute counts the last 60 seconds only', () => {
  const t = new BlinkTracker();
  t.observe(false, 0);
  t.observe(true, 1000);
  t.observe(false, 1100);
  t.observe(true, 30_000);
  t.observe(false, 30_100);
  assert.equal(t.ratePerMinute(30_100), 2);
  // 61 seconds after the first blink, only the second remains in window.
  assert.equal(t.ratePerMinute(62_000), 1);
});

test('BlinkTracker countInRange respects its bounds', () => {
  const t = new BlinkTracker();
  for (const at of [1000, 5000, 9000]) {
    t.observe(false, at - 100);
    t.observe(true, at);
    t.observe(false, at + 100);
  }
  assert.equal(t.countInRange(0, 10_000), 3);
  assert.equal(t.countInRange(2000, 8000), 1);
  assert.equal(t.countInRange(20_000, 30_000), 0);
});

test('SampleWindow averages only the samples inside the range', () => {
  const w = new SampleWindow();
  w.add(10, 1000);
  w.add(20, 2000);
  w.add(30, 3000);
  assert.equal(w.averageBetween(1000, 3000), 20);
  assert.equal(w.averageBetween(1500, 3000), 25);
  assert.equal(w.averageBetween(5000, 6000), null);
});

test('SampleWindow ignores non-finite values', () => {
  const w = new SampleWindow();
  w.add(NaN, 1000);
  w.add(Infinity, 2000);
  w.add('fast', 3000);
  assert.equal(w.averageBetween(0, 4000), null);
  w.add(12, 4000);
  assert.equal(w.averageBetween(0, 5000), 12);
});
