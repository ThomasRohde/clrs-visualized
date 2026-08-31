import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * ROD CUTTING — CLRS §14.1.
 *
 * The chapter's opening example, and the cleanest possible statement of what
 * dynamic programming is for. A rod of length n can be cut into pieces; a
 * piece of length i sells for p[i]; what is the most a rod is worth?
 *
 * The recursive answer is immediate and useless: try every first cut, and
 * solve the remainder the same way. Immediate because it is obviously
 * correct; useless because it re-solves the same remainder over and over —
 * T(n) = 2ⁿ, so a rod of length 40 takes longer than the exercise is worth.
 *
 * Nothing about the recursion is wrong. What is wrong is doing it twice.
 *
 * **Fill a table instead.** Solve length 1, then length 2, and so on, and by
 * the time a subproblem is needed its answer is already sitting there. The
 * whole of chapter 14 is that move, and the two properties that let it work
 * are named in §14.3:
 *
 *   - **optimal substructure** — an optimal cutting of a rod contains optimal
 *     cuttings of the pieces it leaves;
 *   - **overlapping subproblems** — the same remainder comes up again and
 *     again, which is what makes remembering it worth anything.
 *
 * The run below fills `r` left to right. Watch each new entry take one price
 * from the top row and one revenue from a cell already filled — that pair is
 * the recurrence, and the whole algorithm is Θ(n²) because there are n cells
 * and each looks at at most n pairs.
 *
 * The number under each revenue is `s[j]`: **the length of the first piece**
 * in a best cutting of length j. That is what turns "how much is it worth"
 * into "so where do I cut", and it costs one extra write per cell.
 */

/** Row 0 is the price list, row 1 the revenue table. */
const PRICE = 0;
const REV = 1;

export function record(input: number[]): Trace {
  const p = [0, ...input];
  const n = input.length;

  const r = new Array<number | null>(n + 1).fill(null);
  const s = new Array<number | null>(n + 1).fill(null);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GridData {
    return {
      kind: 'grid',
      corner: 'j',
      colLabels: Array.from({ length: n + 1 }, (_, j) => j),
      rows: [
        // The price row starts at column 1: there is no price for a piece of
        // length 0, and lining p[j] up over r[j] is the whole point of the
        // picture.
        { label: 'p', cells: p.slice(1).map((v) => ({ value: v })), offset: 1 },
        {
          label: 'r',
          cells: r.map((v, j) => ({
            value: v,
            ...(s[j] ? { note: `cut ${s[j]}` } : {}),
          })),
        },
      ],
    };
  }

  const cell = (row: number, col: number) => `${row},${row === PRICE ? col - 1 : col}`;

  /** The entries of `r` that are final — everything left of the write head. */
  const solved = (upTo: number): string[] =>
    Array.from({ length: upTo }, (_, j) => cell(REV, j)).filter((_, j) => r[j] !== null);

  r[0] = 0;
  stats.writes++;
  emit(
    'EXTENDED-BOTTOM-UP-CUT-ROD',
    2,
    snapshot(),
    { move: cell(REV, 0), aux: { q: auxOf([null]) } },
    `r[0] = 0. A rod of length 0 is worth nothing, and every other entry builds on that.`,
  );

  for (let j = 1; j <= n; j++) {
    let q = -Infinity;
    let best = 0;
    emit(
      'EXTENDED-BOTTOM-UP-CUT-ROD',
      4,
      snapshot(),
      {
        done: solved(j),
        scope: Array.from({ length: j }, (_, i) => cell(PRICE, i + 1)),
        scopeLabel: `first cuts available for j = ${j}`,
        pointers: { j: cell(REV, j) },
        aux: { q: auxOf([null, null], 1, [null, 'q']) },
      },
      `Length ${j}. The first piece can be any length from 1 to ${j}; try each.`,
    );

    for (let i = 1; i <= j; i++) {
      const candidate = p[i]! + (r[j - i] as number);
      stats.comparisons++;
      const better = candidate > q;
      if (better) {
        q = candidate;
        best = i;
        stats.writes++;
      }
      emit(
        'EXTENDED-BOTTOM-UP-CUT-ROD',
        better ? 8 : 6,
        snapshot(),
        {
          done: solved(j),
          look: [cell(PRICE, i), cell(REV, j - i)],
          // The two arrows *are* the recurrence: a price and an answer already
          // in the table, combining into the cell being computed.
          arrows: [
            { from: cell(PRICE, i), to: cell(REV, j), role: 'look' as const },
            { from: cell(REV, j - i), to: cell(REV, j), role: 'look' as const },
          ],
          pointers: { i: cell(PRICE, i), j: cell(REV, j) },
          aux: { q: auxOf([null, q === -Infinity ? null : q], 1, [null, 'q']) },
        },
        `Cut ${i} first: p[${i}] = ${p[i]} plus r[${j - i}] = ${r[j - i]} is ${candidate}${
          better ? ' — the best so far.' : `, no better than ${q}.`
        }`,
      );
    }

    r[j] = q;
    s[j] = best;
    stats.writes++;
    emit(
      'EXTENDED-BOTTOM-UP-CUT-ROD',
      9,
      snapshot(),
      {
        done: solved(j),
        move: cell(REV, j),
        pointers: { j: cell(REV, j) },
        aux: { q: auxOf([null, q], 1, [null, 'q']) },
      },
      `r[${j}] = ${q}, first piece ${best}. This entry is now final and never recomputed.`,
    );
  }

  // Reconstruction: follow s from n down, which is what the note in each cell
  // was written for.
  const pieces: number[] = [];
  let rest = n;
  const path: string[] = [];
  while (rest > 0) {
    const piece = s[rest]!;
    pieces.push(piece);
    path.push(cell(REV, rest));
    emit(
      'PRINT-CUT-ROD-SOLUTION',
      3,
      snapshot(),
      {
        done: solved(n + 1),
        mark: [...path],
        look: cell(PRICE, piece),
        arrows: [{ from: cell(REV, rest), to: cell(REV, rest - piece), role: 'mark' as const }],
        pointers: { n: cell(REV, rest) },
        aux: { q: auxOf([null, r[n] as number], 1, [null, 'r[n]']) },
      },
      `Cut ${piece} off, leaving ${rest - piece}. The stored choices give the cuts, not just the price.`,
    );
    rest -= piece;
  }

  emit(
    'PRINT-CUT-ROD-SOLUTION',
    2,
    snapshot(),
    {
      mark: [...path],
      done: solved(n + 1).filter((k) => !path.includes(k)),
      pieces: pieces.slice(),
      revenue: r[n] as number,
      aux: { q: auxOf([null, r[n] as number], 1, [null, 'r[n]']) },
    },
    `Return r[${n}] = ${r[n]}, from pieces ${pieces.join(' + ')}. Θ(n²), not 2ⁿ.`,
  );

  return { steps, output: { revenue: r[n] as number, length: n } };
}

/**
 * Optimal by brute force, and the cuts really add up to the revenue.
 *
 * The reference answer is the exponential recursion the chapter starts from —
 * a genuinely different computation from the table, which is the point:
 * memoizing is only interesting if it gets the same answer the naive version
 * would have, eventually.
 */
function verify(input: number[], trace: Trace): string | null {
  const p = [0, ...input];
  const n = input.length;
  const naive = (len: number): number => {
    if (len === 0) return 0;
    let best = -Infinity;
    for (let i = 1; i <= len; i++) best = Math.max(best, p[i]! + naive(len - i));
    return best;
  };

  const last = trace.steps.at(-1)!.hi as { pieces?: number[]; revenue?: number };
  if (last.revenue === undefined || !last.pieces) return 'the run reported no result';
  const expected = naive(n);
  if (last.revenue !== expected) {
    return `the table says ${last.revenue}, the brute-force recursion says ${expected}`;
  }
  const total = last.pieces.reduce((sum, piece) => sum + piece, 0);
  if (total !== n) return `the cuts ${last.pieces.join('+')} come to ${total}, not ${n}`;
  const worth = last.pieces.reduce((sum, piece) => sum + p[piece]!, 0);
  if (worth !== expected) {
    return `the cuts ${last.pieces.join('+')} are worth ${worth}, not the ${expected} claimed`;
  }
  return null;
}

/** Prices that rise but not proportionally, so cutting is sometimes worth it. */
function generate(n: number): number[] {
  const size = Math.max(2, Math.min(n, 11));
  const prices: number[] = [];
  let last = 0;
  for (let i = 1; i <= size; i++) {
    // A price list that only ever rose in proportion would make "cut nothing"
    // optimal every time, and the table would have nothing to say.
    last += 1 + Math.floor(Math.random() * 4);
    prices.push(last);
  }
  return prices;
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2) return { error: 'Give at least two prices.' };
  if (parts.length > 11) return { error: 'At most 11 prices — the table stops fitting.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 99) {
      return { error: `"${part}" is not a whole number between 0 and 99.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const rodCutting: AlgorithmModule = {
  id: 'rod-cutting',
  name: 'Rod Cutting',
  visualizer: 'grid',
  aux: [{ key: 'q', label: 'q', hint: 'the best first cut found so far for this length' }],
  procOrder: ['EXTENDED-BOTTOM-UP-CUT-ROD', 'PRINT-CUT-ROD-SOLUTION'],
  procedures: {
    'EXTENDED-BOTTOM-UP-CUT-ROD': {
      title: 'EXTENDED-BOTTOM-UP-CUT-ROD(p, n)',
      indent: [0, 0, 0, 1, 1, 2, 3, 3, 1, 0],
      lines: [
        'let r[0:n] and s[1:n] be new arrays',
        'r[0] = 0',
        'for j = 1 to n',
        'q = −∞',
        'for i = 1 to j',
        'if q < p[i] + r[j − i]',
        'q = p[i] + r[j − i]',
        's[j] = i',
        'r[j] = q',
        'return r and s',
      ],
    },
    'PRINT-CUT-ROD-SOLUTION': {
      title: 'PRINT-CUT-ROD-SOLUTION(p, n)',
      indent: [0, 0, 1, 1],
      lines: [
        '(r, s) = EXTENDED-BOTTOM-UP-CUT-ROD(p, n)',
        'while n > 0',
        'print s[n]',
        'n = n − s[n]',
      ],
    },
  },
  complexity: {
    best: 'Θ(n²)',
    average: 'Θ(n²)',
    worst: 'Θ(n²)',
    space: 'Θ(n)',
    extra: [
      ['Naive recursion', 'Θ(2ⁿ) — every subproblem re-solved'],
      ['Subproblems', 'n + 1 of them, each solved once'],
      ['Work per subproblem', 'O(n), one pass over the possible first cuts'],
      ['Recovering the cuts', 'one extra array, s[j] — the note in each cell'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 11,
    noun: 'price list',
    placeholder: '1, 5, 8, 9, 10, 17, 17, 20',
    note: 'p[i] is what a piece of length i sells for',
    label: 'Prices by piece length, separated by commas',
    generate,
    parse,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
