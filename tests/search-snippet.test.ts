/**
 * Choosing the sentence under a result, and marking it.
 *
 * Two failures here are invisible in a screenshot and obvious to a reader: a
 * window that lands on the fourth repetition of one word instead of the one
 * place where three query words appear together, and a highlight that misses
 * "sorting" because the query said "sort". Both are pinned below.
 *
 * The ranges are offsets into the returned string, ellipses included, so the
 * last test checks them the only way that means anything — by slicing the
 * result with them and looking at the words that come out.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { snippet } from '../src/search/snippet.ts';
import { analyze } from '../src/search/tokenize.ts';

/** What the query engine would hand the snippet: analyzed terms. */
const terms = (query: string): string[] => analyze(query);

const marked = (text: string, query: string, width?: number): string[] => {
  const out = snippet(text, terms(query), width);
  return out.ranges.map(([from, to]) => out.text.slice(from, to));
};

test('the window covers the most distinct query terms, not the most hits', () => {
  const text = [
    'A path is a path is a path, and a path again, path after path.',
    'The rest of this section is filler that exists only to push the two halves',
    'apart by more than one window width, so that a chooser going for raw hit',
    'count and a chooser going for distinct coverage cannot pick the same place.',
    'Here at last a shortest path with negative weights is discussed properly.',
  ].join(' ');

  const out = snippet(text, terms('shortest path negative weights'));
  assert.ok(
    out.text.includes('negative weights'),
    `the window should hold the three-term cluster, got: ${out.text}`,
  );
});

test('a highlight follows the stem, so "sort" marks "sorting"', () => {
  const text = 'Insertion sort is sorting the array, and sorted output is what it returns.';
  assert.deepEqual(marked(text, 'sort'), ['sort', 'sorting', 'sorted']);
});

test('the maths is highlighted through the same folding the index used', () => {
  const text = 'Merge sort runs in Θ(n lg n) time in every case.';
  // Typed as words, matching a document that writes symbols.
  assert.deepEqual(marked(text, 'theta'), ['Θ']);
  // The book writes lg and the reader typed log; the highlight has to know
  // they are one term, exactly as the ranking did.
  assert.ok(marked(text, 'log').includes('lg'));
});

test('a window never starts or ends inside a word', () => {
  const text =
    'Partitioning rearranges the subarray in place and returns the index where the pivot ' +
    'ended up, which is the whole of the procedure and the reason quicksort works at all. ' +
    'Everything after this sentence exists purely so the text runs past one window width.';
  const out = snippet(text, terms('pivot'), 80);

  const body = out.text.replace(/^…|…$/g, '');
  assert.ok(text.includes(body), 'the body must be a verbatim slice of the source');
  const at = text.indexOf(body);
  assert.ok(at === 0 || text[at - 1] === ' ', 'window starts at a word boundary');
  const after = at + body.length;
  assert.ok(after === text.length || text[after] === ' ', 'window ends at a word boundary');
});

test('the window stays inside its width, ellipses aside', () => {
  const text = 'lorem ipsum dolor sit amet '.repeat(60) + 'pivot at the very end';
  for (const width of [60, 120, 220]) {
    const out = snippet(text, terms('pivot'), width);
    const body = out.text.replace(/^…|…$/g, '');
    assert.ok(body.length <= width, `body ${body.length} exceeds width ${width}`);
  }
});

test('short text is returned whole, with no ellipses', () => {
  const text = 'The pivot ends up in its final position.';
  const out = snippet(text, terms('pivot'), 220);
  assert.equal(out.text, text);
});

test('ranges are ordered, non-overlapping, and land on real words', () => {
  const text =
    'The loop invariant holds before the loop, is maintained by each iteration, ' +
    'and says something useful about the loop when it terminates.';
  const out = snippet(text, terms('loop invariant'));

  let previous = -1;
  for (const [from, to] of out.ranges) {
    assert.ok(from >= previous, 'ranges must be in order and must not overlap');
    assert.ok(from < to && to <= out.text.length, 'range must be inside the text');
    assert.match(out.text.slice(from, to), /^[\p{L}\p{N}]+$/u, 'a range must be one whole word');
    previous = to;
  }
  assert.deepEqual(new Set(marked(text, 'loop invariant')), new Set(['loop', 'invariant']));
});

test('with nothing matched, the head of the text is shown unmarked', () => {
  const text = 'A red-black tree is a binary search tree with one extra bit of storage per node. '
    .repeat(6)
    .trim();
  const out = snippet(text, [], 100);
  assert.deepEqual(out.ranges, []);
  assert.ok(out.text.startsWith('A red-black tree'), 'no hits means show the opening');
  assert.ok(out.text.endsWith('…'), 'and say that it was cut');
});

test('whitespace is collapsed, so a snippet is one line', () => {
  const out = snippet('one\n\n  two\tthree   four', terms('three'));
  assert.equal(out.text, 'one two three four');
});
