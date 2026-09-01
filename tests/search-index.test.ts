/**
 * What the index is made of, and what it costs.
 *
 * The coverage half is the mirror of a check `verify:players` already makes at
 * the other end: it fails when an algorithm is registered but embedded in no
 * chapter, and this fails when one is embedded but unfindable. Both exist
 * because an algorithm module has no chapter of its own — the link runs one
 * way, from a chapter's body to an id — so nothing about it is checked by the
 * type system.
 *
 * The budget half is here because a search payload is the one thing on this
 * site that grows silently. A chapter costs its own page; the index costs
 * every reader who opens the dialog. Both figures are printed in the failure
 * message so that raising the ceiling is a decision someone makes rather than
 * a number that drifted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import { ALL_CHAPTERS } from '../src/lib/book.ts';
import { slugify } from '../src/search/slug.ts';
import { extractDocs } from '../src/search/extract.ts';
import { chapterBodies, corpus, readChapters } from './search-corpus.ts';

const source = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

test('every published chapter puts at least one document in the index', () => {
  const { docs } = corpus();
  const covered = new Set(docs.map((doc) => doc.path.replace(/^\/chapters\/|\/.*$/g, '')));
  for (const chapter of readChapters()) {
    assert.ok(covered.has(chapter.slug), `${chapter.slug} contributes no searchable document`);
  }
  // …and nothing invented a chapter that is not in the book.
  const slugs = new Set(ALL_CHAPTERS.map((c) => c.slug));
  for (const slug of covered) assert.ok(slugs.has(slug), `${slug} is not a chapter`);
});

test('a draft contributes nothing, and the build reaches that rule the same way', () => {
  // There are no drafts today, so the fixture is synthetic — the rule is what
  // is being pinned, not the current contents of the directory.
  const docs = extractDocs([
    {
      slug: 'quicksort',
      title: 'Quicksort',
      section: '§7',
      summary: 'Partition around a pivot.',
      body: '## Partitioning\n\nPARTITION picks the last element.\n',
    },
  ]);
  assert.ok(docs.length > 0, 'a published chapter must produce documents');
  assert.equal(
    extractDocs([]).length,
    0,
    'with no chapters there is nothing to index — a draft is filtered before it arrives',
  );

  // The filtering itself belongs to the build. `src/search/corpus.ts` is in
  // the surfaces list in `tests/drafts.test.ts`, which is where the rule that
  // nothing reaches past `publishedChapters()` already lives — one place for
  // it, rather than a second copy that could be relaxed on its own.
  assert.match(
    source('src/search/corpus.ts'),
    /ALL_CHAPTERS/,
    'the corpus must be ordered by the book, not by the disk',
  );
});

test('every registered algorithm is findable, at a chapter that embeds it', () => {
  const { docs } = corpus();
  const bodies = chapterBodies();

  for (const algo of ALGORITHMS) {
    const found = docs.filter((doc) => doc.id === `algorithm:${algo.id}`);
    assert.equal(found.length, 1, `${algo.id} has ${found.length} documents, expected exactly 1`);

    const doc = found[0]!;
    const slug = /^\/chapters\/([^/]+)\//.exec(doc.path)?.[1];
    assert.ok(slug, `${algo.id} has an unusable path: ${doc.path}`);
    assert.ok(
      bodies.get(slug!)?.includes(`id="${algo.id}"`),
      `${algo.id} points at ${slug}, which does not embed it`,
    );
    // The name has to be in the field the ranking weights most heavily, or it
    // is only findable by the words that happen to surround it.
    assert.ok(doc.fields.name.includes(algo.name), `${algo.id} does not carry its own name`);
  }
});

test('no document is unusable — every one has a title, a path and something to match', () => {
  for (const doc of corpus().docs) {
    assert.ok(doc.title.trim(), `${doc.id} has no title`);
    assert.match(doc.path, /^\/chapters\/[a-z0-9-]+\/(#[^#]*)?$/, `${doc.id} has a bad path`);
    assert.ok(doc.meta.trim(), `${doc.id} has nothing to show before its text arrives`);
    assert.ok(
      Object.values(doc.fields).some((value) => value.trim()),
      `${doc.id} has no indexable content`,
    );
  }
});

test('an anchor is the id Astro actually emits', () => {
  // Taken from a real build's HTML. The build itself uses Astro's own heading
  // slugs, so these can only drift in the test path — but that is the path
  // asserting the URLs above, so it has to be right for the same reasons.
  const observed: Array<[string, string]> = [
    ['Partitioning', 'partitioning'],
    ['§7.3 — Moving the worst case off the input', '73--moving-the-worst-case-off-the-input'],
    ["Problem 7-1 — Hoare's partition", 'problem-7-1--hoares-partition'],
    ['§23.3 — Johnson’s algorithm', '233--johnsons-algorithm'],
    ['§23.2 — Floyd-Warshall', '232--floyd-warshall'],
    ['Beyond the numbered sections', 'beyond-the-numbered-sections'],
    ['Watch it on a sorted array', 'watch-it-on-a-sorted-array'],
    [
      '§26.2 — Matrix multiplication, in n steps instead of n³',
      '262--matrix-multiplication-in-n-steps-instead-of-n',
    ],
  ];
  for (const [heading, anchor] of observed) {
    assert.equal(slugify(heading), anchor, `the anchor for "${heading}" is wrong`);
  }
});

test('the payload stays inside its budget', () => {
  const { docs, index } = corpus();

  // The ranking payload, fetched when the dialog first opens.
  const indexBytes = gzipSync(Buffer.from(JSON.stringify(index))).length;
  // The snippet payload, fetched right behind it and never blocking a result.
  const textBytes = gzipSync(
    Buffer.from(JSON.stringify({ v: 1, text: docs.map((doc) => doc.text) })),
  ).length;

  const INDEX_BUDGET = 120 * 1024;
  const TEXT_BUDGET = 140 * 1024;

  assert.ok(
    indexBytes <= INDEX_BUDGET,
    `search-index.json is ${kb(indexBytes)} gzipped, over the ${kb(INDEX_BUDGET)} budget. ` +
      `Raise it deliberately or drop a field — ${index.docs.length} documents, ${index.terms.length} terms.`,
  );
  assert.ok(
    textBytes <= TEXT_BUDGET,
    `search-text.json is ${kb(textBytes)} gzipped, over the ${kb(TEXT_BUDGET)} budget. ` +
      `This is the droppable half of the payload if it ever stops being worth it.`,
  );
});

test('the two payloads are the same list in the same order', () => {
  // `search-text.json` carries no ids: position is the id. That only works if
  // both endpoints build from `buildCorpus()` and neither sorts afterwards.
  const build = source('src/search/corpus.ts');
  for (const endpoint of ['src/pages/search-index.json.ts', 'src/pages/search-text.json.ts']) {
    assert.match(
      source(endpoint),
      /buildCorpus\(\)/,
      `${endpoint} must build its documents through buildCorpus()`,
    );
    assert.ok(
      !/\.sort\(/.test(source(endpoint)),
      `${endpoint} reorders the corpus, which breaks the parallel arrays`,
    );
  }
  assert.match(build, /sources\.sort\(/, 'buildCorpus is where the one ordering is decided');
});

test('the deploy base is applied to a document path exactly once', () => {
  // `extract.ts` runs under Node in these tests, where `import.meta.env` does
  // not exist — so it deals in base-relative paths and `corpus.ts` is the only
  // thing allowed to prefix them.
  assert.ok(
    !/from '\.\.\/lib\/paths\.ts'/.test(source('src/search/extract.ts')),
    'extract.ts must not import paths.ts; it would throw the moment Node loaded it',
  );
  assert.match(source('src/search/corpus.ts'), /href\(doc\.path\)/);
  for (const doc of corpus().docs) {
    assert.ok(doc.path.startsWith('/chapters/'), `${doc.id} is not base-relative`);
  }
});
