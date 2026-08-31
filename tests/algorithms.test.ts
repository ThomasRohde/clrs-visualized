/**
 * Correctness tests for every registered algorithm.
 *
 * These run in plain Node with no browser and no build step — the recorders
 * are deliberately free of DOM dependencies so they can be tested like any
 * other pure function. Run with: npm test
 *
 * When you add an algorithm, add it to ALGORITHMS in registry.ts and it is
 * automatically covered by everything below.
 *
 * Not everything in the book sorts, so the structural claim comes from the
 * module: `result.kind` says whether a correct run sorts, permutes, preserves
 * or rewrites the array, and `result.verify` carries anything sharper — that
 * RANDOMIZED-SELECT returned the right order statistic, that the priority
 * queue still holds a max-heap. Everything else here is universal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import {
  resultOf,
  type AlgorithmInput,
  type AlgorithmModule,
  type Step,
} from '../src/algorithms/types.ts';

function randomArray(n: number, min: number, max: number): number[] {
  const span = Math.max(1, max - min + 1);
  return Array.from({ length: n }, () => min + Math.floor(Math.random() * span));
}

/**
 * An input the module will accept.
 *
 * A module that declares `generate` owns the shape of its own input — a graph
 * is not a list of numbers between two bounds — so it is asked rather than
 * told. Everything else gets numbers in whatever key range it declared.
 */
function inputFor(algo: AlgorithmModule, n: number): AlgorithmInput {
  if (algo.input?.generate) return algo.input.generate(n);
  return randomArray(n, algo.input?.min ?? 1, algo.input?.max ?? 99);
}

/** Edge-case inputs, clamped into the module's declared key range. */
function edgeCases(algo: AlgorithmModule, n: number): Array<[string, number[]]> {
  const min = algo.input?.min ?? 1;
  const max = algo.input?.max ?? 99;
  const at = (k: number) => Math.min(max, Math.max(min, k));
  return [
    ['sorted', Array.from({ length: n }, (_, i) => at(min + i))],
    ['reversed', Array.from({ length: n }, (_, i) => at(min + n - 1 - i))],
    ['all-equal', Array.from({ length: n }, () => at(7))],
    ['two-values', Array.from({ length: n }, (_, i) => at(i % 2 === 0 ? min : min + 1))],
    ['single', [at(42)]],
  ];
}

function isSorted(a: number[]): boolean {
  for (let i = 1; i < a.length; i++) if (a[i - 1]! > a[i]!) return false;
  return true;
}

function sameMultiset(a: number[], b: number[]): boolean {
  const x = [...a].sort((m, n) => m - n);
  const y = [...b].sort((m, n) => m - n);
  return JSON.stringify(x) === JSON.stringify(y);
}

/**
 * Assert whatever this module claims a correct run produces.
 *
 * `transforms` makes no structural claim at all — a priority queue inserts
 * keys that were never in the input — so for it this is `verify` or nothing.
 */
function assertCorrect(algo: AlgorithmModule, input: AlgorithmInput, label: string): void {
  const contract = resultOf(algo);
  // Cloned, not sliced: the input is no longer necessarily an array, and a
  // recorder that mutates what it was handed must not poison the next trial.
  const trace = algo.record(structuredClone(input));
  const { finalArray } = trace;
  const where = `${algo.id} on ${label} ${JSON.stringify(input)} produced ${JSON.stringify(finalArray)}`;

  // Three of the four kinds are claims about the final array, so a trace that
  // has none cannot be making one. A tree or a graph algorithm is
  // `transforms`, and its `verify` carries the whole contract.
  if (contract.kind !== 'transforms') {
    assert.ok(
      finalArray,
      `${where}: result.kind "${contract.kind}" is a claim about the final array, but the ` +
        `trace returned none — declare "transforms" and a verify instead`,
    );
    // …and a claim about the final array is also a claim about the input
    // being one. A graph module that forgot to declare `transforms` would
    // otherwise be compared against an empty list and pass.
    assert.ok(
      Array.isArray(input),
      `${where}: result.kind "${contract.kind}" compares against the input array, but this ` +
        `module is run on a structure — declare "transforms" and a verify instead`,
    );
  }
  const asList = Array.isArray(input) ? input : [];

  switch (contract.kind) {
    case 'sorts':
      assert.ok(isSorted(finalArray!), `${where}: not sorted`);
      assert.ok(sameMultiset(asList, finalArray!), `${where}: multiset changed`);
      break;
    case 'permutes':
      assert.ok(sameMultiset(asList, finalArray!), `${where}: not a permutation of the input`);
      break;
    case 'preserves':
      assert.deepEqual(finalArray, asList, `${where}: the array should be left untouched`);
      break;
    case 'transforms':
      break;
  }

  const complaint = contract.verify?.(input, trace) ?? null;
  assert.equal(complaint, null, `${algo.id} on ${label} ${JSON.stringify(input)}: ${complaint}`);
}

const SIZES = [1, 2, 3, 5, 8, 12, 16, 20];
const TRIALS = 15;

for (const algo of ALGORITHMS) {
  test(`${algo.name}: produces a correct result on random arrays`, () => {
    for (const n of SIZES) {
      for (let t = 0; t < TRIALS; t++) {
        assertCorrect(algo, inputFor(algo, n), `n=${n}`);
      }
    }
  });

  test(`${algo.name}: handles sorted, reversed, duplicate and single-value inputs`, () => {
    // "Sorted" and "reversed" are properties of a list of numbers. A module
    // that generates its own input has its own degenerate cases — a path
    // graph, a tree inserted in ascending order — and owes them as a `verify`
    // or a test of its own rather than being handed these.
    if (algo.input?.generate) return;
    for (const [label, input] of edgeCases(algo, 10)) {
      assertCorrect(algo, input, label);
    }
  });

  test(`${algo.name}: every step is well-formed`, () => {
    // Measured from the input the module actually accepted, not from the size
    // asked for: a custom generator is free to round n to something its
    // structure can use.
    const input = inputFor(algo, 12);
    const n = Array.isArray(input)
      ? input.length
      : input.kind === 'graph'
        ? input.n
        : input.text.length;
    const { steps } = algo.record(input);
    assert.ok(steps.length > 0, `${algo.id} recorded no steps`);

    for (const step of steps as Step[]) {
      // Exactly one snapshot per step, and it has to be the one the module's
      // renderer knows how to draw. A module pointed at `tree` that emits
      // bare arrays draws nothing, and the player cannot tell why.
      assert.ok(
        !(step.array && step.data),
        `${algo.id}: step at ${step.proc}:${step.line} carries both an array and a data snapshot`,
      );
      if (algo.visualizer === 'array-bars') {
        assert.ok(
          step.array,
          `${algo.id}: array-bars step at ${step.proc}:${step.line} has no array snapshot`,
        );
        // Index 0 is the unused dummy slot, so a snapshot is always n+1 long.
        assert.equal(
          step.array!.length,
          n + 1,
          `${algo.id}: bad snapshot length at ${step.proc}:${step.line}`,
        );
      } else {
        assert.equal(
          step.data?.kind,
          algo.visualizer,
          `${algo.id}: step at ${step.proc}:${step.line} carries no ${algo.visualizer} snapshot`,
        );
      }

      // Every step must point at a real line of a real procedure, or the
      // pseudocode highlight would silently point nowhere.
      const proc = algo.procedures[step.proc];
      assert.ok(proc, `${algo.id}: step references unknown procedure "${step.proc}"`);
      assert.ok(
        step.line >= 1 && step.line <= proc.lines.length,
        `${algo.id}: ${step.proc} line ${step.line} is out of range (1..${proc.lines.length})`,
      );

      assert.ok(
        typeof step.note === 'string' && step.note.length > 0,
        `${algo.id}: empty narration at ${step.proc}:${step.line}`,
      );
      assert.ok(step.stats.comparisons >= 0 && step.stats.swaps >= 0 && step.stats.writes >= 0);
    }
  });

  test(`${algo.name}: counters never decrease`, () => {
    const { steps } = algo.record(inputFor(algo, 14));
    let prev = { comparisons: 0, swaps: 0, writes: 0 };
    for (const step of steps as Step[]) {
      assert.ok(
        step.stats.comparisons >= prev.comparisons,
        `${algo.id}: comparison count went backwards`,
      );
      assert.ok(step.stats.swaps >= prev.swaps, `${algo.id}: swap count went backwards`);
      assert.ok(step.stats.writes >= prev.writes, `${algo.id}: write count went backwards`);
      prev = step.stats;
    }
  });

  test(`${algo.name}: the last step agrees with the returned array`, () => {
    const { steps, finalArray } = algo.record(inputFor(algo, 12));
    const last = steps[steps.length - 1]!;
    if (!finalArray) {
      // Nothing to agree with. A structure algorithm's last step is the only
      // record of its result, so it had better have one.
      assert.ok(last.data, `${algo.id}: returned no final array and no final snapshot either`);
      return;
    }
    assert.deepEqual(
      last.array?.slice(1),
      finalArray,
      `${algo.id}: last step disagrees with the returned array`,
    );
  });

  test(`${algo.name}: every aux row it declares is one a step can fill`, () => {
    // A declared row with no matching `hi.aux` key renders as a permanently
    // empty strip — silent, and only visible in the browser.
    const rows = algo.aux ?? [];
    if (rows.length === 0) return;
    const { steps } = algo.record(inputFor(algo, 12));
    const seen = new Set<string>();
    for (const step of steps as Step[]) {
      const aux = (step.hi as { aux?: Record<string, unknown> }).aux;
      if (aux) for (const key of Object.keys(aux)) seen.add(key);
    }
    for (const row of rows) {
      assert.ok(
        seen.has(row.key),
        `${algo.id}: declares aux row "${row.key}" but no step ever fills it`,
      );
    }
  });

  test(`${algo.name}: declares complete metadata`, () => {
    const a: AlgorithmModule = algo;
    assert.ok(a.id && a.name && a.visualizer);
    assert.ok(a.procOrder.length > 0, `${a.id}: procOrder is empty`);
    for (const name of a.procOrder) {
      const proc = a.procedures[name];
      assert.ok(proc, `${a.id}: procOrder names "${name}" but procedures has no such key`);
      assert.equal(
        proc.indent.length,
        proc.lines.length,
        `${a.id}: ${name} has ${proc.indent.length} indents for ${proc.lines.length} lines`,
      );
    }
    // Every procedure must be displayed, or its highlighted lines are drawn
    // into a panel the reader cannot see.
    for (const name of Object.keys(a.procedures)) {
      assert.ok(
        a.procOrder.includes(name),
        `${a.id}: procedure "${name}" is missing from procOrder`,
      );
    }

    // The four universal rows. `stable`/`inPlace` are optional by design, but
    // an empty string is a half-filled field rather than a deliberate omission.
    for (const key of ['best', 'average', 'worst', 'space'] as const) {
      assert.ok(a.complexity[key], `${a.id}: complexity.${key} is missing`);
    }
    for (const key of ['stable', 'inPlace'] as const) {
      if (key in a.complexity) {
        assert.ok(a.complexity[key], `${a.id}: complexity.${key} is present but empty`);
      }
    }
    for (const [term, value] of a.complexity.extra ?? []) {
      assert.ok(term && value, `${a.id}: complexity.extra has an empty row`);
    }

    // `transforms` waives every structural assertion, so without a verify it
    // would be tested for nothing but well-formedness.
    const contract = resultOf(a);
    if (contract.kind === 'transforms') {
      assert.ok(
        typeof contract.verify === 'function',
        `${a.id}: result.kind "transforms" makes no structural claim, so it must supply a verify`,
      );
    }
  });
}

test('registry: ids are unique', () => {
  const ids = ALGORITHMS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate algorithm id in registry');
});

test('quicksort degrades on sorted input, merge sort does not', () => {
  const n = 16;
  const sorted = Array.from({ length: n }, (_, i) => i + 1);
  const shuffled = randomArray(n, 1, 99);

  const qs = ALGORITHMS.find((a) => a.id === 'quicksort')!;
  const ms = ALGORITHMS.find((a) => a.id === 'merge-sort')!;

  const qSorted = qs.record(sorted.slice()).steps.at(-1)!.stats.comparisons;
  const qRandom = qs.record(shuffled.slice()).steps.at(-1)!.stats.comparisons;
  assert.ok(
    qSorted > qRandom,
    'quicksort on sorted input should cost more comparisons than on random input',
  );

  const mSorted = ms.record(sorted.slice()).steps.at(-1)!.stats.comparisons;
  const mRandom = ms.record(shuffled.slice()).steps.at(-1)!.stats.comparisons;
  assert.equal(
    mSorted,
    mRandom,
    'merge sort comparison count should not depend on the input order',
  );
});

test('randomization frees quicksort from its dependence on the input order', () => {
  const n = 18;
  const sorted = Array.from({ length: n }, (_, i) => i + 1);
  const rq = ALGORITHMS.find((a) => a.id === 'randomized-quicksort')!;
  const qs = ALGORITHMS.find((a) => a.id === 'quicksort')!;

  const deterministic = qs.record(sorted.slice()).steps.at(-1)!.stats.comparisons;

  // Any single run can be unlucky, so compare the median of several against
  // the deterministic version's guaranteed worst case.
  const runs = Array.from(
    { length: 21 },
    () => rq.record(sorted.slice()).steps.at(-1)!.stats.comparisons,
  ).sort((a, b) => a - b);
  const median = runs[Math.floor(runs.length / 2)]!;

  assert.ok(
    median < deterministic,
    `randomized quicksort should beat the sorted-input worst case (median ${median} vs ${deterministic})`,
  );
});

test('LUP decomposition counts its permutation vector in the space it claims', () => {
  // Sharing one matrix between L and U is what makes the factoring "in
  // place", and it says nothing about π — which is a separate array of n
  // entries and is the part of the answer the caller actually keeps. The
  // trace is what settles the fact, so the claim is checked against it.
  const lup = ALGORITHMS.find((a) => a.id === 'lup-decomposition')!;
  const n = 4;
  const input = [4, 1, 2, 3, 1, 5, 1, 2, 2, 1, 6, 1, 3, 2, 1, 7];
  const last = lup.record(input).steps.at(-1)!;
  const pi = (last.hi as { permutation?: number[] }).permutation;

  assert.ok(pi, 'the run returned no permutation, so there is nothing to size');
  assert.equal(pi.length, n, 'π holds one entry per row');
  assert.match(
    lup.complexity.space,
    /Θ\(n\)/,
    `lup-decomposition returns ${pi.length} extra entries, so its space cannot be constant: ` +
      `"${lup.complexity.space}"`,
  );
});
