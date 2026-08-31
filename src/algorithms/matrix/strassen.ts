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
 * STRASSEN'S ALGORITHM — CLRS §4.2.
 *
 * Multiplying two 2 × 2 matrices the obvious way takes **eight**
 * multiplications. Strassen does it in **seven**, at the cost of a good many
 * extra additions.
 *
 * On 2 × 2 numbers that trade is worthless: an addition and a multiplication
 * cost about the same, and swapping one multiplication for eighteen additions
 * is a bad deal. The point is what happens when the eight entries are
 * **blocks** rather than numbers. Split two n × n matrices into quadrants and
 * the same seven formulas hold, with each multiplication now a multiplication
 * of n/2 × n/2 matrices — and the additions are only Θ(n²) while the
 * multiplications are the expensive part.
 *
 *     T(n) = 7·T(n/2) + Θ(n²)
 *
 * which the master method (§4.5) solves to Θ(n^lg 7) ≈ Θ(n^2.81). Eight
 * recursive calls would have given Θ(n^lg 8) = Θ(n³), the algorithm §4.1
 * already had. The whole gain is one call fewer, compounding through every
 * level of the recursion.
 *
 * The run below is the base case, because that is where the trick lives.
 * Seven products, each of a **sum or difference** of entries rather than of
 * two entries; then four sums of those products, arranged so that everything
 * unwanted cancels. Watch the last one: `C₂₂ = P₅ + P₁ − P₃ − P₇` expands to
 * fourteen terms, twelve of which cancel in pairs.
 *
 * Nobody derived these by insight, and it is worth saying so. They are the
 * output of a search; Strassen's contribution was proving that fewer than
 * eight was possible at all, which had been assumed impossible. Seven is now
 * known to be optimal for 2 × 2.
 */

/** The seven products, as `[label, formula, value]` triples. */
interface Product {
  label: string;
  formula: string;
  /** Entries of A and B the formula reads. */
  reads: string[];
  value: number;
}

export function record(input: number[]): Trace {
  const [a11, a12, a21, a22, b11, b12, b21, b22] = input as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const A = [
    [a11, a12],
    [a21, a22],
  ];
  const B = [
    [b11, b12],
    [b21, b22],
  ];
  const C: Array<Array<number | null>> = [
    [null, null],
    [null, null],
  ];
  const P: Array<number | null> = new Array<number | null>(7).fill(null);

  const { steps, stats, emit } = createRecorder();

  /** Rows: 0‥1 = A, 2‥3 = B, 4 = the seven products, 5‥6 = C. */
  const a = (i: number, j: number) => `${i},${j}`;
  const b = (i: number, j: number) => `${2 + i},${j}`;
  const p = (k: number) => `4,${k}`;
  const c = (i: number, j: number) => `${5 + i},${j}`;

  function snapshot(): GridData {
    return {
      kind: 'grid',
      rows: [
        { label: 'A₁', cells: A[0]!.map((v): GridCell => ({ value: v })) },
        { label: 'A₂', cells: A[1]!.map((v): GridCell => ({ value: v })) },
        { label: 'B₁', cells: B[0]!.map((v): GridCell => ({ value: v })) },
        { label: 'B₂', cells: B[1]!.map((v): GridCell => ({ value: v })) },
        { label: 'P', cells: P.map((v, k): GridCell => ({ value: v, note: `P${k + 1}` })) },
        { label: 'C₁', cells: C[0]!.map((v): GridCell => ({ value: v })) },
        { label: 'C₂', cells: C[1]!.map((v): GridCell => ({ value: v })) },
      ],
    };
  }

  const madeSoFar = (): string[] => {
    const out: string[] = [];
    P.forEach((v, k) => {
      if (v !== null) out.push(p(k));
    });
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) if (C[i]![j] !== null) out.push(c(i, j));
    }
    return out;
  };

  const chips = (done: number) => auxOf([null, done, 8], undefined, [null, 'used', 'the naive 8']);

  const products: Product[] = [
    {
      label: 'P₁',
      formula: 'a₁₁·(b₁₂ − b₂₂)',
      reads: [a(0, 0), b(0, 1), b(1, 1)],
      value: a11 * (b12 - b22),
    },
    {
      label: 'P₂',
      formula: '(a₁₁ + a₁₂)·b₂₂',
      reads: [a(0, 0), a(0, 1), b(1, 1)],
      value: (a11 + a12) * b22,
    },
    {
      label: 'P₃',
      formula: '(a₂₁ + a₂₂)·b₁₁',
      reads: [a(1, 0), a(1, 1), b(0, 0)],
      value: (a21 + a22) * b11,
    },
    {
      label: 'P₄',
      formula: 'a₂₂·(b₂₁ − b₁₁)',
      reads: [a(1, 1), b(1, 0), b(0, 0)],
      value: a22 * (b21 - b11),
    },
    {
      label: 'P₅',
      formula: '(a₁₁ + a₂₂)·(b₁₁ + b₂₂)',
      reads: [a(0, 0), a(1, 1), b(0, 0), b(1, 1)],
      value: (a11 + a22) * (b11 + b22),
    },
    {
      label: 'P₆',
      formula: '(a₁₂ − a₂₂)·(b₂₁ + b₂₂)',
      reads: [a(0, 1), a(1, 1), b(1, 0), b(1, 1)],
      value: (a12 - a22) * (b21 + b22),
    },
    {
      label: 'P₇',
      formula: '(a₁₁ − a₂₁)·(b₁₁ + b₁₂)',
      reads: [a(0, 0), a(1, 0), b(0, 0), b(0, 1)],
      value: (a11 - a21) * (b11 + b12),
    },
  ];

  const allP = Array.from({ length: 7 }, (_, k) => p(k));

  emit(
    'STRASSEN',
    1,
    snapshot(),
    {
      scope: allP,
      scopeLabel: 'seven products, where the definition needs eight',
      aux: { count: chips(0) },
    },
    `Two 2 × 2 matrices. The definition would take 8 multiplications; this takes 7.`,
  );

  products.forEach((product, k) => {
    P[k] = product.value;
    stats.comparisons++;
    stats.writes++;
    emit(
      'STRASSEN',
      3,
      snapshot(),
      {
        done: madeSoFar().filter((key) => key !== p(k)),
        move: p(k),
        look: product.reads,
        scope: allP,
        scopeLabel: `product ${k + 1} of 7`,
        aux: { count: chips(k + 1) },
      },
      `${product.label} = ${product.formula} = ${product.value}. One multiplication, of two sums.`,
    );
  });

  const combos: Array<{ i: number; j: number; from: number[]; formula: string; value: number }> = [
    {
      i: 0,
      j: 0,
      from: [4, 3, 1, 5],
      formula: 'P₅ + P₄ − P₂ + P₆',
      value: P[4]! + P[3]! - P[1]! + P[5]!,
    },
    { i: 0, j: 1, from: [0, 1], formula: 'P₁ + P₂', value: P[0]! + P[1]! },
    { i: 1, j: 0, from: [2, 3], formula: 'P₃ + P₄', value: P[2]! + P[3]! },
    {
      i: 1,
      j: 1,
      from: [4, 0, 2, 6],
      formula: 'P₅ + P₁ − P₃ − P₇',
      value: P[4]! + P[0]! - P[2]! - P[6]!,
    },
  ];

  for (const combo of combos) {
    C[combo.i]![combo.j] = combo.value;
    stats.writes++;
    emit(
      'STRASSEN',
      5,
      snapshot(),
      {
        done: madeSoFar().filter((key) => key !== c(combo.i, combo.j)),
        move: c(combo.i, combo.j),
        look: combo.from.map(p),
        arrows: combo.from.map((k) => ({
          from: p(k),
          to: c(combo.i, combo.j),
          role: 'look' as const,
        })),
        aux: { count: chips(7) },
      },
      `c${combo.i + 1}${combo.j + 1} = ${combo.formula} = ${combo.value}. Additions only — no more multiplying.`,
    );
  }

  emit(
    'STRASSEN',
    6,
    snapshot(),
    {
      done: madeSoFar(),
      product: C.map((row) => [...row] as number[]),
      aux: { count: chips(7) },
    },
    `Seven multiplications instead of eight. On blocks, that is Θ(n^lg 7) instead of Θ(n³).`,
  );

  return { steps, output: { multiplications: 7 } };
}

/**
 * The seven-product answer is the ordinary product.
 *
 * Checked against the definition — the triple loop of §4.1 — which is a
 * genuinely different computation and is exactly the claim Strassen makes.
 */
function verify(input: number[], trace: Trace): string | null {
  const A = [
    [input[0]!, input[1]!],
    [input[2]!, input[3]!],
  ];
  const B = [
    [input[4]!, input[5]!],
    [input[6]!, input[7]!],
  ];
  const C = (trace.steps.at(-1)!.hi as { product?: number[][] }).product;
  if (!C) return 'the run returned no product';

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let sum = 0;
      for (let k = 0; k < 2; k++) sum += A[i]![k]! * B[k]![j]!;
      if (C[i]![j] !== sum) {
        return `c${i + 1}${j + 1} is ${C[i]![j]}, but the definition gives ${sum}`;
      }
    }
  }
  return null;
}

/** Eight entries: A row by row, then B. The size slider has nothing to set. */
function generate(): number[] {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 19) - 9);
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== 8) return { error: 'Give 8 numbers: A row by row, then B.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < -99 || v > 99) {
      return { error: `"${part}" is not a whole number between −99 and 99.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const strassen: AlgorithmModule = {
  id: 'strassen',
  name: "Strassen's Algorithm",
  visualizer: 'grid',
  aux: [{ key: 'count', label: '×', hint: 'multiplications used, against the naive eight' }],
  procOrder: ['STRASSEN'],
  procedures: {
    // A condensed transcription. The book gives the ten sums S₁‥S₁₀ their own
    // lines; here each product's formula is written out where it is used,
    // because the sums are never on screen and a line highlighted against an
    // invisible variable teaches nothing.
    STRASSEN: {
      title: 'STRASSEN(A, B, n)',
      indent: [0, 0, 1, 0, 1, 0],
      lines: [
        'if n == 1 return A·B',
        'partition A and B into quadrants; form the 10 sums S₁‥S₁₀',
        'P₁‥P₇ = seven products of quadrants and sums',
        'combine:',
        'C₁₁ = P₅+P₄−P₂+P₆   C₁₂ = P₁+P₂   C₂₁ = P₃+P₄   C₂₂ = P₅+P₁−P₃−P₇',
        'return C',
      ],
    },
  },
  complexity: {
    best: 'Θ(n^lg 7)',
    average: 'Θ(n^lg 7)',
    worst: 'Θ(n^lg 7)',
    space: 'Θ(n²)',
    extra: [
      ['Recurrence', 'T(n) = 7 T(n/2) + Θ(n²)'],
      ['lg 7', '≈ 2.807, against 3 for the definition'],
      ['Multiplications at 2 × 2', '7 — proved optimal'],
      ['Additions at 2 × 2', '18, against 4 for the definition'],
      ['Worth it from about', 'n in the low hundreds, and it is numerically less stable'],
    ],
  },
  input: {
    // Fixed at the base case: the trick is the seven products, and at larger
    // sizes those products are recursive calls with nothing to draw.
    minSize: 2,
    maxSize: 2,
    noun: 'pair',
    placeholder: '1, 3, 7, 5, 6, 8, 4, 2',
    note: 'two 2 × 2 matrices, A then B, row by row',
    label: 'Eight numbers: A row by row, then B',
    generate,
    parse,
    size: () => 2,
  },
  defaultSize: 2,
  result: { kind: 'transforms', verify },
  record,
};
