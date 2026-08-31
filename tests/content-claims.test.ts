/**
 * Claims the prose makes about the code.
 *
 * A chapter can say anything, and nothing in the build notices when what it
 * says stops being true. These tests cover the sentences where that has
 * actually happened: a comparison table that credited four players with a
 * behaviour two of them do not implement. The rule they encode is narrow on
 * purpose — assert the *fact* against the module, and assert the prose does
 * not make the blanket claim — because a test that pinned the exact wording
 * would fail on every edit and be deleted within a month.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import type { AlgorithmModule, GraphInput } from '../src/algorithms/types.ts';

const source = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const chapter = (slug: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../src/content/chapters/${slug}.mdx`, import.meta.url)),
    'utf8',
  );

const moduleFor = (id: string): AlgorithmModule => {
  const algo = ALGORITHMS.find((a) => a.id === id);
  assert.ok(algo, `${id} is not in the registry`);
  return algo;
};

/** `1 → 2 → 1`, each edge costing −1. */
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

/** Does this recorder come out of a negative-cycle graph saying so? */
function reportsNegativeCycle(id: string): boolean {
  const trace = moduleFor(id).record(structuredClone(TWO_CYCLE));
  return (trace.output?.negativeCycle ?? 0) > 0;
}

test('the all-pairs chapter describes negative weights per algorithm, not for all four', () => {
  const mdx = chapter('all-pairs-shortest-paths');

  // The two that do detect one, and the one that takes weights and does not.
  assert.ok(reportsNegativeCycle('floyd-warshall'), 'floyd-warshall no longer reports a cycle');
  assert.ok(reportsNegativeCycle('johnson'), 'johnson no longer reports a cycle');
  assert.ok(
    !reportsNegativeCycle('apsp-matrix-multiply'),
    'repeated squaring now detects a negative cycle — say so in the chapter',
  );
  // …and the one that has no weights to be negative in the first place.
  assert.ok(
    !/weight/i.test(moduleFor('transitive-closure').input?.note ?? ''),
    'transitive closure now takes weights — the chapter says it does not',
  );

  // The claim the chapter used to make. Any sentence sweeping all four
  // players into one statement about weights is wrong about at least two.
  const sweeping = /\ball four\b[^.]*\b(negative|weight)/i;
  assert.ok(
    !sweeping.test(mdx),
    'the chapter attributes weight behaviour to all four players; two of them do not have it',
  );
});

test('the home page states its scope instead of promising the whole book', () => {
  const index = source('src/pages/index.astro');

  // The count is the registry's, not a number someone typed — which is the
  // only way it stays true as algorithms land.
  assert.match(
    index,
    /\{ALGORITHMS\.length\}/,
    'the hero states a coverage figure that is not derived from the registry',
  );
  assert.ok(
    !/every algorithm in the book/i.test(index),
    'the hero promises every algorithm in the book; the registry holds the headline ones',
  );

  // …and the README's generated block says the same thing, so a reader who
  // arrives from GitHub is told the same scope.
  const readme = source('README.md');
  assert.ok(
    readme.includes(`**${ALGORITHMS.length} algorithms**`),
    'the README contents block is out of date — run `npm run readme`',
  );
  assert.match(
    readme,
    /headline algorithms/,
    'the README states a count without saying it is the headline algorithms',
  );
});
