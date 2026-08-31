import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type GridRow,
  type TextInput,
  type Trace,
} from '../types.ts';
import { ALPHABET, columns, generateText, parseText, textRow } from './text-input.ts';
import { verifyMatches } from './naive-string-matcher.ts';

/**
 * STRING MATCHING WITH A FINITE AUTOMATON — CLRS §32.3.
 *
 * Build a machine that reads the text once, one character at a time, in a
 * single state, and announces a match the moment it reaches its last state.
 * **Θ(n) matching, exactly one table lookup per character**, and no
 * comparison of characters at all during the scan.
 *
 * The machine has m + 1 states. State `q` means "the last q characters read
 * are the pattern's first q, and no longer prefix is a suffix of what has
 * been read". The transition `δ(q, a)` says which state reading `a` leaves
 * you in — and it is defined as the **length of the longest prefix of P that
 * is a suffix of `P[1‥q]a`**, which is what makes the invariant hold.
 *
 * That definition is the whole content of the section, and it is worth
 * pausing on the case that looks wrong: `δ(q, a)` can be **larger than q + 1
 * never**, but it can be much *smaller* than q — reading one bad character
 * can throw away most of the progress, and the state it drops to is not
 * necessarily zero. The table knows where to drop to, so the scan never
 * needs to look backwards.
 *
 * The δ table is on screen from the first frame, precomputed. Building it
 * naively costs O(m³|Σ|), and §32.3 gives an O(m|Σ|) method; either way it
 * is the price of admission, and it is why this algorithm loses to KMP when
 * the alphabet is large. **KMP is this automaton with the table replaced by
 * one array of m numbers** — same Θ(n) scan, Θ(m) space instead of Θ(m|Σ|).
 *
 * Watch the state row fill in under the text. Every entry is one lookup, and
 * the state never has to be recomputed or revisited.
 */

/**
 * δ(q, a) = the longest prefix of P that is a suffix of P[1‥q] followed by a.
 *
 * Written straight from the definition rather than from §32.3's faster
 * construction: it is O(m³|Σ|) and the point here is what the table *is*.
 */
function transitions(P: string): number[][] {
  const m = P.length;
  const delta: number[][] = [];
  for (let q = 0; q <= m; q++) {
    const row: number[] = [];
    for (const a of ALPHABET) {
      let k = Math.min(m, q + 1);
      const seen = P.slice(0, q) + a;
      while (k > 0 && !seen.endsWith(P.slice(0, k))) k--;
      row.push(k);
    }
    delta.push(row);
  }
  return delta;
}

export function record(input: TextInput): Trace {
  const T = input.text;
  const P = input.pattern;
  const n = T.length;
  const m = P.length;
  const delta = transitions(P);
  const index = (ch: string) => Math.max(0, ALPHABET.indexOf(ch));

  const { steps, stats, emit } = createRecorder();
  const found: number[] = [];
  const states = new Array<number | null>(n).fill(null);

  function snapshot(): GridData {
    const rows: GridRow[] = [
      textRow(T),
      { label: 'q', cells: states.map((v): GridCell => ({ value: v })) },
    ];
    delta.forEach((row, q) => {
      rows.push({
        label: `δ(${q},·)`,
        // The alphabet is the column here, not a text position, so each cell
        // carries its own letter as a note rather than relying on a heading
        // that belongs to the rows above it.
        cells: row.map((to, a): GridCell => ({ value: to, note: ALPHABET[a]! })),
      });
    });
    return { kind: 'grid', colLabels: columns(n), rows };
  }

  const t = (i: number) => `0,${i}`;
  const st = (i: number) => `1,${i}`;
  const dl = (q: number, a: number) => `${2 + q},${a}`;
  const matched = (): string[] =>
    found.flatMap((at) => Array.from({ length: m }, (_, k) => t(at + k)));

  const chips = (q: number) => auxOf([null, q, m], undefined, [null, 'q', 'accept at']);

  let q = 0;
  emit(
    'FINITE-AUTOMATON-MATCHER',
    2,
    snapshot(),
    {
      scope: delta[0]!.map((_, a) => dl(0, a)),
      scopeLabel: 'state 0: nothing matched yet',
      aux: { q: chips(0) },
    },
    `The machine starts in state 0. The table below it is δ, precomputed from the pattern alone.`,
  );

  for (let i = 0; i < n; i++) {
    const a = index(T[i]!);
    const next = delta[q]![a]!;
    stats.comparisons++;
    emit(
      'FINITE-AUTOMATON-MATCHER',
      4,
      snapshot(),
      {
        done: matched(),
        look: [t(i), dl(q, a)],
        arrows: [{ from: dl(q, a), to: st(i), role: 'look' as const }],
        scope: delta[q]!.map((_, x) => dl(q, x)),
        scopeLabel: `state ${q}`,
        pointers: { i: t(i) },
        aux: { q: chips(q) },
      },
      `Reading ${T[i]} in state ${q}: δ(${q}, ${T[i]}) = ${next}.${
        next < q ? ` Progress drops from ${q} to ${next}.` : ''
      }`,
    );

    q = next;
    states[i] = q;
    stats.writes++;
    emit(
      'FINITE-AUTOMATON-MATCHER',
      4,
      snapshot(),
      {
        done: matched(),
        move: st(i),
        scope: delta[q]!.map((_, x) => dl(q, x)),
        scopeLabel: `state ${q}`,
        pointers: { i: t(i) },
        aux: { q: chips(q) },
      },
      `State ${q}: the last ${q} character${q === 1 ? '' : 's'} read ${q === 1 ? 'is' : 'are'} the pattern's first ${q}.`,
    );

    if (q === m) {
      found.push(i - m + 1);
      emit(
        'FINITE-AUTOMATON-MATCHER',
        6,
        snapshot(),
        {
          done: matched(),
          move: Array.from({ length: m }, (_, x) => t(i - m + 1 + x)),
          mark: [st(i)],
          aux: { q: chips(q) },
        },
        `State ${m} is the accepting state: an occurrence with shift ${i - m + 1}.`,
      );
    }
  }

  emit(
    'FINITE-AUTOMATON-MATCHER',
    3,
    snapshot(),
    { done: matched(), matches: [...found], aux: { q: chips(q) } },
    `One lookup per character, ${n} in all, and not one character comparison during the scan.`,
  );

  return { steps, output: { matches: found.length, states: m + 1 } };
}

export const finiteAutomatonMatcher: AlgorithmModule = {
  id: 'finite-automaton-matcher',
  name: 'Finite-Automaton Matcher',
  visualizer: 'grid',
  aux: [{ key: 'q', label: 'q', hint: 'the current state, and the one that accepts' }],
  procOrder: ['FINITE-AUTOMATON-MATCHER'],
  procedures: {
    'FINITE-AUTOMATON-MATCHER': {
      title: 'FINITE-AUTOMATON-MATCHER(T, δ, m)',
      indent: [0, 0, 0, 1, 1, 2],
      lines: [
        'n = T.length',
        'q = 0',
        'for i = 1 to n',
        'q = δ(q, T[i])',
        'if q == m',
        'print "Pattern occurs with shift" i − m',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n)',
    worst: 'Θ(n)',
    space: 'Θ(m |Σ|)',
    extra: [
      ['Matching', 'Θ(n) — one table lookup per character, no comparisons'],
      ['Preprocessing', 'O(m |Σ|) with §32.3’s method, O(m³|Σ|) from the definition'],
      ['Where it loses', 'a large alphabet: the table is m|Σ| entries'],
      ['KMP', 'this automaton with the table replaced by m numbers'],
      ['Also', 'the shape of every lexer and regular-expression engine'],
    ],
  },
  input: {
    minSize: 8,
    maxSize: 18,
    noun: 'text',
    placeholder: 'abcabaabcabac, abaa',
    note: 'text then pattern, over the alphabet a, b, c',
    label: 'The text and the pattern, separated by a comma',
    generate: generateText,
    parse: parseText,
    size: (value: TextInput) => value.text.length,
  },
  defaultSize: 12,
  result: { kind: 'transforms', verify: verifyMatches },
  record,
};
