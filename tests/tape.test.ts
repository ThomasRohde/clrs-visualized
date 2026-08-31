/**
 * The trace tape must survive the step payload growing past arrays (E7).
 *
 * `classify` is the tape's whole judgement: it reads counter deltas, the
 * procedure name and `hi.range`, none of which are array-shaped. That claim
 * is easy to make and easy to break — one `step.array.length` slipped into
 * the classifier and every structure renderer would lose its tape, silently,
 * because a tape that classifies everything as `rest` still draws.
 *
 * So this runs the classifier over a trace with no arrays in it at all and
 * checks it still tells the four classes apart, and separately checks that
 * stripping the arrays out of a real trace changes nothing.
 *
 * `tape.ts` touches the DOM only inside the `Tape` constructor, which is why
 * the module imports cleanly in Node.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import { classify } from '../src/visualizers/tape.ts';
import { createRecorder, type Stats, type Step } from '../src/algorithms/types.ts';

/** A step carrying a tree snapshot and no array, built the way a recorder would. */
function treeStep(
  proc: string,
  line: number,
  stats: Stats,
  hi: Record<string, unknown>,
  note: string,
): Step {
  return {
    proc,
    line,
    data: { kind: 'tree', root: 'a', nodes: [{ id: 'a', keys: [1] }] },
    hi,
    stats: { ...stats },
    note,
  };
}

test('the tape classifies a trace that has no arrays in it', () => {
  const s = { comparisons: 0, swaps: 0, writes: 0 };
  const first = treeStep('TREE-INSERT', 1, s, {}, 'start');

  s.comparisons += 1;
  const compared = treeStep('TREE-INSERT', 3, s, {}, 'compare');

  s.writes += 1;
  const written = treeStep('TREE-INSERT', 5, s, {}, 'write');

  const quiet = treeStep('TREE-INSERT', 6, s, {}, 'bookkeeping');
  const elsewhere = treeStep('TREE-MINIMUM', 1, s, { range: [1, 6] }, 'different procedure');
  // Same procedure, different owned range: the tape's other structural beat.
  const rescoped = treeStep('TREE-MINIMUM', 2, s, { range: [2, 4] }, 'narrowed');

  assert.equal(classify(first, undefined), 'scope', 'the first step is always a new scope');
  assert.equal(classify(compared, first), 'look');
  assert.equal(classify(written, compared), 'move');
  assert.equal(classify(quiet, written), 'rest');
  assert.equal(classify(elsewhere, quiet), 'scope');
  assert.equal(classify(rescoped, elsewhere), 'scope');
});

test('classification of a real trace does not depend on its arrays', () => {
  for (const algo of ALGORITHMS) {
    // A module that generates its own input is asked for one: a graph cannot
    // be built out of twelve numbers between two bounds.
    const input =
      algo.input?.generate?.(12) ??
      Array.from({ length: 12 }, (_, i) => ((i * 7) % 12) + (algo.input?.min ?? 1));
    const { steps } = algo.record(input);
    const stripped: Step[] = steps.map((step) => {
      const copy: Step = { ...step };
      delete copy.array;
      return copy;
    });

    for (let i = 0; i < steps.length; i++) {
      assert.equal(
        classify(stripped[i]!, stripped[i - 1]),
        classify(steps[i]!, steps[i - 1]),
        `${algo.id}: step ${i} classifies differently once its array is removed — ` +
          `the tape has picked up an array-shaped dependency`,
      );
    }
  }
});

test('emit snapshots a structure instead of copying it by reference', () => {
  // The array path slices; the data path has to clone just as hard, or every
  // earlier step shows the tree as it ended up.
  const { steps, emit } = createRecorder();
  const tree = { kind: 'tree' as const, root: 'a', nodes: [{ id: 'a', keys: [1] as number[] }] };

  emit('TREE-INSERT', 1, tree, {}, 'one key');
  tree.nodes[0]!.keys.push(2);
  tree.nodes.push({ id: 'b', keys: [3] });
  emit('TREE-INSERT', 2, tree, {}, 'two nodes');

  const first = steps[0]!.data;
  assert.equal(first?.kind, 'tree');
  assert.deepEqual(first, { kind: 'tree', root: 'a', nodes: [{ id: 'a', keys: [1] }] });
  assert.ok(!steps[0]!.array, 'a structure step must not also carry an array');
});
