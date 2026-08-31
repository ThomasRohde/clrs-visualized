/**
 * The inputs on which the right answer is "there is no answer".
 *
 * Every generator on the site is built to hand its algorithm a well-behaved
 * case — `generateWeightedDigraph` guarantees no negative cycle, `lup-solve`
 * generates a diagonally dominant matrix — which is what makes the traces
 * worth stepping through, and also means the random sweep in
 * algorithms.test.ts never reaches the branches below. But the custom-input
 * box does: a reader can type `1-2:-1, 2-1:-1` into an all-pairs player, or a
 * singular matrix into either LUP player, and what the player says then is a
 * claim about the mathematics.
 *
 * So these are the cases the *reader* can produce and the generator cannot.
 * Each one asserts the same two things: the run reaches a terminal state that
 * names the failure, and it does not also present a result as if the failure
 * had not happened.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import {
  resultOf,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphInput,
  type Step,
} from '../src/algorithms/types.ts';

function moduleFor(id: string): AlgorithmModule {
  const algo = ALGORITHMS.find((a) => a.id === id);
  assert.ok(algo, `${id} is not in the registry`);
  return algo;
}

/** Runs the module's own verifier, which is the contract the player relies on. */
function assertVerifies(algo: AlgorithmModule, input: AlgorithmInput): Step[] {
  const trace = algo.record(structuredClone(input));
  const complaint = resultOf(algo).verify?.(input, trace) ?? null;
  assert.equal(complaint, null, `${algo.id}: ${complaint}`);
  return trace.steps as Step[];
}

/** `1 → 2 → 1`, each edge costing −1: the smallest negative-weight cycle. */
const TWO_CYCLE: GraphInput = {
  kind: 'graph',
  n: 2,
  edges: [
    { u: 1, v: 2, w: -1 },
    { u: 2, v: 1, w: -1 },
  ],
  directed: true,
  source: 1,
};

test('the all-pairs players accept the two-vertex negative cycle as an edge list', () => {
  // The reader's route into these branches is the input box, so the box has
  // to let the graph through — a parser that refused it would make the fix
  // below unreachable.
  for (const id of ['johnson', 'floyd-warshall']) {
    const parsed = moduleFor(id).input!.parse!('1-2:-1, 2-1:-1');
    assert.ok('value' in parsed, `${id} refused the negative cycle: ${JSON.stringify(parsed)}`);
    assert.deepEqual(parsed.value, {
      ...TWO_CYCLE,
      sink: 2,
    });
  }
});

test('Johnson stops at Bellman-Ford rather than reweighting a graph that has no potential', () => {
  const johnson = moduleFor('johnson');
  const trace = johnson.record(structuredClone(TWO_CYCLE));

  const last = trace.steps.at(-1)!;
  assert.equal(trace.output?.negativeCycle, 1, 'the run did not report a negative-weight cycle');
  assert.equal(trace.output?.dijkstras, 0, 'Dijkstra ran on a graph it is not allowed');
  assert.equal(
    (last.hi as { matrix?: unknown }).matrix,
    undefined,
    'a distance matrix was returned for a graph that has no shortest paths',
  );
  assert.match(last.note, /negative-weight cycle/);

  // Nothing may have been reweighted: every edge still carries the weight it
  // was given, which is what the last snapshot has to show.
  assert.equal(last.data?.kind, 'graph');
  const weights = (last.data as { edges: Array<{ weight?: number | string }> }).edges
    .map((e) => e.weight)
    .filter((w) => w !== 0);
  assert.deepEqual(weights, [-1, -1], 'the edges were reweighted before the cycle was found');

  assertVerifies(johnson, TWO_CYCLE);
});

test('Johnson still runs Dijkstra on a graph whose negative edges are safe', () => {
  const johnson = moduleFor('johnson');
  const safe: GraphInput = {
    kind: 'graph',
    n: 3,
    edges: [
      { u: 1, v: 2, w: -2 },
      { u: 2, v: 3, w: 3 },
      { u: 3, v: 1, w: 4 },
    ],
    directed: true,
    source: 1,
  };
  const trace = johnson.record(structuredClone(safe));
  assert.equal(trace.output?.negativeCycle, 0, 'a safe graph was reported as having a cycle');
  assert.equal(trace.output?.dijkstras, 3);
  assertVerifies(johnson, safe);
});
