/**
 * The canvas's text alternative has to carry the state, not name the picture.
 *
 * WCAG 1.1.1 is satisfied by a text alternative that "serves the equivalent
 * purpose", and every canvas on the site used to carry a fixed label — "Floyd
 * Warshall visualization" — which serves the purpose of a filename. What is
 * being taught is the matrix, and the matrix existed only as pixels.
 *
 * These tests hold `describeStep` to the two things that make a description
 * equivalent rather than decorative: it must contain the **values on screen**,
 * and it must **change when the picture changes**. A description that passed
 * the first and failed the second would be a label with extra words.
 *
 * `describeStep` is DOM-free, which is what lets that be checked here over
 * every registered algorithm — all six renderer families — rather than by
 * looking at one player in a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import { describeStep } from '../src/visualizers/describe.ts';
import { legendFor } from '../src/visualizers/roles.ts';
import { RENDERER_LOADERS } from '../src/visualizers/renderers.ts';
import type { Renderer } from '../src/visualizers/renderers.ts';
import type {
  AlgorithmInput,
  AlgorithmModule,
  Step,
  VisualizerKind,
} from '../src/algorithms/types.ts';

/**
 * The renderer a module draws with, loaded for real.
 *
 * The description names what the *renderer* paints, so testing it against a
 * hand-written role map would be testing the wrong thing — a highlight key
 * the renderer stopped reading would still be announced.
 */
const renderers = new Map<VisualizerKind, Renderer>(
  await Promise.all(
    (Object.entries(RENDERER_LOADERS) as Array<[VisualizerKind, () => Promise<Renderer>]>).map(
      async ([kind, load]) => [kind, await load()] as [VisualizerKind, Renderer],
    ),
  ),
);

function inputFor(algo: AlgorithmModule, n: number): AlgorithmInput {
  if (algo.input?.generate) return algo.input.generate(n);
  const min = algo.input?.min ?? 1;
  const max = algo.input?.max ?? 99;
  const span = Math.max(1, max - min + 1);
  return Array.from({ length: n }, () => min + Math.floor(Math.random() * span));
}

const describeAll = (algo: AlgorithmModule, steps: Step[]): string[] => {
  const renderer = renderers.get(algo.visualizer)!;
  return steps.map((s) =>
    describeStep(s, { legend: legendFor(algo.id), roles: renderer.roles(s), aux: algo.aux }),
  );
};

for (const algo of ALGORITHMS) {
  test(`${algo.name}: every step has a text alternative carrying its state`, () => {
    const steps = algo.record(inputFor(algo, 8)).steps as Step[];
    const said = describeAll(algo, steps);

    for (let i = 0; i < steps.length; i++) {
      const text = said[i]!;
      assert.ok(text.length > 0, `${algo.id}: step ${i} describes as nothing`);
      // A description that is only the emphasis, with no structure in front of
      // it, is the failure mode a new renderer would fall into.
      assert.ok(/\d/.test(text), `${algo.id}: step ${i} names no values at all — "${text}"`);
      // Long enough to be a description, short enough to be listened to.
      assert.ok(
        text.length < 4000,
        `${algo.id}: step ${i} describes in ${text.length} characters, which is a wall of speech`,
      );
    }
  });

  test(`${algo.name}: the text alternative distinguishes every distinct picture`, () => {
    const renderer = renderers.get(algo.visualizer)!;
    const steps = algo.record(inputFor(algo, 8)).steps as Step[];
    const said = describeAll(algo, steps);

    // "It changes often enough" would be a threshold, and a threshold is a
    // guess. The real claim is that the description loses nothing: two steps
    // read out the same words exactly when they draw the same picture. Two
    // steps of heapsort that compare and decline to swap really are the same
    // picture, and a description that invented a difference there would be
    // describing the narration instead.
    const hi = (step: Step) => step.hi as Record<string, unknown>;
    const drawn = (step: Step) =>
      JSON.stringify([
        step.array ?? step.data,
        [...renderer.roles(step)].sort(),
        hi(step).aux,
        hi(step).range,
        hi(step).heapSize,
        hi(step).scope,
        hi(step).scopeLabel,
        hi(step).pointers,
      ]);

    const pictures = new Map<string, number>();
    for (let i = 0; i < steps.length; i++) {
      const key = drawn(steps[i]!);
      if (!pictures.has(key)) pictures.set(key, i);
    }
    const words = new Map<string, number>();
    for (let i = 0; i < said.length; i++) if (!words.has(said[i]!)) words.set(said[i]!, i);

    assert.ok(pictures.size > 1, `${algo.id}: nothing on screen ever changes`);
    assert.equal(
      words.size,
      pictures.size,
      `${algo.id}: ${pictures.size} distinct pictures but ${words.size} distinct descriptions — ` +
        'something on screen is not being said',
    );
  });
}

test('an array algorithm names every value in the chart', () => {
  const insertion = ALGORITHMS.find((a) => a.id === 'insertion-sort')!;
  const input = [31, 7, 64, 12, 90, 5];
  const steps = insertion.record([...input]).steps as Step[];

  const bars = renderers.get('array-bars')!;
  const ctx = (step: Step) => ({
    legend: legendFor('insertion-sort'),
    roles: bars.roles(step),
    aux: insertion.aux,
  });
  for (const step of [steps[0]!, steps.at(-1)!]) {
    const text = describeStep(step, ctx(step));
    for (const value of step.array!.slice(1)) {
      assert.ok(
        text.includes(String(value)),
        `the value ${value} is on screen but not in "${text}"`,
      );
    }
  }
  // …and the last one describes a sorted array, which is the result itself.
  const last = describeStep(steps.at(-1)!, ctx(steps.at(-1)!));
  assert.match(last, /5, 7, 12, 31, 64 and 90/);
});

test('a grid algorithm names its cells by row and column, not by internal id', () => {
  const fw = ALGORITHMS.find((a) => a.id === 'floyd-warshall')!;
  const steps = fw.record(fw.input!.generate!(4)).steps as Step[];
  const said = describeAll(fw, steps).join(' ');

  assert.match(said, /Table of 4 rows and 4 columns/);
  assert.match(said, /row \d+, column \d+/, 'cells are announced by their raw "r,c" ids');
  assert.ok(!/: 0,0\b/.test(said), 'a zero-based internal id leaked into the description');
});

test('a graph algorithm names vertices, edges and weights', () => {
  const dijkstra = ALGORITHMS.find((a) => a.id === 'dijkstra')!;
  const steps = dijkstra.record(dijkstra.input!.generate!(6)).steps as Step[];
  const said = describeAll(dijkstra, steps).join(' ');

  assert.match(said, /graph of \d+ vertices and \d+ edges/);
  assert.match(said, /weight \d+/);
  assert.match(said, /vertex \d+/, 'highlighted vertices are announced by their raw ids');
});

test('the description speaks the legend’s words, not the role names', () => {
  const quicksort = ALGORITHMS.find((a) => a.id === 'quicksort')!;
  const meanings = legendFor('quicksort').map(([, meaning]) => meaning);
  const said = describeAll(quicksort, quicksort.record([5, 3, 9, 1, 7]).steps as Step[]).join(' ');

  assert.ok(
    meanings.some((m) => said.includes(m)),
    `none of the key's wordings appear in the description: ${meanings.join(' / ')}`,
  );
  // The internal names would be a second vocabulary for the same six states.
  assert.ok(!/\blook:/.test(said) && !/\bmove:/.test(said), 'a raw role name was announced');
});

test('every renderer family is covered, so a seventh cannot ship undescribed', () => {
  const kinds = new Set(ALGORITHMS.map((a) => a.visualizer));
  assert.deepEqual(
    [...kinds].sort(),
    ['array-bars', 'cells', 'graph', 'grid', 'plot', 'tree'],
    'the set of renderer families changed; describe.ts needs a branch for the new one',
  );
});

test('sentinels are spoken, not printed as symbols', () => {
  const bellman = ALGORITHMS.find((a) => a.id === 'bellman-ford')!;
  const step = (bellman.record(bellman.input!.generate!(6)).steps as Step[])[0]!;
  const first = describeStep(step, {
    legend: legendFor('bellman-ford'),
    roles: renderers.get('graph')!.roles(step),
    aux: bellman.aux,
  });
  assert.ok(!first.includes('Infinity'), 'a raw JavaScript Infinity reached the description');
});
