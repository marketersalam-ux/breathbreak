// Nudge thresholds for BreathBreak.
//
// These are general-wellness reference ranges, not medical thresholds:
// - A typical adult resting breathing rate is 12–20 breaths per minute.
// - A typical blink rate is 15–20 blinks per minute; it commonly falls
//   well below that during concentrated screen work.
// BreathBreak only ever suggests a breathing break. It never diagnoses
// anything, and every nudge explains itself in plain language.

export const FAST_BREATHING_THRESHOLD = 20; // breaths/min — above the typical resting range
export const LOW_BLINK_THRESHOLD = 10; // blinks/min — below a relaxed pace

function formatRate(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Decide whether the baseline measurements justify suggesting a breather.
 * @param {{breathingRate: number|null, blinkRate: number|null}} baseline
 * @returns {{nudge: boolean, reasons: string[]}}
 */
export function assessBaseline({ breathingRate = null, blinkRate = null } = {}) {
  const reasons = [];

  if (breathingRate !== null && breathingRate > FAST_BREATHING_THRESHOLD) {
    reasons.push(
      `Your breathing is running at ${formatRate(breathingRate)} breaths a minute — faster than a typical resting pace of 12–20.`
    );
  }

  if (blinkRate !== null && blinkRate < LOW_BLINK_THRESHOLD) {
    reasons.push(
      `You're blinking about ${formatRate(blinkRate)} times a minute — well below the usual 15–20, which is common when you stare at a screen.`
    );
  }

  return { nudge: reasons.length > 0, reasons };
}
