// Unit tests for src/thresholds.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import { assessBaseline, FAST_BREATHING_THRESHOLD, LOW_BLINK_THRESHOLD } from '../src/thresholds.js';

test('no nudge when both readings are in the relaxed range', () => {
  const { nudge, reasons } = assessBaseline({ breathingRate: 15, blinkRate: 16 });
  assert.equal(nudge, false);
  assert.deepEqual(reasons, []);
});

test('nudge on fast breathing only', () => {
  const { nudge, reasons } = assessBaseline({ breathingRate: 23, blinkRate: 16 });
  assert.equal(nudge, true);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /23/);
  assert.match(reasons[0], /breathing/);
});

test('nudge on low blink rate only', () => {
  const { nudge, reasons } = assessBaseline({ breathingRate: 15, blinkRate: 6 });
  assert.equal(nudge, true);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /6/);
  assert.match(reasons[0], /blink/);
});

test('nudge with two reasons when both readings are off', () => {
  const { nudge, reasons } = assessBaseline({ breathingRate: 24, blinkRate: 5 });
  assert.equal(nudge, true);
  assert.equal(reasons.length, 2);
});

test('boundary values do not nudge (thresholds are exclusive)', () => {
  const atThreshold = assessBaseline({
    breathingRate: FAST_BREATHING_THRESHOLD,
    blinkRate: LOW_BLINK_THRESHOLD,
  });
  assert.equal(atThreshold.nudge, false);

  const justOver = assessBaseline({
    breathingRate: FAST_BREATHING_THRESHOLD + 0.1,
    blinkRate: LOW_BLINK_THRESHOLD,
  });
  assert.equal(justOver.nudge, true);

  const justUnder = assessBaseline({
    breathingRate: FAST_BREATHING_THRESHOLD,
    blinkRate: LOW_BLINK_THRESHOLD - 0.1,
  });
  assert.equal(justUnder.nudge, true);
});

test('missing readings never nudge on their own', () => {
  assert.equal(assessBaseline({ breathingRate: null, blinkRate: null }).nudge, false);
  assert.equal(assessBaseline({}).nudge, false);
  assert.equal(assessBaseline().nudge, false);
  // One missing reading doesn't block the other from nudging.
  assert.equal(assessBaseline({ breathingRate: 25, blinkRate: null }).nudge, true);
  assert.equal(assessBaseline({ breathingRate: null, blinkRate: 4 }).nudge, true);
});
