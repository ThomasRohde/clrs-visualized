/**
 * E8: the zero baseline, and the promise that came with it.
 *
 * Until Problem 4-1 needed a maximum subarray, every value on this site was
 * positive and `array-bars` measured a bar from the bottom of the plot. A
 * negative value drew as a 3px stub — visually identical to an ∞ sentinel,
 * with its true value printed above it — so the renderer had to learn an axis
 * that starts below zero.
 *
 * **The promise is that nothing else moved.** Forty players shipped against
 * the old arithmetic, and a screenshot comparison cannot check that: most of
 * them generate a random input, so two runs draw different pictures for
 * reasons that have nothing to do with this change. So the arithmetic is out
 * here as a function instead, and the old formula is written out below and
 * asserted against it directly.
 *
 * The second half is the new behaviour, which has no old formula to compare
 * with and is checked against what the picture has to mean: bars hang from the
 * zero line, nothing escapes the plot, and the zero line is where zero is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { barSpan, zeroLine } from '../src/visualizers/array-bars.ts';

// The geometry draw() works in. Numbers chosen to look like a real canvas
// rather than to be round, so a coincidence cannot pass.
const H = 420;
const PAD_BOTTOM = 22;
const PLOT_H = 340;
const BASELINE = H - PAD_BOTTOM;

/** What array-bars computed for every player that shipped before E8. */
function before(value: number, maxValue: number): { top: number; bottom: number } {
  const finite = Number.isFinite(value);
  const h = finite ? Math.min(PLOT_H, Math.max(3, (value / maxValue) * PLOT_H)) : 3;
  return { top: BASELINE - h, bottom: BASELINE };
}

test('with no negative value, every bar is exactly where it always was', () => {
  const maxValue = 78;
  // The whole range a chart can hold, plus the four cases with their own
  // branch: zero, one, the tallest bar, and both sentinels.
  const values = [0, 1, 2, 5, 13, 40, 77, 78, Infinity, -Infinity];

  for (const value of values) {
    for (const minValue of [0, undefined]) {
      const now = barSpan(value, maxValue, minValue ?? 0, BASELINE, PLOT_H);
      const then = before(value, maxValue);
      assert.equal(now.top, then.top, `top moved for ${value} (minValue ${minValue})`);
      assert.equal(now.bottom, then.bottom, `bottom moved for ${value} (minValue ${minValue})`);
      assert.equal(now.up, true, `${value} should still rise from the baseline`);
    }
  }
});

test('with no negative value, the zero line is the baseline', () => {
  assert.equal(zeroLine(78, 0, BASELINE, PLOT_H), BASELINE);
});

test('a negative axis puts zero inside the plot, in proportion', () => {
  // Values run −20‥60, so zero sits a quarter of the way up.
  const y = zeroLine(60, -20, BASELINE, PLOT_H);
  assert.equal(y, BASELINE - 0.25 * PLOT_H);
  assert.ok(y < BASELINE && y > BASELINE - PLOT_H, 'the zero line is inside the plot');
});

test('a negative value hangs below the zero line, a positive one rises from it', () => {
  const maxValue = 60;
  const axisLo = -20;
  const zero = zeroLine(maxValue, axisLo, BASELINE, PLOT_H);

  const up = barSpan(45, maxValue, axisLo, BASELINE, PLOT_H);
  assert.equal(up.up, true);
  assert.equal(up.bottom, zero, 'a positive bar stands on the zero line');
  assert.ok(up.top < zero, 'and rises above it');

  const down = barSpan(-12, maxValue, axisLo, BASELINE, PLOT_H);
  assert.equal(down.up, false);
  assert.equal(down.top, zero, 'a negative bar hangs from the zero line');
  assert.ok(down.bottom > zero, 'and reaches below it');

  // Same magnitude, same length: the axis is linear through zero, so a −20 and
  // a 20 are mirror images. A reader compares them by eye and has to be right.
  const plus = barSpan(20, maxValue, axisLo, BASELINE, PLOT_H);
  const minus = barSpan(-20, maxValue, axisLo, BASELINE, PLOT_H);
  assert.equal(
    Math.round(plus.bottom - plus.top),
    Math.round(minus.bottom - minus.top),
    'equal magnitudes drew unequal bars',
  );
});

test('zero draws as a stub on the line rather than as nothing', () => {
  const span = barSpan(0, 60, -20, BASELINE, PLOT_H);
  assert.equal(span.bottom - span.top, 3, 'a zero value should still be visible');
});

test('no bar escapes the plot, whatever the axis', () => {
  for (const [maxValue, axisLo] of [
    [60, -20],
    [78, 0],
    [5, -40],
    [1, -1],
  ] as Array<[number, number]>) {
    for (const value of [axisLo, 0, maxValue, Infinity, -Infinity]) {
      const { top, bottom } = barSpan(value, maxValue, axisLo, BASELINE, PLOT_H);
      assert.ok(
        top >= BASELINE - PLOT_H - 0.001,
        `${value} on ${axisLo}‥${maxValue} runs off the top of the plot`,
      );
      assert.ok(
        bottom <= BASELINE + 0.001,
        `${value} on ${axisLo}‥${maxValue} runs off the bottom of the plot`,
      );
    }
  }
});
