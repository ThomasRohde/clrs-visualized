/**
 * The golden queries — what search actually returns, for questions people ask.
 *
 * This is the quality gate, and the only thing keeping the weights in
 * `bm25.ts` honest. Those numbers are unfalsifiable on their own: any set of
 * them produces *an* ordering, and reading them tells you nothing about
 * whether typing "the bad character" finds Boyer-Moore. So the weights are
 * tuned here, against the real corpus, and a change to them either keeps these
 * thirty answers or is a change of mind about what search is for.
 *
 * The bounds are deliberately uneven. Where an exact name was typed the answer
 * is rank 1 and nothing else will do. Where the query is a description —
 * "shortest path negative weights" — the bar is the top three, because the two
 * documents above it are also right and picking between them is taste. A test
 * that demanded rank 1 everywhere would be tuned to itself.
 *
 * Every failure prints the top five, because "expected rank 1, got 4" is not
 * enough to know whether the ranking got worse or the corpus moved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { search } from '../src/search/query.ts';
import type { IndexedDoc } from '../src/search/types.ts';
import { corpus } from './search-corpus.ts';

const { docs, index } = corpus();
const text = docs.map((doc) => doc.text);

const run = (query: string, limit = 30) => search(index, query, { text, limit });

/** Where the first acceptable answer came, and what beat it. */
function rankOf(query: string, hit: (doc: IndexedDoc) => boolean): { at: number; top: string } {
  const results = run(query);
  const at = results.findIndex((result) => hit(index.docs[result.doc]!));
  const top = results
    .slice(0, 5)
    .map((result, i) => `${i + 1}. [${index.docs[result.doc]!.k}] ${index.docs[result.doc]!.t}`)
    .join(' · ');
  return { at: at === -1 ? Infinity : at + 1, top: top || '(nothing)' };
}

function expect(query: string, within: number, want: string, hit: (doc: IndexedDoc) => boolean) {
  const { at, top } = rankOf(query, hit);
  assert.ok(
    at <= within,
    `"${query}" should put ${want} in the top ${within}, got ${at === Infinity ? 'nothing' : `rank ${at}`}.\n    ${top}`,
  );
}

/** A document is the algorithm with this display name. */
const algorithm = (name: string) => (doc: IndexedDoc) => doc.k === 'a' && doc.t === name;
/** …or any document belonging to this chapter. */
const inChapter = (chapter: string) => (doc: IndexedDoc) => doc.c === chapter;
const titled = (title: string) => (doc: IndexedDoc) => doc.t === title;

test('typing an algorithm’s name puts that algorithm first', () => {
  for (const name of [
    'Quicksort',
    'Heapsort',
    'Insertion Sort',
    'Counting Sort',
    'Bucket Sort',
    'Huffman Codes',
    'Topological Sort',
    'Rod Cutting',
    'Suffix Array',
    'Gradient Descent',
    'Ford-Fulkerson',
    'Activity Selection',
    'Longest Common Subsequence',
  ]) {
    expect(name, 1, `the ${name} player`, algorithm(name));
  }
});

test('typing a section’s title puts that section first', () => {
  // The one rule in the ranking that is not BM25 — see TITLE_EXACT in
  // query.ts. Before it, "partition" put §7.1 sixth behind five algorithms
  // that merely mention PARTITION.
  expect('partition', 1, 'the Partitioning section', titled('Partitioning'));
  expect('dynamic programming', 1, 'the chapter', titled('Dynamic Programming'));
  expect('amortized analysis', 1, 'the chapter', titled('Amortized Analysis'));
  expect('np-completeness', 1, 'the chapter', titled('NP-Completeness'));
});

test('a description finds the algorithm it describes', () => {
  expect('shortest path negative weights', 3, 'Bellman-Ford', algorithm('Bellman-Ford'));
  expect('hash collision', 3, 'the hash tables chapter', inChapter('Hash Tables'));
  expect('minimum spanning tree', 3, 'the MST chapter', inChapter('Minimum Spanning Trees'));
  expect('cut vertex bridge', 5, 'Articulation Points', algorithm('Articulation Points'));
  expect('sort in linear time', 5, 'the linear-time chapter', inChapter('Sorting in Linear Time'));
  expect('loop invariant', 3, 'chapter 2', inChapter('Getting Started'));
});

test('the wording of a legend is searchable, and nothing else on the site says it', () => {
  // `roles.ts` is the largest file in the repository and none of it appears in
  // any chapter. Without it in the index these three queries find nothing.
  expect('the bad character', 1, 'Boyer-Moore', algorithm('Boyer-Moore'));
  expect('the witness', 1, 'Miller-Rabin', algorithm('Miller-Rabin'));
  expect(
    'the window this shift is testing',
    3,
    'Boyer-Moore',
    (doc) => doc.c === 'String Matching',
  );
});

test('a pseudocode identifier finds the procedures that use it', () => {
  // EXTRACT-MIN is in no chapter's prose; it is a line of three algorithms.
  const top = run('EXTRACT-MIN', 3).map((result) => index.docs[result.doc]!);
  assert.ok(top.length >= 3, 'EXTRACT-MIN should match several procedures');
  for (const doc of top) {
    assert.equal(doc.k, 'a', `${doc.t} is not a player, so it has no pseudocode to match`);
  }
  const names = top.map((doc) => doc.t);
  assert.ok(
    names.some((name) =>
      ['Huffman Codes', "Prim's Algorithm", "Dijkstra's Algorithm"].includes(name),
    ),
    `EXTRACT-MIN found ${names.join(', ')}`,
  );
  expect('MAX-HEAPIFY', 3, 'a heap player', (doc) => doc.c === 'Heapsort');
});

test('a section reference finds its section', () => {
  expect('§22.3', 1, "Dijkstra's section", (doc) => doc.t.includes('Dijkstra'));
  expect('22.3', 3, "Dijkstra's section", (doc) => doc.t.includes('Dijkstra'));
  expect('section 7.3', 3, 'the randomization section', (doc) =>
    /Moving the worst case/.test(doc.t),
  );
});

test('a compound name is found however it is spelled', () => {
  for (const spelling of ['red black', 'red-black', 'redblack']) {
    expect(spelling, 3, 'the red-black chapter', inChapter('Red-Black Trees'));
  }
  for (const spelling of ['bellman ford', 'bellman-ford', 'bellmanford']) {
    expect(spelling, 3, 'Bellman-Ford', algorithm('Bellman-Ford'));
  }
});

test('the maths is reachable in words', () => {
  // Θ occurs 775 times and never as the letters t-h-e-t-a.
  const top = run('theta n lg n', 5).map((result) => index.docs[result.doc]!);
  assert.ok(top.length > 0, 'spelling out Θ must find something');
  assert.ok(
    top.some((doc) => /lg n/.test(doc.m)),
    `expected a Θ(n lg n) player, got ${top.map((d) => `${d.t} (${d.m})`).join(' · ')}`,
  );
  // …and the two spellings of a logarithm are one term.
  assert.equal(run('n lg n').length, run('n log n').length);
});

test('a half-typed word already finds the whole one', () => {
  // The dictionary holds `partit`; the reader is four keystrokes past it.
  expect('partitio', 3, 'the Partitioning section', titled('Partitioning'));
  expect('quicks', 3, 'Quicksort', algorithm('Quicksort'));
  expect('dijkst', 3, 'Dijkstra', (doc) => doc.t.includes('Dijkstra'));
  // A prefix must not reward a document for holding many unrelated words that
  // happen to start the same way — the expansions are scored max, not sum.
  const broad = run('s', 5).map((result) => index.docs[result.doc]!.t);
  assert.ok(broad.length > 0, 'a single letter should still return something');
});

test('a typo still finds it', () => {
  expect('quicksot', 3, 'Quicksort', algorithm('Quicksort'));
  expect('heapsrot', 3, 'Heapsort', (doc) => doc.c === 'Heapsort');
  expect('dijstra', 5, 'Dijkstra', (doc) => doc.t.includes('Dijkstra'));
});

test('a quoted phrase returns only documents that contain it', () => {
  const phrase = 'final position';
  const withText = search(index, `"${phrase}"`, { text, limit: 50 });
  const withoutText = search(index, `"${phrase}"`, { limit: 50 });

  assert.ok(withText.length > 0, 'the phrase is in the corpus');
  assert.ok(
    withText.length < withoutText.length,
    'quoting must narrow the result set once the text has landed',
  );
  for (const result of withText) {
    const haystack = text[result.doc]!.toLowerCase().replace(/\s+/g, ' ');
    assert.ok(
      haystack.includes(phrase),
      `${index.docs[result.doc]!.t} does not contain the phrase`,
    );
  }
});

test('nothing matched returns nothing, rather than everything', () => {
  assert.deepEqual(run('zzzqqqxyzzy'), []);
  assert.deepEqual(run(''), []);
  assert.deepEqual(run('   '), []);
  assert.deepEqual(run('the and of to'), [], 'a query of pure stopwords has nothing to match');
});

test('results are ordered, capped, and stable', () => {
  const results = run('sort', 10);
  assert.ok(results.length <= 10, 'the limit is a limit');
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1]!.score >= results[i]!.score, 'results must descend by score');
  }
  // Same query, same answer — a tie breaks on book order, not on Map iteration.
  assert.deepEqual(run('sort', 10), results);
});

test('every result can be rendered and followed', () => {
  for (const query of ['quicksort', 'graph', 'the bad character', 'partitio']) {
    for (const result of run(query, 10)) {
      const doc = index.docs[result.doc]!;
      assert.ok(doc.t && doc.u && doc.c, `a result for "${query}" is missing display fields`);
      assert.ok(result.matched.length > 0, `a result for "${query}" has nothing to highlight`);
    }
  }
});
