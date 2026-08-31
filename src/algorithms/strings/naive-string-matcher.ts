import {
  auxOf,
  createRecorder,
  isTextInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GridData,
  type TextInput,
  type Trace,
} from '../types.ts';
import { columns, generateText, parseText, patternRow, textRow } from './text-input.ts';

/**
 * THE NAIVE STRING MATCHER — CLRS §32.1.
 *
 * Try every shift. For each one, compare the pattern against the text
 * character by character until something differs or the pattern runs out.
 *
 * Θ((n − m + 1)m) in the worst case, which for a pattern half the length of
 * the text is Θ(n²). And the worst case is not exotic — `aaaa…a` against
 * `aaab` hits it exactly, because every shift matches almost all the way
 * before failing on the last character.
 *
 * What is wasteful here is worth naming precisely, because the other three
 * algorithms in the chapter are three different ways of not doing it. **The
 * naive matcher throws away everything it learns.** Having matched `aab` at
 * shift 3 and then failed, it starts again at shift 4 knowing nothing —
 * even though what it just read tells it a great deal about which shifts
 * could possibly work.
 *
 * Watch the shift counter and the comparison counter together. On random text
 * over a small alphabet most shifts die after one or two comparisons, which
 * is why this is perfectly usable in practice despite the bound. It is the
 * structured, repetitive text — DNA, log files, anything with a small
 * alphabet and long runs — where it falls apart.
 */

export function record(input: TextInput): Trace {
  const T = input.text;
  const P = input.pattern;
  const n = T.length;
  const m = P.length;

  const { steps, stats, emit } = createRecorder();
  const found: number[] = [];

  function snapshot(s: number): GridData {
    return {
      kind: 'grid',
      colLabels: columns(n),
      rows: [textRow(T), patternRow(P, s)],
    };
  }

  const t = (i: number) => `0,${i}`;
  const p = (k: number) => `1,${k}`;

  const chips = (s: number) =>
    auxOf([null, s, found.length], undefined, [null, 'shift s', 'found']);

  for (let s = 0; s <= n - m; s++) {
    const window = Array.from({ length: m }, (_, k) => t(s + k));
    emit(
      'NAIVE-STRING-MATCHER',
      1,
      snapshot(s),
      {
        scope: window,
        scopeLabel: `shift ${s}`,
        done: found.flatMap((at) => Array.from({ length: m }, (_, k) => t(at + k))),
        aux: { s: chips(s) },
      },
      `Shift ${s}: line the pattern up under T[${s + 1}‥${s + m}] and start comparing.`,
    );

    let k = 0;
    while (k < m) {
      stats.comparisons++;
      const same = T[s + k] === P[k];
      emit(
        'NAIVE-STRING-MATCHER',
        2,
        snapshot(s),
        {
          scope: window,
          scopeLabel: `shift ${s}`,
          done: found.flatMap((at) => Array.from({ length: m }, (_, x) => t(at + x))),
          ...(same ? { look: [t(s + k), p(k)] } : { mark: [t(s + k), p(k)] }),
          pointers: { i: t(s + k) },
          aux: { s: chips(s) },
        },
        same
          ? `T[${s + k + 1}] and P[${k + 1}] are both ${P[k]}.`
          : `T[${s + k + 1}] is ${T[s + k]} but P[${k + 1}] is ${P[k]}. This shift is dead — start again at ${s + 1}.`,
      );
      if (!same) break;
      k++;
    }

    if (k === m) {
      found.push(s);
      emit(
        'NAIVE-STRING-MATCHER',
        3,
        snapshot(s),
        {
          done: found.flatMap((at) => Array.from({ length: m }, (_, x) => t(at + x))),
          move: [...window, ...Array.from({ length: m }, (_, x) => p(x))],
          aux: { s: chips(s) },
        },
        `All ${m} characters match: the pattern occurs with shift ${s}.`,
      );
    }
  }

  emit(
    'NAIVE-STRING-MATCHER',
    1,
    snapshot(Math.max(0, n - m)),
    {
      done: found.flatMap((at) => Array.from({ length: m }, (_, x) => t(at + x))),
      matches: [...found],
      aux: { s: chips(n - m) },
    },
    found.length === 0
      ? `Every shift tried, no occurrence. ${stats.comparisons} comparisons for a definite no.`
      : `Done: ${found.length} occurrence${found.length === 1 ? '' : 's'}, at shift${found.length === 1 ? '' : 's'} ${found.join(', ')}.`,
  );

  return { steps, output: { matches: found.length, comparisons: stats.comparisons } };
}

/**
 * The reported shifts are exactly the shifts where the pattern occurs.
 *
 * Checked with the language's own substring search, which shares no code with
 * the loop above. Both directions matter: every reported shift is real, and
 * no real one is missing.
 */
export function verifyMatches(input: AlgorithmInput, trace: Trace): string | null {
  if (!isTextInput(input)) return 'not a text input';
  const { text: T, pattern: P } = input;

  const expected: number[] = [];
  for (let s = 0; s + P.length <= T.length; s++) {
    if (T.startsWith(P, s)) expected.push(s);
  }

  const found = (trace.steps.at(-1)!.hi as { matches?: number[] }).matches;
  if (!found) return 'the run reported no result';
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    return `reported shifts ${JSON.stringify(found)}, but "${P}" occurs at ${JSON.stringify(expected)}`;
  }
  return null;
}

export const naiveStringMatcher: AlgorithmModule = {
  id: 'naive-string-matcher',
  name: 'Naive String Matcher',
  visualizer: 'grid',
  aux: [{ key: 's', label: 's', hint: 'the shift being tried, and how many have matched' }],
  procOrder: ['NAIVE-STRING-MATCHER'],
  procedures: {
    'NAIVE-STRING-MATCHER': {
      title: 'NAIVE-STRING-MATCHER(T, P)',
      indent: [0, 1, 2],
      lines: [
        'for s = 0 to n − m',
        'if P[1:m] == T[s+1 : s+m]',
        'print "Pattern occurs with shift" s',
      ],
    },
  },
  complexity: {
    best: 'Θ(n − m + 1)',
    average: 'O(n)',
    worst: 'Θ((n − m + 1) m)',
    space: 'Θ(1)',
    extra: [
      ['Preprocessing', 'none'],
      ['Worst case', 'aaaa…a against aaab — every shift nearly matches'],
      ['On random text', 'about 2(n − m + 1) comparisons expected'],
      ['What it wastes', 'everything it learns from a failed shift'],
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
