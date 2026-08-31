import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type AlgorithmInput,
  type GridData,
  type TextInput,
  type Trace,
} from '../types.ts';
import { ALPHABET, columns, generateText, parseText, patternRow, textRow } from './text-input.ts';
import { verifyMatches } from './naive-string-matcher.ts';

/**
 * BOYER-MOORE — from chapter 32's problems, and the fastest of the five in
 * practice.
 *
 * The other four matchers on this page all read the pattern **left to right**.
 * Boyer-Moore reads it **right to left**, and that one reversal is what lets it
 * skip: a mismatch at the far end of the pattern says something about the
 * characters before it, which have not been read at all. On English text with a
 * long pattern it examines a *fraction* of the characters — the only matcher
 * here that can be **sublinear** in practice.
 *
 * Two rules decide how far to jump, and the shift taken is the larger:
 *
 *   - **The bad-character heuristic.** The text character `T[s+j]` that caused
 *     the mismatch has a last occurrence `λ[c]` in the pattern. Slide the
 *     pattern so those line up: `j − λ[T[s+j]]`. If the character is not in the
 *     pattern at all, `λ` is 0 and the whole pattern jumps past it. That is the
 *     rule doing most of the work, and it is why a large alphabet helps.
 *   - **The good-suffix heuristic.** The suffix of the pattern that *did* match
 *     must reappear if the pattern is to match again, so `γ[j]` is how far to
 *     slide before it could. It is what keeps the algorithm correct when the
 *     bad-character rule suggests a shift that is too small — or negative.
 *
 * `γ` is drawn as the corner note on each pattern cell, so the shift the
 * good-suffix rule would allow is readable at the point of the mismatch. `λ`
 * is the second aux row, one chip per character of the alphabet.
 *
 * **What `verify` checks is that no occurrence was jumped over.** Matching the
 * naive matcher's answer would catch a shift that is too large only when it
 * happened to skip a real occurrence on that particular input; recording every
 * shift and asserting that nothing was skipped catches it always, which is the
 * one property both heuristics exist to preserve.
 */
export function record(input: TextInput): Trace {
  const T = input.text;
  const P = input.pattern;
  const n = T.length;
  const m = P.length;

  const { steps, stats, emit } = createRecorder();
  const found: number[] = [];
  /** Every shift the run stood at, and how far it then jumped. */
  const jumps: Array<{ from: number; by: number }> = [];

  // λ[c] — the largest index k with P[k] == c, or 0 when there is none.
  const lambda = new Map<string, number>();
  for (const c of ALPHABET) lambda.set(c, 0);
  for (let k = 1; k <= m; k++) lambda.set(P[k - 1]!, k);

  const gamma = goodSuffix(P);

  /** The good-suffix shift, as the corner note on each pattern character. */
  const notes = Array.from({ length: m }, (_, k) => `γ${k + 1}=${gamma[k + 1]}`);

  function snapshot(s: number): GridData {
    return {
      kind: 'grid',
      colLabels: columns(n),
      rows: [textRow(T), patternRow(P, s, notes)],
    };
  }

  const t = (i: number) => `0,${i}`;
  const p = (k: number) => `1,${k}`;

  const chips = (s: number) => ({
    s: auxOf([null, s, found.length], undefined, [null, 'shift s', 'found']),
    lambda: auxOf([null, ...[...ALPHABET].map((c) => lambda.get(c)!)], undefined, [
      null,
      ...[...ALPHABET].map((c) => `λ(${c})`),
    ]),
  });

  const settled = () => found.flatMap((at) => Array.from({ length: m }, (_, k) => t(at + k)));

  let s = 0;
  while (s <= n - m) {
    const window = Array.from({ length: m }, (_, k) => t(s + k));
    emit(
      'BOYER-MOORE-MATCHER',
      6,
      snapshot(s),
      { scope: window, scopeLabel: `shift ${s}`, done: settled(), aux: chips(s) },
      `Shift ${s}: line the pattern up, and start at its **last** character rather than its first.`,
    );

    let j = m;
    while (j > 0) {
      stats.comparisons++;
      const same = P[j - 1] === T[s + j - 1];
      emit(
        'BOYER-MOORE-MATCHER',
        7,
        snapshot(s),
        {
          scope: window,
          scopeLabel: `shift ${s}`,
          done: settled(),
          ...(same ? { look: [t(s + j - 1), p(j - 1)] } : { mark: [t(s + j - 1), p(j - 1)] }),
          pointers: { j: t(s + j - 1) },
          aux: chips(s),
        },
        same
          ? `T[${s + j}] and P[${j}] are both ${P[j - 1]} — the suffix P[${j}‥${m}] matches, and nothing to its left has been read.`
          : `T[${s + j}] is ${T[s + j - 1]} but P[${j}] is ${P[j - 1]}. Mismatch, with ${m - j} character${m - j === 1 ? '' : 's'} of the suffix already matched.`,
      );
      if (!same) break;
      j--;
    }

    let by: number;
    if (j === 0) {
      found.push(s);
      by = gamma[0]!;
      emit(
        'BOYER-MOORE-MATCHER',
        10,
        snapshot(s),
        {
          done: settled(),
          move: [...window, ...Array.from({ length: m }, (_, k) => p(k))],
          aux: chips(s),
        },
        `All ${m} characters match: the pattern occurs with shift ${s}. Move on by γ[0] = ${by}.`,
      );
    } else {
      const c = T[s + j - 1]!;
      const bad = j - (lambda.get(c) ?? 0);
      const good = gamma[j]!;
      by = Math.max(good, bad);
      stats.comparisons++;
      emit(
        'BOYER-MOORE-MATCHER',
        12,
        snapshot(s),
        {
          scope: window,
          scopeLabel: `shift ${s}`,
          done: settled(),
          mark: [t(s + j - 1), p(j - 1)],
          aux: chips(s),
        },
        `The bad character ${c} last occurs at P[${lambda.get(c)}], so that rule allows ${bad}; the matched suffix allows γ[${j}] = ${good}. Take the larger: shift by ${by}.` +
          (bad <= 0
            ? ` The bad-character rule alone would go backwards here, which is why the other one exists.`
            : ''),
      );
    }

    jumps.push({ from: s, by });
    s += by;
  }

  emit(
    'BOYER-MOORE-MATCHER',
    5,
    snapshot(Math.max(0, Math.min(s, n - m))),
    { done: settled(), matches: [...found], jumps, aux: chips(Math.max(0, n - m)) },
    found.length === 0
      ? `Every shift that could matter has been tried, in ${stats.comparisons} comparisons — and most characters of the text were never looked at.`
      : `Done: ${found.length} occurrence${found.length === 1 ? '' : 's'}, at shift${
          found.length === 1 ? '' : 's'
        } ${found.join(', ')}, in ${stats.comparisons} comparisons over ${jumps.length} shift${
          jumps.length === 1 ? '' : 's'
        }.`,
  );

  return {
    steps,
    output: { matches: found.length, comparisons: stats.comparisons, shifts: jumps.length },
  };
}

/**
 * The prefix function of §32.4 — the same one KMP computes.
 *
 * Written here rather than imported from `kmp.ts`: that module's copy is part
 * of the algorithm it animates, step by step, and reaching into it for a value
 * would tie two players' internals together for the sake of eight lines.
 */
function prefixFunction(P: string): number[] {
  const m = P.length;
  const pi = new Array<number>(m + 1).fill(0);
  let k = 0;
  for (let q = 2; q <= m; q++) {
    while (k > 0 && P[k] !== P[q - 1]) k = pi[k]!;
    if (P[k] === P[q - 1]) k++;
    pi[q] = k;
  }
  return pi;
}

/**
 * COMPUTE-GOOD-SUFFIX-FUNCTION, from the prefix functions of P and of P
 * reversed — the construction the problem gives.
 *
 * `γ[j]` is how far the pattern may slide after a mismatch at position j with
 * `P[j+1‥m]` already matched, without skipping a shift at which the pattern
 * could occur.
 */
function goodSuffix(P: string): number[] {
  const m = P.length;
  const pi = prefixFunction(P);
  const rev = [...P].reverse().join('');
  const piRev = prefixFunction(rev);

  const gamma = new Array<number>(m + 1).fill(m - pi[m]!);
  for (let l = 1; l <= m; l++) {
    const j = m - piRev[l]!;
    if (gamma[j]! > l - piRev[l]!) gamma[j] = l - piRev[l]!;
  }
  return gamma;
}

export const boyerMoore: AlgorithmModule = {
  id: 'boyer-moore',
  name: 'Boyer-Moore',
  visualizer: 'grid',
  aux: [
    { key: 's', label: 's', hint: 'the shift being tried, and how many have matched' },
    { key: 'lambda', label: 'λ', hint: 'the last position of each character in the pattern' },
  ],
  procOrder: ['BOYER-MOORE-MATCHER'],
  procedures: {
    'BOYER-MOORE-MATCHER': {
      title: 'BOYER-MOORE-MATCHER(T, P, Σ)',
      indent: [0, 0, 0, 0, 0, 1, 1, 2, 1, 2, 2, 2],
      lines: [
        'n = T.length;  m = P.length',
        'λ = COMPUTE-LAST-OCCURRENCE-FUNCTION(P, m, Σ)',
        'γ = COMPUTE-GOOD-SUFFIX-FUNCTION(P, m)',
        's = 0',
        'while s ≤ n - m',
        'j = m',
        'while j > 0 and P[j] == T[s+j]',
        'j = j - 1',
        'if j == 0',
        'print "Pattern occurs with shift" s',
        's = s + γ[0]',
        'else s = s + max(γ[j], j - λ[T[s+j]])',
      ],
    },
  },
  complexity: {
    best: 'Ω(n / m)',
    average: 'sublinear on a large alphabet',
    worst: 'O((n − m + 1) m)',
    space: 'Θ(m + |Σ|)',
    extra: [
      ['Reads', 'right to left, which is what makes skipping possible'],
      ['Bad character', 'j − λ[c] — slide until c lines up, or past it entirely'],
      ['Good suffix', 'γ[j] — slide until the matched suffix could reappear'],
      ['Takes', 'the larger of the two, which is why it is never unsafe'],
      ['In practice', 'the fastest of the five here, and the one grep uses'],
    ],
  },
  input: {
    minSize: 8,
    maxSize: 24,
    noun: 'text',
    placeholder: 'abcabcabab / abab',
    note: 'a text and a pattern, over the alphabet a, b, c',
    label: 'The text and the pattern, separated by a slash',
    generate: (n) => generateText(n),
    parse: (text) => parseText(text),
    size: (input: TextInput) => input.text.length,
  },
  defaultSize: 16,
  result: {
    kind: 'transforms',
    verify(input: AlgorithmInput, trace: Trace): string | null {
      // The same answer as §32.1's matcher, checked by the same shared helper.
      const wrong = verifyMatches(input, trace);
      if (wrong) return wrong;

      const { text: T, pattern: P } = input as TextInput;
      const jumps = (trace.steps.at(-1)!.hi as { jumps?: Array<{ from: number; by: number }> })
        .jumps;
      if (!jumps) return 'the run recorded no shifts';

      // The property both heuristics exist to preserve, and the one that a
      // wrong γ breaks: a shift may be as large as you like as long as it
      // steps over nothing. Agreeing with the naive matcher catches this only
      // when the skipped shift happened to hold an occurrence.
      for (const { from, by } of jumps) {
        if (by < 1) return `shift ${from} advanced by ${by}, which does not terminate`;
        for (let skipped = from + 1; skipped < from + by; skipped++) {
          if (T.startsWith(P, skipped)) {
            return `jumped from shift ${from} by ${by}, stepping over an occurrence at ${skipped}`;
          }
        }
      }
      return null;
    },
  },
  record,
};
