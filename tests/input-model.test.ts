/**
 * The input model (E4): a module can own the shape of its own input.
 *
 * `min`/`max` describe a list of numbers between two bounds, which is not
 * what a graph is. So `InputSpec` also carries hooks — `generate`, `parse`,
 * `size` — and the player defers to them when they are there and behaves
 * exactly as it always did when they are not.
 *
 * Both halves matter. A hook that is quietly ignored looks like a module bug
 * rather than a player bug, and the default path is what all 15 shipped
 * algorithms still run on.
 *
 * `player.ts` reaches the DOM only inside `AlgorithmPlayer`, so these three
 * free functions import cleanly in Node.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { inputSize, makeInput, parseCustomInput } from '../src/visualizers/player.ts';
import type { GraphInput, InputSpec } from '../src/algorithms/types.ts';

test('with no spec, the player generates what it always did', () => {
  const input = makeInput(10) as number[];
  assert.equal(input.length, 10);
  for (const v of input) {
    assert.ok(Number.isInteger(v) && v >= 5 && v <= 78, `${v} is outside the default 5‥78`);
  }
});

test('value bounds still come from the module', () => {
  const spec: InputSpec = { min: 0, max: 9 };
  const input = makeInput(30, spec) as number[];
  for (const v of input) assert.ok(v >= 0 && v <= 9, `${v} is outside the declared 0‥9`);
});

test('a generate hook replaces the uniform draw outright', () => {
  const spec: InputSpec = { min: 5, max: 78, generate: (n) => Array.from({ length: n }, () => 1) };
  assert.deepEqual(makeInput(4, spec), [1, 1, 1, 1], 'generate must win over min/max');
});

test('a parse hook replaces the comma-separated reader', () => {
  const spec: InputSpec = {
    parse: (text) => (text === 'ok' ? { value: [1, 2] } : { error: 'nope' }),
  };
  assert.deepEqual(parseCustomInput('ok', spec), { value: [1, 2] });
  assert.deepEqual(parseCustomInput('anything else', spec), { error: 'nope' });
  // Without a hook, the numeric reader is unchanged — bounds and all.
  assert.deepEqual(parseCustomInput('3, 4, 5', { min: 1, max: 9 }), { value: [3, 4, 5] });
  assert.deepEqual(parseCustomInput('3, 40', { min: 1, max: 9 }), {
    error: 'Use whole numbers from 1 to 9.',
  });
});

test('size defaults to length, and a module can say otherwise', () => {
  assert.equal(inputSize([1, 2, 3]), 3);
  assert.equal(inputSize([1, 2, 3], { min: 0 }), 3);
  // Two numbers per item is how chapter 15 and 17 encode a pair in a list.
  assert.equal(inputSize([1, 2, 3, 4, 5, 6], { size: (input: number[]) => input.length / 2 }), 3);
});

test('a structured input is measured without a length', () => {
  // Phase D widened `AlgorithmInput`, and a graph has no `.length` to fall
  // back on. A module is still expected to declare `size`; this is what keeps
  // the readout honest when it does not, instead of printing undefined.
  const g: GraphInput = { kind: 'graph', n: 6, edges: [{ u: 1, v: 2 }], directed: false };
  assert.equal(inputSize(g), 6);
  assert.equal(inputSize(g, { size: () => 99 }), 99, 'a declared size still wins');
});
