import {
  auxOf,
  createRecorder,
  isTextInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type GridRow,
  type TextInput,
  type Trace,
} from '../types.ts';
import { columns, generateText, parseText, textRow } from './text-input.ts';

/**
 * SUFFIX ARRAYS — CLRS §32.5.
 *
 * The one algorithm in chapter 32 that preprocesses the **text** instead of
 * the pattern, and the only one that scales to a text searched many times.
 *
 * Everything in §32.1–32.4 assumes the text is new each time — a file being
 * grepped, a stream going past — and spends its preparation on the pattern.
 * A search engine, a genome database and a code index are the opposite case:
 * one enormous text, an endless stream of different patterns. Preparing the
 * pattern there is preparing the wrong thing.
 *
 * A **suffix array** is the starting positions of all n suffixes, sorted by
 * the suffixes themselves. Two facts make it a search structure:
 *
 * - every occurrence of a pattern is a **prefix of some suffix**; and
 * - the suffixes sharing a given prefix are **contiguous** once sorted.
 *
 * So finding every occurrence is finding the ends of one block, which is two
 * binary searches: O(m lg n), with all the occurrences located at once rather
 * than one scan per query. The run below does the searching at the end, and
 * the block it lands on is the answer.
 *
 * **Building it is the interesting part**, and is why this is a section
 * rather than a footnote. Sorting n suffixes naively compares strings of
 * total length Θ(n²), which would cost more than the searching ever saves.
 * The construction here is **prefix doubling**: sort by the first character,
 * then use those ranks to sort by the first two characters, then four, then
 * eight — each round reusing the last one's answer, so each comparison is
 * two integers rather than a string. ⌈lg n⌉ rounds of an O(n lg n) sort.
 *
 * Watch the highlighted window widen each round, and watch rows stop moving
 * once their prefix is unique — a row whose rank differs from its neighbour's
 * is settled, and no later round can reorder it.
 */

export function record(input: TextInput): Trace {
  const T = input.text;
  const P = input.pattern;
  const n = T.length;

  let rank = T.split('').map((ch) => ch.charCodeAt(0) - 97);
  let order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rank[a]! - rank[b]!);
  let window = 1;

  const { steps, stats, emit } = createRecorder();

  /**
   * Row 0 is the text; row i + 1 is the suffix starting at `order[i]`, drawn
   * at that offset so it lines up under the text it came from. The rank is
   * the note on its first cell.
   */
  function snapshot(lcp?: Array<number | null>): GridData {
    const rows: GridRow[] = [textRow(T)];
    order.forEach((start, i) => {
      rows.push({
        label: `${start + 1}`,
        offset: start,
        cells: T.slice(start)
          .split('')
          .map((ch, k): GridCell => ({
            value: ch,
            ...(k === 0
              ? {
                  note:
                    lcp && lcp[i] !== null && lcp[i] !== undefined
                      ? `lcp ${lcp[i]}`
                      : `r${rank[start]}`,
                }
              : {}),
          })),
      });
    });
    return { kind: 'grid', colLabels: columns(n), rows };
  }

  /** The cell at column `c` of the row holding the suffix now in position i. */
  const cell = (i: number, c: number) => `${i + 1},${c - order[i]!}`;
  /** The first `w` cells of every suffix row — the part being compared. */
  const windowCells = (w: number): string[] => {
    const out: string[] = [];
    order.forEach((start, i) => {
      for (let k = 0; k < Math.min(w, n - start); k++) out.push(`${i + 1},${k}`);
    });
    return out;
  };
  const rowWindow = (i: number, w: number): string[] => {
    const start = order[i]!;
    return Array.from({ length: Math.min(w, n - start) }, (_, k) => `${i + 1},${k}`);
  };

  const chips = (w: number) => auxOf([null, w, n], undefined, [null, 'compared', 'of n']);

  emit(
    'SUFFIX-ARRAY',
    2,
    snapshot(),
    { mark: windowCells(1), aux: { w: chips(1) } },
    `Sorted by the first character only. Ties are everywhere, and each round halves how many remain.`,
  );

  // ---- prefix doubling ---------------------------------------------------
  while (window < n) {
    const next = Math.min(2 * window, n);
    const keyOf = (i: number): [number, number] => [
      rank[i]!,
      i + window < n ? rank[i + window]! : -1,
    ];

    order = [...order].sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });

    emit(
      'SUFFIX-ARRAY',
      4,
      snapshot(),
      {
        mark: windowCells(next),
        scope: [],
        aux: { w: chips(next) },
      },
      `Round: sort by the first ${next} characters, using the last round's ranks as one comparison.`,
    );

    const fresh = new Array<number>(n).fill(0);
    for (let i = 1; i < n; i++) {
      const a = order[i - 1]!;
      const b = order[i]!;
      const ka = keyOf(a);
      const kb = keyOf(b);
      stats.comparisons++;
      const same = ka[0] === kb[0] && ka[1] === kb[1];
      fresh[b] = fresh[a]! + (same ? 0 : 1);
      stats.writes++;
      emit(
        'SUFFIX-ARRAY',
        5,
        snapshot(),
        {
          look: [...rowWindow(i - 1, next), ...rowWindow(i, next)],
          move: [cell(i, order[i]!)],
          mark: windowCells(next).filter(
            (k) => !rowWindow(i - 1, next).includes(k) && !rowWindow(i, next).includes(k),
          ),
          pointers: { i: cell(i, order[i]!) },
          aux: { w: chips(next) },
        },
        same
          ? `Suffixes ${a + 1} and ${b + 1} agree on all ${next}: same rank, and this round cannot separate them.`
          : `They differ inside ${next} characters, so ${b + 1} gets a new rank — its place is settled.`,
      );
    }

    rank = fresh;
    window = next;
    if (Math.max(...rank) === n - 1) {
      emit(
        'SUFFIX-ARRAY',
        6,
        snapshot(),
        { done: windowCells(n), aux: { w: chips(window) } },
        `Every rank is distinct, so no later round could move anything. The array is sorted.`,
      );
      break;
    }
  }

  // ---- the LCP array, which is what makes a query O(m + lg n) ------------
  const lcp: Array<number | null> = new Array<number | null>(n).fill(null);
  for (let i = 1; i < n; i++) {
    const a = order[i - 1]!;
    const b = order[i]!;
    let len = 0;
    while (a + len < n && b + len < n && T[a + len] === T[b + len]) len++;
    lcp[i] = len;
    stats.writes++;
    emit(
      'SUFFIX-ARRAY',
      7,
      snapshot(lcp),
      {
        look: [
          ...Array.from({ length: len }, (_, k) => `${i},${k}`),
          ...Array.from({ length: len }, (_, k) => `${i + 1},${k}`),
        ],
        move: [`${i + 1},0`],
        aux: { w: chips(window) },
      },
      len === 0
        ? `Suffixes ${a + 1} and ${b + 1} share nothing: lcp 0.`
        : `They share ${len} character${len === 1 ? '' : 's'}. Adjacent suffixes are the most alike.`,
    );
  }

  // ---- the query: two binary searches ------------------------------------
  const suffixAt = (i: number) => T.slice(order[i]!);
  const cmp = (i: number) => {
    const s = suffixAt(i).slice(0, P.length);
    return s < P ? -1 : s === P ? 0 : 1;
  };

  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    stats.comparisons++;
    const c = cmp(mid);
    emit(
      'SUFFIX-ARRAY',
      9,
      snapshot(lcp),
      {
        scope: Array.from({ length: Math.max(1, hi - lo) }, (_, k) => `${lo + k + 1},0`),
        scopeLabel: `still possible: rows ${lo + 1}–${hi}`,
        look: rowWindow(mid, P.length),
        pointers: { mid: `${mid + 1},0` },
        aux: { w: chips(window) },
      },
      c < 0
        ? `Suffix ${order[mid]! + 1} starts before "${P}": everything above it is out.`
        : `Suffix ${order[mid]! + 1} is at or after "${P}": the block starts here or earlier.`,
    );
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  const first = lo;

  let last = first;
  while (last < n && cmp(last) === 0) last++;

  const found = Array.from({ length: last - first }, (_, k) => order[first + k]!).sort(
    (a, b) => a - b,
  );
  emit(
    'SUFFIX-ARRAY',
    10,
    snapshot(lcp),
    {
      mark: Array.from({ length: last - first }, (_, k) => rowWindow(first + k, P.length)).flat(),
      matches: found,
      aux: { w: chips(window) },
    },
    found.length === 0
      ? `No suffix starts with "${P}", so the pattern does not occur. Two binary searches, no scan.`
      : `${found.length} suffix${found.length === 1 ? '' : 'es'} start${found.length === 1 ? 's' : ''} with "${P}" — one contiguous block, found in O(m lg n).`,
  );

  return { steps, output: { n, matches: found.length } };
}

/**
 * The array really is the sorted suffixes, and the query block really is
 * every occurrence.
 *
 * Both halves are checked against the language's own comparison and substring
 * search, neither of which shares anything with prefix doubling or with a
 * binary search over it.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isTextInput(input)) return 'not a text input';
  const { text: T, pattern: P } = input;
  const n = T.length;

  const last = trace.steps.at(-1)!;
  if (last.data?.kind !== 'grid') return 'the last step carries no grid';
  // Row 0 is the text; the rest are the suffixes in the order they ended up.
  const starts = last.data.rows.slice(1).map((row) => row.offset ?? 0);
  if (starts.length !== n) return `${starts.length} suffixes for a text of ${n}`;
  if (new Set(starts).size !== n) return 'a suffix appears twice';

  for (let i = 1; i < n; i++) {
    const a = T.slice(starts[i - 1]!);
    const b = T.slice(starts[i]!);
    if (a >= b)
      return `suffix ${starts[i - 1]! + 1} ("${a}") is not before ${starts[i]! + 1} ("${b}")`;
  }

  const expected: number[] = [];
  for (let s = 0; s + P.length <= n; s++) if (T.startsWith(P, s)) expected.push(s);
  const found = (last.hi as { matches?: number[] }).matches;
  if (!found) return 'the query reported nothing';
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    return `the query found ${JSON.stringify(found)}, but "${P}" occurs at ${JSON.stringify(expected)}`;
  }
  return null;
}

export const suffixArray: AlgorithmModule = {
  id: 'suffix-array',
  name: 'Suffix Array',
  visualizer: 'grid',
  aux: [{ key: 'w', label: 'w', hint: 'characters being compared this round' }],
  procOrder: ['SUFFIX-ARRAY'],
  procedures: {
    // A transcription of §32.5's prose. The book develops suffix arrays and
    // the LCP array through their properties rather than as one numbered
    // procedure; this is the prefix-doubling construction it describes,
    // written out so the highlighted line has somewhere to point.
    'SUFFIX-ARRAY': {
      title: 'SUFFIX-ARRAY(T, n)',
      indent: [0, 0, 0, 1, 1, 2, 1, 0, 0, 1, 0],
      lines: [
        'rank[i] = T[i], for every position i',
        'sort the positions by rank',
        'for w = 1, 2, 4, … while w < n',
        'sort the positions by the pair (rank[i], rank[i+w])',
        'for each position in the new order',
        'give it a new rank, equal to its predecessor’s if the pairs agree',
        'w = 2w',
        'lcp[i] = the common prefix of adjacent suffixes',
        'to find P: binary search for the first suffix ≥ P',
        'and for the last one starting with P',
        'return every position in that block',
      ],
    },
  },
  complexity: {
    best: 'Θ(n lg² n)',
    average: 'Θ(n lg² n)',
    worst: 'Θ(n lg² n)',
    space: 'Θ(n)',
    extra: [
      ['Rounds', '⌈lg n⌉ — the compared prefix doubles each time'],
      ['Naive sorting', 'Θ(n² lg n) — comparing whole suffixes'],
      ['Best known construction', 'Θ(n), by the DC3/skew algorithm'],
      ['A query', 'O(m lg n), or O(m + lg n) with the LCP array'],
      ['Versus a suffix tree', 'the same answers in a fraction of the memory'],
    ],
  },
  input: {
    minSize: 6,
    maxSize: 12,
    noun: 'text',
    placeholder: 'abcabaabca, aba',
    note: 'the text is what gets preprocessed; the pattern is only the query',
    label: 'The text and the pattern to look for, separated by a comma',
    generate: (n) => generateText(Math.min(n, 12)),
    parse: parseText,
    size: (value: TextInput) => value.text.length,
  },
  defaultSize: 9,
  result: { kind: 'transforms', verify },
  record,
};
