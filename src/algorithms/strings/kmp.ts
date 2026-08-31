import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridData,
  type TextInput,
  type Trace,
} from '../types.ts';
import { columns, generateText, parseText, patternRow, textRow } from './text-input.ts';
import { verifyMatches } from './naive-string-matcher.ts';

/**
 * THE KNUTH-MORRIS-PRATT ALGORITHM — CLRS §32.4.
 *
 * Θ(n + m), no automaton to build, and **the text pointer never goes
 * backwards**. That last property is what makes it the algorithm you want on
 * a stream: characters can be consumed once, in order, and thrown away.
 *
 * The naive matcher's waste was throwing away what it had learned. KMP keeps
 * exactly enough of it, in one array.
 *
 * **The prefix function.** `π[q]` is the length of the longest proper prefix
 * of `P[1‥q]` that is also a suffix of it. So if the first q characters have
 * matched and the next one fails, the algorithm does not go back to shift
 * s + 1 — it knows that the last `π[q]` characters it just read are already a
 * prefix of the pattern, and it carries on from there. The text pointer
 * stays put; only the pattern slides.
 *
 * The first half of the run computes π, and it does so **by running the
 * matcher on the pattern against itself** — which is the neatest part of the
 * section and is easy to miss when reading it. Lines 6–9 of
 * COMPUTE-PREFIX-FUNCTION are lines 5–8 of KMP-MATCHER with `T` replaced by
 * `P`.
 *
 * Watch the fallbacks in the second half. When a mismatch happens after q
 * characters, `q = π[q]` can fire several times in a row, each time giving up
 * on a longer prefix — and every one of those is a whole block of shifts the
 * naive matcher would have tried one at a time. The **amortised** argument is
 * what gives Θ(n): `q` increases by at most one per character, so it cannot
 * decrease more than n times in total, however dramatic any single fallback
 * looks.
 */

export function record(input: TextInput): Trace {
  const T = input.text;
  const P = input.pattern;
  const n = T.length;
  const m = P.length;

  const pi = new Array<number>(m + 1).fill(0);
  const known = new Array<boolean>(m + 1).fill(false);

  const { steps, stats, emit } = createRecorder();
  const found: number[] = [];

  function snapshot(offset: number): GridData {
    const notes = Array.from({ length: m }, (_, k) =>
      known[k + 1] ? `π=${pi[k + 1]}` : undefined,
    );
    return {
      kind: 'grid',
      colLabels: columns(n, m - 1),
      rows: [textRow(T, m - 1), patternRow(P, Math.max(0, offset), notes)],
    };
  }

  const t = (i: number) => `0,${i}`;
  const p = (k: number) => `1,${k}`;
  const matched = (): string[] =>
    found.flatMap((at) => Array.from({ length: m }, (_, k) => t(at + k)));

  const chips = (q: number) => auxOf([null, q, found.length], undefined, [null, 'q', 'found']);

  // ---- COMPUTE-PREFIX-FUNCTION ------------------------------------------
  pi[1] = 0;
  known[1] = true;
  stats.writes++;
  emit(
    'COMPUTE-PREFIX-FUNCTION',
    2,
    snapshot(0),
    { move: p(0), aux: { q: chips(0) } },
    `π[1] = 0: a single character has no proper prefix that is also a suffix.`,
  );

  let k = 0;
  for (let q = 2; q <= m; q++) {
    while (k > 0 && P[k] !== P[q - 1]) {
      stats.comparisons++;
      emit(
        'COMPUTE-PREFIX-FUNCTION',
        6,
        snapshot(0),
        {
          mark: [p(k), p(q - 1)],
          scope: Array.from({ length: k }, (_, x) => p(x)),
          scopeLabel: `prefix of length ${k}`,
          aux: { q: chips(k) },
        },
        `P[${k + 1}] ≠ P[${q}], so fall back: k = π[${k}] = ${pi[k]}. A shorter prefix might still work.`,
      );
      k = pi[k]!;
    }
    stats.comparisons++;
    if (P[k] === P[q - 1]) {
      k++;
      emit(
        'COMPUTE-PREFIX-FUNCTION',
        8,
        snapshot(0),
        {
          look: [p(k - 1), p(q - 1)],
          scope: Array.from({ length: k }, (_, x) => p(x)),
          scopeLabel: `prefix of length ${k}`,
          aux: { q: chips(k) },
        },
        `P[${k}] and P[${q}] are both ${P[q - 1]}, so the matching prefix grows to ${k}.`,
      );
    }
    pi[q] = k;
    known[q] = true;
    stats.writes++;
    emit(
      'COMPUTE-PREFIX-FUNCTION',
      9,
      snapshot(0),
      { move: p(q - 1), aux: { q: chips(k) } },
      `π[${q}] = ${k}. The first ${q} characters end with a ${k}-character prefix of the pattern.`,
    );
  }

  // ---- KMP-MATCHER -------------------------------------------------------
  let q = 0;
  emit(
    'KMP-MATCHER',
    3,
    snapshot(0),
    { done: matched(), aux: { q: chips(0) } },
    `π is complete. Now scan the text once, never stepping backwards in it.`,
  );

  for (let i = 0; i < n; i++) {
    while (q > 0 && P[q] !== T[i]) {
      stats.comparisons++;
      emit(
        'KMP-MATCHER',
        5,
        snapshot(i - q),
        {
          done: matched(),
          mark: [t(i), p(q)],
          scope: Array.from({ length: q }, (_, x) => t(i - q + x)),
          scopeLabel: `${q} characters already matched`,
          pointers: { i: t(i) },
          aux: { q: chips(q) },
        },
        `Mismatch after ${q}. Slide to q = π[${q}] = ${pi[q]} — i does not move, only the pattern.`,
      );
      q = pi[q]!;
    }

    stats.comparisons++;
    const same = P[q] === T[i];
    if (same) q++;
    emit(
      'KMP-MATCHER',
      same ? 7 : 6,
      snapshot(i - q + (same ? 1 : 0)),
      {
        done: matched(),
        ...(same ? { look: [t(i), p(q - 1)] } : { mark: [t(i)] }),
        ...(q > 0
          ? {
              scope: Array.from({ length: q }, (_, x) => t(i - q + 1 + x)),
              scopeLabel: `q = ${q}`,
            }
          : {}),
        pointers: { i: t(i) },
        aux: { q: chips(q) },
      },
      same
        ? `T[${i + 1}] is ${T[i]} and so is P[${q}]: q = ${q}.`
        : `T[${i + 1}] is ${T[i]}, matching nothing from the start. q stays 0 and i moves on.`,
    );

    if (q === m) {
      found.push(i - m + 1);
      emit(
        'KMP-MATCHER',
        9,
        snapshot(i - m + 1),
        {
          move: [
            ...Array.from({ length: m }, (_, x) => t(i - m + 1 + x)),
            ...Array.from({ length: m }, (_, x) => p(x)),
          ],
          done: matched(),
          aux: { q: chips(q) },
        },
        `q = ${m}: an occurrence at shift ${i - m + 1}. Fall back to π[${m}] = ${pi[m]} and keep going.`,
      );
      q = pi[m]!;
    }
  }

  emit(
    'KMP-MATCHER',
    4,
    snapshot(Math.max(0, n - m)),
    { done: matched(), matches: [...found], aux: { q: chips(q) } },
    found.length === 0
      ? `One pass over the text, ${stats.comparisons} comparisons, and no occurrence.`
      : `Shift${found.length === 1 ? '' : 's'} ${found.join(', ')}, in one pass and Θ(n + m).`,
  );

  return { steps, output: { matches: found.length, comparisons: stats.comparisons } };
}

export const kmp: AlgorithmModule = {
  id: 'kmp',
  name: 'Knuth-Morris-Pratt',
  visualizer: 'grid',
  aux: [{ key: 'q', label: 'q', hint: 'characters matched so far, and occurrences found' }],
  procOrder: ['KMP-MATCHER', 'COMPUTE-PREFIX-FUNCTION'],
  procedures: {
    'KMP-MATCHER': {
      title: 'KMP-MATCHER(T, P)',
      indent: [0, 0, 0, 1, 2, 1, 2, 1, 2, 2],
      lines: [
        'π = COMPUTE-PREFIX-FUNCTION(P)',
        'q = 0',
        'for i = 1 to n',
        'while q > 0 and P[q+1] ≠ T[i]',
        'q = π[q]',
        'if P[q+1] == T[i]',
        'q = q + 1',
        'if q == m',
        'print "Pattern occurs with shift" i − m',
        'q = π[q]',
      ],
    },
    'COMPUTE-PREFIX-FUNCTION': {
      title: 'COMPUTE-PREFIX-FUNCTION(P)',
      indent: [0, 0, 0, 0, 1, 2, 1, 2, 1, 0],
      lines: [
        'let π[1:m] be a new array',
        'π[1] = 0',
        'k = 0',
        'for q = 2 to m',
        'while k > 0 and P[k+1] ≠ P[q]',
        'k = π[k]',
        'if P[k+1] == P[q]',
        'k = k + 1',
        'π[q] = k',
        'return π',
      ],
    },
  },
  complexity: {
    best: 'Θ(n + m)',
    average: 'Θ(n + m)',
    worst: 'Θ(n + m)',
    space: 'Θ(m)',
    extra: [
      ['Preprocessing', 'Θ(m) — the prefix function'],
      ['Matching', 'Θ(n), amortised: q rises at most n times, so it falls at most n times'],
      ['The text pointer', 'never moves backwards — usable on a stream'],
      ['Versus the automaton', 'same bound, Θ(m) space instead of Θ(m|Σ|)'],
      ['Computing π', 'the matcher run on the pattern against itself'],
    ],
  },
  input: {
    minSize: 8,
    maxSize: 18,
    noun: 'text',
    placeholder: 'abcabaabcabac, abaa',
    note: 'text then pattern; the pattern always occurs at least once',
    label: 'The text and the pattern, separated by a comma',
    generate: generateText,
    parse: parseText,
    size: (value: TextInput) => value.text.length,
  },
  defaultSize: 13,
  result: { kind: 'transforms', verify: verifyMatches },
  record,
};
