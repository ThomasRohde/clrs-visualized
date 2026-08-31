import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * MATRIX-CHAIN MULTIPLICATION — CLRS §14.2.
 *
 * Matrix multiplication is associative, so `A(BC)` and `(AB)C` give the same
 * answer — and can cost wildly different amounts of arithmetic. Multiplying a
 * `p × q` by a `q × r` costs `p·q·r` scalar multiplications, so the order the
 * parentheses go in decides how much work the whole chain takes. The book's
 * example differs by a factor of ten, and the gap grows with the chain.
 *
 * The number of ways to parenthesise n matrices is the Catalan number, which
 * is Ω(4ⁿ/n^{3/2}) — so trying them all is out for anything past a handful.
 *
 * **Every parenthesisation splits somewhere.** Whatever the best one is, it
 * multiplies some `A_i‥A_k` by some `A_{k+1}‥A_j` at the top, and both halves
 * must themselves be optimally parenthesised — that is the optimal
 * substructure. So `m[i, j]`, the cost of the best way to multiply
 * `A_i‥A_j`, is the cheapest over all n − 1 choices of k:
 *
 *     m[i, j] = min over k of ( m[i, k] + m[k+1, j] + p_{i-1}·p_k·p_j )
 *
 * The table below is that recurrence being filled in. What matters is **the
 * order the cells are filled**: by chain *length*, moving up the diagonals,
 * so that every entry the recurrence reaches has already been computed. The
 * two arrows on each step are the two subchains being combined — one to the
 * left along the row, one down the column — and watching them sweep is
 * watching the min being taken.
 *
 * The bottom half of the table is empty and stays empty: `m[i, j]` means
 * nothing when `i > j`. The diagonal is zero, because a single matrix takes
 * no multiplications at all.
 *
 * The number under each entry is `s[i, j]` — **where the split goes**. That
 * is what turns the cost into an actual parenthesisation, and the run
 * reconstructs it at the end.
 */

export function record(input: number[]): Trace {
  // p has n + 1 dimensions for n matrices: A_i is p[i-1] × p[i].
  const p = input;
  const n = p.length - 1;

  const m: Array<Array<number | null>> = Array.from({ length: n + 1 }, () =>
    new Array<number | null>(n + 1).fill(null),
  );
  const s: Array<Array<number | null>> = Array.from({ length: n + 1 }, () =>
    new Array<number | null>(n + 1).fill(null),
  );

  const { steps, stats, emit } = createRecorder();

  /** Row r of the drawing is matrix i = r + 1; column c is j = c + 1. */
  const key = (i: number, j: number) => `${i - 1},${j - 1}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const cells: GridCell[] = [];
      for (let j = 1; j <= n; j++) {
        cells.push({
          value: m[i]![j] ?? null,
          ...(s[i]![j] ? { note: `k=${s[i]![j]}` } : {}),
        });
      }
      rows.push({ label: `i=${i}`, cells });
    }
    return {
      kind: 'grid',
      corner: 'm',
      colLabels: Array.from({ length: n }, (_, j) => `j=${j + 1}`),
      rows,
    };
  }

  /** Every entry already computed — the part of the table that is final. */
  const filled = (): string[] => {
    const out: string[] = [];
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) if (m[i]![j] !== null) out.push(key(i, j));
    }
    return out;
  };

  const dims = () => auxOf([null, ...p], undefined, [null, ...p.map((_, k) => `p${k}`)]);

  for (let i = 1; i <= n; i++) {
    m[i]![i] = 0;
    stats.writes++;
  }
  emit(
    'MATRIX-CHAIN-ORDER',
    3,
    snapshot(),
    {
      done: filled(),
      scope: Array.from({ length: n }, (_, i) => key(i + 1, i + 1)),
      scopeLabel: 'a chain of one matrix costs nothing',
      aux: { p: dims() },
    },
    `The diagonal is 0: one matrix on its own takes no multiplications. Everything builds from it.`,
  );

  for (let len = 2; len <= n; len++) {
    for (let i = 1; i <= n - len + 1; i++) {
      const j = i + len - 1;
      let best = Infinity;
      let bestK = i;

      const diagonal: string[] = [];
      for (let a = 1; a + len - 1 <= n; a++) diagonal.push(key(a, a + len - 1));
      emit(
        'MATRIX-CHAIN-ORDER',
        7,
        snapshot(),
        {
          done: filled(),
          move: key(i, j),
          scope: diagonal,
          scopeLabel: `chains of length ${len}`,
          pointers: { j: key(i, j) },
          aux: { p: dims() },
        },
        `A${i}‥A${j}: ${len} matrices, so there are ${len - 1} places the top split could go.`,
      );

      for (let k = i; k < j; k++) {
        const cost = m[i]![k]! + m[k + 1]![j]! + p[i - 1]! * p[k]! * p[j]!;
        stats.comparisons++;
        const better = cost < best;
        if (better) {
          best = cost;
          bestK = k;
        }
        emit(
          'MATRIX-CHAIN-ORDER',
          better ? 11 : 9,
          snapshot(),
          {
            done: filled(),
            look: [key(i, k), key(k + 1, j)],
            move: key(i, j),
            // The two arrows are the recurrence: the left subchain along the
            // row, the right one down the column, meeting at the entry being
            // computed.
            arrows: [
              { from: key(i, k), to: key(i, j), role: 'look' as const },
              { from: key(k + 1, j), to: key(i, j), role: 'look' as const },
            ],
            pointers: { k: key(i, k) },
            aux: { p: dims() },
          },
          `Split after A${k}: ${m[i]![k]} + ${m[k + 1]![j]} + ${p[i - 1]}·${p[k]}·${p[j]} = ${cost}${
            better ? ' — best so far.' : '.'
          }`,
        );
      }

      m[i]![j] = best;
      s[i]![j] = bestK;
      stats.writes++;
      emit(
        'MATRIX-CHAIN-ORDER',
        12,
        snapshot(),
        {
          done: filled().filter((c) => c !== key(i, j)),
          move: key(i, j),
          pointers: { j: key(i, j) },
          aux: { p: dims() },
        },
        `m[${i},${j}] = ${best}, splitting after A${bestK}. Final — no later cell recomputes it.`,
      );
    }
  }

  // Reconstruction: PRINT-OPTIMAL-PARENS, which is what `s` was stored for.
  const path: string[] = [];
  const parens = (i: number, j: number): string => {
    if (i === j) return `A${i}`;
    path.push(key(i, j));
    const k = s[i]![j]!;
    return `(${parens(i, k)}${parens(k + 1, j)})`;
  };
  const expression = parens(1, n);

  emit(
    'PRINT-OPTIMAL-PARENS',
    1,
    snapshot(),
    {
      done: filled().filter((c) => !path.includes(c)),
      mark: [...path],
      arrows: path
        .filter((c) => c !== key(1, n))
        .map((c) => ({ from: key(1, n), to: c, role: 'mark' as const })),
      order: expression,
      cost: m[1]![n] as number,
      aux: { p: dims() },
    },
    `m[1,${n}] = ${m[1]![n]}, and the stored splits give ${expression}.`,
  );

  return { steps, output: { cost: m[1]![n] as number, matrices: n } };
}

/**
 * Optimal against every parenthesisation, and the parenthesisation printed
 * really costs what the table claims.
 *
 * The reference is a plain exponential recursion over all splits — the thing
 * the table exists to avoid — so this compares the dynamic program against
 * the definition rather than against itself. It also re-costs the printed
 * expression from scratch, which is what catches an `s` table that is
 * internally consistent and wrong.
 */
function verify(input: number[], trace: Trace): string | null {
  const p = input;
  const n = p.length - 1;
  const memo = new Map<string, number>();
  const best = (i: number, j: number): number => {
    if (i === j) return 0;
    const cached = memo.get(`${i},${j}`);
    if (cached !== undefined) return cached;
    let out = Infinity;
    for (let k = i; k < j; k++) {
      out = Math.min(out, best(i, k) + best(k + 1, j) + p[i - 1]! * p[k]! * p[j]!);
    }
    memo.set(`${i},${j}`, out);
    return out;
  };

  const hi = trace.steps.at(-1)!.hi as { cost?: number; order?: string };
  if (hi.cost === undefined || !hi.order) return 'the run reported no result';
  const expected = best(1, n);
  if (hi.cost !== expected) return `the table says ${hi.cost}, the recursion says ${expected}`;

  // Cost the printed expression independently: parse it back and multiply out.
  let at = 0;
  const parse = (): { lo: number; hi: number; cost: number } | null => {
    if (hi.order![at] === '(') {
      at++;
      const left = parse();
      const right = parse();
      if (!left || !right || hi.order![at] !== ')') return null;
      at++;
      if (left.hi + 1 !== right.lo) return null;
      return {
        lo: left.lo,
        hi: right.hi,
        cost: left.cost + right.cost + p[left.lo - 1]! * p[left.hi]! * p[right.hi]!,
      };
    }
    const match = /^A(\d+)/.exec(hi.order!.slice(at));
    if (!match) return null;
    at += match[0].length;
    const i = Number(match[1]);
    return { lo: i, hi: i, cost: 0 };
  };
  const parsed = parse();
  if (!parsed || at !== hi.order.length) return `could not read back "${hi.order}"`;
  if (parsed.lo !== 1 || parsed.hi !== n) return `"${hi.order}" is not the whole chain`;
  if (parsed.cost !== expected) {
    return `"${hi.order}" actually costs ${parsed.cost}, not the ${expected} claimed`;
  }
  return null;
}

/** Dimensions that vary enough for the parenthesisation to matter. */
function generate(n: number): number[] {
  const matrices = Math.max(2, Math.min(n, 7));
  return Array.from({ length: matrices + 1 }, () => 5 * (1 + Math.floor(Math.random() * 8)));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 3) return { error: 'Give at least three dimensions — that is two matrices.' };
  if (parts.length > 8) return { error: 'At most 8 dimensions; the table is n × n.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 1 || v > 999) {
      return { error: `"${part}" is not a whole number between 1 and 999.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const matrixChainOrder: AlgorithmModule = {
  id: 'matrix-chain-order',
  name: 'Matrix-Chain Order',
  visualizer: 'grid',
  aux: [{ key: 'p', label: 'p', hint: 'the dimensions: Aᵢ is p[i−1] × p[i]' }],
  procOrder: ['MATRIX-CHAIN-ORDER', 'PRINT-OPTIMAL-PARENS'],
  procedures: {
    'MATRIX-CHAIN-ORDER': {
      title: 'MATRIX-CHAIN-ORDER(p, n)',
      indent: [0, 0, 1, 0, 1, 2, 2, 2, 3, 3, 4, 4, 0],
      lines: [
        'let m[1:n, 1:n] and s[1:n−1, 2:n] be new tables',
        'for i = 1 to n',
        'm[i, i] = 0',
        'for l = 2 to n',
        'for i = 1 to n − l + 1',
        'j = i + l − 1',
        'm[i, j] = ∞',
        'for k = i to j − 1',
        'q = m[i, k] + m[k+1, j] + p[i−1] p[k] p[j]',
        'if q < m[i, j]',
        'm[i, j] = q',
        's[i, j] = k',
        'return m and s',
      ],
    },
    'PRINT-OPTIMAL-PARENS': {
      title: 'PRINT-OPTIMAL-PARENS(s, i, j)',
      indent: [0, 1, 1, 2, 2, 2],
      lines: [
        'if i == j',
        'print "A" i',
        'else print "("',
        'PRINT-OPTIMAL-PARENS(s, i, s[i, j])',
        'PRINT-OPTIMAL-PARENS(s, s[i, j] + 1, j)',
        'print ")"',
      ],
    },
  },
  complexity: {
    best: 'Θ(n³)',
    average: 'Θ(n³)',
    worst: 'Θ(n³)',
    space: 'Θ(n²)',
    extra: [
      ['Parenthesisations', 'Catalan(n−1) — Ω(4ⁿ/n^{3/2}), so not enumerable'],
      ['Subproblems', 'Θ(n²) — one per pair i ≤ j'],
      ['Work per subproblem', 'O(n) — one pass over the split points'],
      ['Fill order', 'by chain length, up the diagonals'],
      ['Recovering the parentheses', 's[i, j] — the note in each cell'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 7,
    noun: 'chain',
    placeholder: '30, 35, 15, 5, 10, 20, 25',
    note: 'n + 1 dimensions describe n matrices',
    label: 'Matrix dimensions p0…pn, separated by commas',
    generate,
    parse,
    // The slider sets how many *matrices* there are; the input is one longer.
    size: (value: number[]) => value.length - 1,
  },
  defaultSize: 6,
  result: { kind: 'transforms', verify },
  record,
};
