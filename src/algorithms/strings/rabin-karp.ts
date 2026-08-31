import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type TextInput,
  type Trace,
} from '../types.ts';
import { ALPHABET, columns, generateText, parseText, patternRow, textRow } from './text-input.ts';
import { verifyMatches } from './naive-string-matcher.ts';

/**
 * THE RABIN-KARP ALGORITHM — CLRS §32.2.
 *
 * Compare **numbers** instead of strings.
 *
 * Read the pattern as a number in base d, where d is the alphabet size, and
 * do the same for each window of the text. Two strings are equal only if
 * their numbers are, so a window whose number differs can be rejected in one
 * comparison rather than up to m.
 *
 * Two problems, and the fixes are the algorithm.
 *
 * **The numbers get too big.** A pattern of length 20 over a 128-character
 * alphabet is a 140-bit integer, and arithmetic on it is not constant time.
 * So everything is done **modulo a prime q**, keeping every number inside a
 * machine word.
 *
 * **Modulo loses information.** Two different windows can share a residue, so
 * a hash hit is only a *candidate* — it has to be confirmed character by
 * character. Those are **spurious hits**, and the run below flags each one it
 * meets. With q chosen well they are rare: roughly one in q shifts.
 *
 * What makes it fast is the **rolling hash**. The window's number for shift
 * s + 1 is computed from the one for shift s in constant time: drop the
 * leading digit, shift left, add the new trailing digit. So all n − m + 1
 * window hashes cost Θ(n) in total rather than Θ(nm).
 *
 * Expected O(n + m) with few spurious hits; Θ((n − m + 1)m) in the worst
 * case, when every shift is a spurious hit and every one has to be verified
 * in full. That worst case is why this is a *randomized* algorithm in
 * practice: choose q at random and an adversary cannot arrange it.
 *
 * The same rolling-hash idea, generalised, is how large files are compared by
 * content and how deduplicating backup systems find repeated blocks.
 */

const Q = 13;

export function record(input: TextInput): Trace {
  const T = input.text;
  const P = input.pattern;
  const n = T.length;
  const m = P.length;
  const d = ALPHABET.length;
  const digit = (ch: string) => Math.max(0, ALPHABET.indexOf(ch));

  const { steps, stats, emit } = createRecorder();
  const found: number[] = [];
  let spurious = 0;

  // h = d^(m−1) mod q, the weight of the digit being dropped each roll.
  let h = 1;
  for (let i = 1; i < m; i++) h = (h * d) % Q;

  let p = 0;
  let ts = 0;
  for (let i = 0; i < m; i++) {
    p = (d * p + digit(P[i]!)) % Q;
    ts = (d * ts + digit(T[i]!)) % Q;
  }

  /** Window hashes, one per shift, filled in as they are rolled. */
  const hashes = new Array<number | null>(Math.max(1, n - m + 1)).fill(null);
  hashes[0] = ts;

  function snapshot(s: number): GridData {
    const hashRow = {
      label: 't',
      cells: hashes.map((v): GridCell => ({ value: v })),
    };
    return {
      kind: 'grid',
      colLabels: columns(n),
      rows: [textRow(T), patternRow(P, s), hashRow],
    };
  }

  const t = (i: number) => `0,${i}`;
  const pat = (k: number) => `1,${k}`;
  const hash = (s: number) => `2,${s}`;
  const matched = (): string[] =>
    found.flatMap((at) => Array.from({ length: m }, (_, k) => t(at + k)));

  const chips = () => auxOf([null, p, ts, spurious], undefined, [null, 'p', 't_s', 'spurious']);

  emit(
    'RABIN-KARP-MATCHER',
    6,
    snapshot(0),
    {
      look: Array.from({ length: m }, (_, k) => pat(k)),
      move: hash(0),
      aux: { hash: chips() },
    },
    `The pattern's number mod ${Q} is ${p}; the first window's is ${ts}. Both fit in a word.`,
  );

  for (let s = 0; s <= n - m; s++) {
    ts = hashes[s]!;
    const window = Array.from({ length: m }, (_, k) => t(s + k));
    stats.comparisons++;
    const hit = p === ts;
    emit(
      'RABIN-KARP-MATCHER',
      8,
      snapshot(s),
      {
        done: matched(),
        scope: window,
        scopeLabel: `shift ${s}`,
        ...(hit ? { mark: [hash(s)] } : { look: [hash(s)] }),
        pointers: { s: hash(s) },
        aux: { hash: chips() },
      },
      hit
        ? `${ts} = ${p}: a candidate. Equal numbers do not prove equal strings, so check.`
        : `${ts} ≠ ${p}, so shift ${s} cannot match. One comparison, not ${m}.`,
    );

    if (hit) {
      let same = true;
      for (let k = 0; k < m; k++) {
        stats.comparisons++;
        if (T[s + k] !== P[k]) {
          same = false;
          break;
        }
      }
      if (same) found.push(s);
      else spurious++;
      emit(
        'RABIN-KARP-MATCHER',
        same ? 10 : 9,
        snapshot(s),
        {
          done: matched(),
          scope: window,
          scopeLabel: `shift ${s}`,
          ...(same
            ? { move: [...window, ...Array.from({ length: m }, (_, k) => pat(k))] }
            : { mark: window }),
          aux: { hash: chips() },
        },
        same
          ? `The characters agree: a real occurrence at shift ${s}.`
          : `A spurious hit — same residue, different string. ${m} comparisons wasted.`,
      );
    }

    if (s < n - m) {
      const rolled = (((d * (ts - digit(T[s]!) * h) + digit(T[s + m]!)) % Q) + Q) % Q;
      hashes[s + 1] = rolled;
      ts = rolled;
      stats.writes++;
      emit(
        'RABIN-KARP-MATCHER',
        12,
        snapshot(s + 1),
        {
          done: matched(),
          look: [t(s), t(s + m)],
          move: hash(s + 1),
          scope: Array.from({ length: m }, (_, k) => t(s + 1 + k)),
          scopeLabel: `shift ${s + 1}`,
          aux: { hash: chips() },
        },
        `Roll: drop ${T[s]}, add ${T[s + m]}, and the next window's number is ${rolled}. O(1).`,
      );
    }
  }

  emit(
    'RABIN-KARP-MATCHER',
    10,
    snapshot(Math.max(0, n - m)),
    { done: matched(), matches: [...found], aux: { hash: chips() } },
    `${found.length} occurrence${found.length === 1 ? '' : 's'}, ${spurious} spurious hit${spurious === 1 ? '' : 's'}. A bigger q makes those rarer.`,
  );

  return { steps, output: { matches: found.length, spurious } };
}

export const rabinKarp: AlgorithmModule = {
  id: 'rabin-karp',
  name: 'Rabin-Karp',
  visualizer: 'grid',
  aux: [{ key: 'hash', label: 'h', hint: 'the pattern’s residue, the window’s, and false hits' }],
  procOrder: ['RABIN-KARP-MATCHER'],
  procedures: {
    'RABIN-KARP-MATCHER': {
      title: 'RABIN-KARP-MATCHER(T, P, d, q)',
      indent: [0, 0, 0, 1, 1, 0, 1, 2, 3, 1, 2, 0],
      lines: [
        'h = d^(m−1) mod q',
        'p = 0;  t₀ = 0',
        'for i = 1 to m',
        'p = (d·p + P[i]) mod q',
        't₀ = (d·t₀ + T[i]) mod q',
        'for s = 0 to n − m',
        'if p == t_s',
        'if P[1:m] == T[s+1 : s+m]',
        'print "Pattern occurs with shift" s',
        'if s < n − m',
        't_{s+1} = (d(t_s − T[s+1]·h) + T[s+m+1]) mod q',
        'return',
      ],
    },
  },
  complexity: {
    best: 'Θ(n + m)',
    average: 'O(n + m)',
    worst: 'Θ((n − m + 1) m)',
    space: 'Θ(1)',
    extra: [
      ['Preprocessing', 'Θ(m)'],
      ['Each window hash', 'O(1), rolled from the last one'],
      ['Spurious hits', 'about one shift in q — each costs a full check'],
      ['Worst case', 'every shift spurious; avoided by choosing q at random'],
      ['Generalises to', 'content-addressed storage and file deduplication'],
    ],
  },
  input: {
    minSize: 8,
    maxSize: 18,
    noun: 'text',
    placeholder: 'abcabaabcabac, abaa',
    note: 'text then pattern; hashing is base 3 mod 13, so hits are frequent',
    label: 'The text and the pattern, separated by a comma',
    generate: generateText,
    parse: parseText,
    size: (value: TextInput) => value.text.length,
  },
  defaultSize: 13,
  result: { kind: 'transforms', verify: verifyMatches },
  record,
};
