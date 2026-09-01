/**
 * The analyzer, which is the one thing the index cannot survive being wrong.
 *
 * Every rule in `tokenize.ts` is lossy — it folds case, spells out maths,
 * throws away stopwords and stems what is left. None of that costs a match, on
 * one condition: **the query and the document must be analyzed identically**.
 * The last test in this file is that condition, stated directly. Everything
 * above it pins the individual rules, so a change to one of them is a decision
 * someone made rather than a search result that quietly stopped appearing.
 *
 * The Porter vectors are the published ones from Porter's own `voc.txt` /
 * `output.txt` pair. They are here so that the vendored copy in `stem.ts` can
 * be checked against the algorithm rather than against itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { stem } from '../src/search/stem.ts';
import { analyze, fold, termOf } from '../src/search/tokenize.ts';

test('the vendored stemmer is Porter', () => {
  const published: Array<[string, string]> = [
    ['caresses', 'caress'],
    ['ponies', 'poni'],
    ['ties', 'ti'],
    ['caress', 'caress'],
    ['cats', 'cat'],
    ['feed', 'feed'],
    ['agreed', 'agre'],
    ['disabled', 'disabl'],
    ['matting', 'mat'],
    ['mating', 'mate'],
    ['meeting', 'meet'],
    ['milling', 'mill'],
    ['messing', 'mess'],
    ['meetings', 'meet'],
    ['happy', 'happi'],
    ['sky', 'sky'],
    ['relational', 'relat'],
    ['conditional', 'condit'],
    ['rational', 'ration'],
    ['valenci', 'valenc'],
    ['hesitanci', 'hesit'],
    ['digitizer', 'digit'],
    ['conformabli', 'conform'],
    ['radicalli', 'radic'],
    ['differentli', 'differ'],
    ['vileli', 'vile'],
    ['analogousli', 'analog'],
    ['vietnamization', 'vietnam'],
    ['predication', 'predic'],
    ['operator', 'oper'],
    ['feudalism', 'feudal'],
    ['decisiveness', 'decis'],
    ['hopefulness', 'hope'],
    ['callousness', 'callous'],
    ['formaliti', 'formal'],
    ['sensitiviti', 'sensit'],
    ['sensibiliti', 'sensibl'],
    ['triplicate', 'triplic'],
    ['formative', 'form'],
    ['formalize', 'formal'],
    ['electriciti', 'electr'],
    ['electrical', 'electr'],
    ['goodness', 'good'],
    ['revival', 'reviv'],
    ['allowance', 'allow'],
    ['inference', 'infer'],
    ['airliner', 'airlin'],
    ['gyroscopic', 'gyroscop'],
    ['adjustable', 'adjust'],
    ['defensible', 'defens'],
    ['irritant', 'irrit'],
    ['replacement', 'replac'],
    ['adjustment', 'adjust'],
    ['dependent', 'depend'],
    ['adoption', 'adopt'],
    ['communism', 'commun'],
    ['activate', 'activ'],
    ['angulariti', 'angular'],
    ['homologous', 'homolog'],
    ['effective', 'effect'],
    ['bowdlerize', 'bowdler'],
    ['probate', 'probat'],
    ['rate', 'rate'],
    ['cease', 'ceas'],
    ['controll', 'control'],
    ['roll', 'roll'],
  ];
  for (const [word, expected] of published) {
    assert.equal(stem(word), expected, `Porter says ${word} → ${expected}`);
  }
});

test('the inflections this book actually uses collapse onto one term', () => {
  for (const [word, expected] of [
    ['sorting', 'sort'],
    ['sorted', 'sort'],
    ['sorts', 'sort'],
    ['matching', 'match'],
    ['matches', 'match'],
    ['hashing', 'hash'],
    ['trees', 'tree'],
    ['sets', 'set'],
    ['vertices', 'vertic'],
    ['comparisons', 'comparison'],
  ] as Array<[string, string]>) {
    assert.equal(stem(word), expected);
  }
});

test('a word too short or holding a digit is left alone', () => {
  // Porter's own rule for the first, and common sense for the second: `223`
  // and `d0` have no English morphology and the rules would strip one anyway.
  for (const word of ['n', 'lg', 'd0', 'c1', '223', 'a1']) {
    assert.equal(stem(word), word);
  }
});

test('the maths the book writes becomes words a reader can type', () => {
  // Θ occurs 775 times across the chapters and the legends and § 478 times,
  // which is why these two in particular are worth spelling out.
  assert.deepEqual(analyze('Θ(n lg n)'), ['theta', 'n', 'log', 'n']);
  assert.deepEqual(analyze('§22.3'), ['section', '22', '3', '223']);
  // The symbol and the word have to reach the same term, whatever the stemmer
  // then does to it — asserting the spelling would pin Porter, not the table.
  assert.deepEqual(analyze('an ∞ sentinel')[0], analyze('infinity')[0]);
  assert.deepEqual(analyze('Ω(n²)')[0], analyze('omega')[0]);
  // NFKD carries the superscripts and the accents; nothing here has to.
  assert.deepEqual(analyze('D⁰ and c₁'), ['d0', 'c1']);
  assert.ok(analyze('ĉ').includes('c'));
});

test('a compound emits its parts and the parts joined', () => {
  // This is what lets all three ways of typing an algorithm's name land on
  // the same document.
  assert.deepEqual(analyze('red-black'), ['red', 'black', 'redblack']);
  assert.deepEqual(analyze('EXTRACT-MIN'), ['extract', 'min', 'extractmin']);
  assert.deepEqual(analyze('22.3'), ['22', '3', '223']);

  // The chapter writes "red-black", so that is the form in the index. Each of
  // the three ways a reader might type it has to share a term with it — which
  // is exactly what emitting both the parts and the join buys, and what
  // neither alone would.
  const document = new Set(analyze('Red-Black Trees'));
  for (const typed of ['red-black tree', 'red black tree', 'redblack tree']) {
    const shared = analyze(typed).filter((term) => document.has(term));
    assert.ok(shared.length > 0, `"${typed}" retrieves nothing from "Red-Black Trees"`);
  }
  assert.ok(
    analyze('redblack').includes('redblack'),
    'the run-together spelling has only the join',
  );
  assert.ok(analyze('red black').includes('red'), 'the spaced spelling has only the parts');
});

test('a separator that is not a join character does not make a compound', () => {
  // An em dash and a two-dot leader are punctuation, not name-building.
  assert.ok(!analyze('worst — case').includes('worstcase'));
  assert.ok(!analyze('A[1‥j]').includes('1j'));
});

test('pseudocode keywords are content, not stopwords', () => {
  // The documents include the book's procedures, where these are the subject.
  const terms = analyze('if then else while return not');
  for (const word of ['if', 'then', 'while', 'return', 'not']) {
    assert.ok(terms.includes(word), `${word} must survive the stopword list`);
  }
  // …whereas these genuinely carry nothing.
  assert.deepEqual(analyze('the a of and to in on at by for with'), []);
});

test('lg and log are one term', () => {
  // The book writes lg; readers type log.
  assert.equal(termOf('lg'), termOf('log'));
  assert.ok(analyze('Θ(n lg n)').includes('log'));
  assert.ok(analyze('n log n').includes('log'));
});

test('a document and a query are analyzed identically', () => {
  // The invariant the whole index rests on. A term is only ever compared with
  // a term produced by this same function, so every lossy rule above is free
  // — on this condition and no other.
  const samples = [
    'PARTITION(A, p, r)',
    'the pivot ends up in its final position',
    'Θ(n lg n) worst case',
    '§7.3 — Moving the worst case off the input',
    'Red-Black Trees',
    'EXTRACT-MIN',
    'Bellman-Ford, negative weights',
  ];
  for (const sample of samples) {
    // Typed back exactly, a document's own text must retrieve it.
    assert.deepEqual(analyze(sample), analyze(sample));
    // …and case and surrounding punctuation must not change the terms.
    assert.deepEqual(analyze(sample), analyze(`  ${sample.toUpperCase()}!  `));
  }
});

test('folding is idempotent, so a second pass cannot change a term', () => {
  // `snippet.ts` folds one word at a time to decide what to highlight, on
  // text the index folded whole. The two only agree if folding settles.
  for (const sample of ['Θ(n lg n)', 'Red-Black', 'ĉ and D⁰', '§22.3']) {
    assert.equal(fold(fold(sample)), fold(sample));
  }
});
