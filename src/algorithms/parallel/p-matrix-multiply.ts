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
 * P-MATRIX-MULTIPLY — CLRS §26.2.
 *
 * The same triple loop as chapter 4, with two words changed: the outer two
 * `for`s become `parallel for`. Nothing about *what* is computed differs at
 * all, and the two players make the point better together than either does
 * alone — **run chapter 4's matrix multiply beside this one on the same
 * matrices**. It takes n³ steps to get here. This takes n.
 *
 * That is the whole idea of the chapter made concrete. The work is unchanged
 * at Θ(n³): every one of those multiply-adds still happens, and the counter
 * says so. What changed is the **span**. Nothing in `c[i][j]`'s computation
 * depends on `c[i'][j']`, so all n² entries can be computed at once, and the
 * only thing that must happen in order is the k-loop inside each of them.
 * Span Θ(n), parallelism Θ(n²).
 *
 * **Each step of this trace is one step of parallel time.** Watch column k of
 * A and row k of B light up together: between them they hold exactly one term
 * for every entry of C, and all n² entries take that term simultaneously. The
 * whole product is built in n passes, each pass consuming one column and one
 * row.
 *
 * A `parallel for` is not magic and is not free. The compiler turns it into a
 * balanced binary tree of spawns, so scheduling n² iterations costs Θ(lg n)
 * span and Θ(n²) extra work — which is why the span here is Θ(n) from the
 * k-loop rather than Θ(1), and why the recursive version in §26.2 that
 * parallelises the sum as well gets to Θ(lg n).
 */

export function record(input: number[]): Trace {
  const n = Math.round(Math.sqrt(input.length / 2));
  const A: number[][] = [];
  const B: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push(input.slice(i * n, i * n + n));
    B.push(input.slice(n * n + i * n, n * n + i * n + n));
  }
  const C: Array<Array<number | null>> = Array.from({ length: n }, () =>
    new Array<number | null>(n).fill(null),
  );

  const { steps, stats, emit } = createRecorder();

  /** Rows 0‥n−1 are A, n‥2n−1 are B, 2n‥3n−1 are C — chapter 4's layout. */
  const a = (i: number, j: number) => `${i},${j}`;
  const b = (i: number, j: number) => `${n + i},${j}`;
  const c = (i: number, j: number) => `${2 * n + i},${j}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push({ label: `A${i + 1}`, cells: A[i]!.map((v): GridCell => ({ value: v })) });
    }
    for (let i = 0; i < n; i++) {
      rows.push({ label: `B${i + 1}`, cells: B[i]!.map((v): GridCell => ({ value: v })) });
    }
    for (let i = 0; i < n; i++) {
      rows.push({ label: `C${i + 1}`, cells: C[i]!.map((v): GridCell => ({ value: v })) });
    }
    return {
      kind: 'grid',
      corner: '',
      colLabels: Array.from({ length: n }, (_, j) => j + 1),
      rows,
    };
  }

  const everyC = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(c(i, j));
    return out;
  };

  /** Work counts multiply-adds; span counts steps of parallel time. */
  let work = 0;
  let span = 0;
  const chips = () => ({
    T: auxOf([null, work, span], undefined, [null, 'T₁', 'T∞']),
  });

  emit(
    'P-MATRIX-MULTIPLY',
    1,
    snapshot(),
    {
      scope: everyC(),
      scopeLabel: `all ${n * n} entries of C, and none depends on another`,
      aux: chips(),
    },
    `Two parallel fors over i and j. Every entry of C is independent, so all ${n * n} start together.`,
  );

  span += 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i]![j] = 0;
  stats.writes += n * n;
  emit(
    'P-MATRIX-MULTIPLY',
    3,
    snapshot(),
    {
      move: everyC(),
      scope: everyC(),
      scopeLabel: 'one step of parallel time, whatever n is',
      aux: chips(),
    },
    `All ${n * n} entries are set to 0 at once — n² writes of work, one step of span.`,
  );

  for (let k = 0; k < n; k++) {
    span += 1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        C[i]![j] = (C[i]![j] ?? 0) + A[i]![k]! * B[k]![j]!;
        work += 1;
        stats.comparisons++;
        stats.writes++;
      }
    }
    emit(
      'P-MATRIX-MULTIPLY',
      5,
      snapshot(),
      {
        move: everyC(),
        look: [
          ...Array.from({ length: n }, (_, i) => a(i, k)),
          ...Array.from({ length: n }, (_, j) => b(k, j)),
        ],
        pointers: { k: a(0, k) },
        aux: chips(),
      },
      `k = ${k + 1}: column ${k + 1} of A and row ${k + 1} of B give every entry of C one more term.`,
    );
  }

  emit(
    'P-MATRIX-MULTIPLY',
    5,
    snapshot(),
    {
      done: everyC(),
      aux: chips(),
      product: C.map((row) => [...row] as number[]),
      work,
      span,
    },
    `${work} multiply-adds either way. Serially that is ${work} steps of time; here it is ${span}.`,
  );

  return { steps, output: { n, work, span } };
}

/**
 * The product, checked without computing it — and then the two numbers.
 *
 * Freivalds' randomized check is chapter 4's, and is used here for the same
 * reason: testing `A(Br) = Cr` costs Θ(n²) and touches no part of the triple
 * loop, so it is an independent check rather than the same computation run
 * twice. On top of it, the two quantities this player exists to teach — work
 * really is n³, and span really is n + 1, one step for the zeroing and one
 * per k.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = Math.round(Math.sqrt(input.length / 2));
  const A: number[][] = [];
  const B: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push(input.slice(i * n, i * n + n));
    B.push(input.slice(n * n + i * n, n * n + i * n + n));
  }

  const hi = trace.steps.at(-1)!.hi as { product?: number[][]; work?: number; span?: number };
  if (!hi.product || hi.work === undefined || hi.span === undefined) {
    return 'the run returned no product, work or span';
  }
  const C = hi.product;
  if (C.length !== n || C.some((row) => row.length !== n)) return 'the product is not n × n';

  const times = (M: number[][], v: number[]): number[] =>
    M.map((row) => row.reduce((sum, x, k) => sum + x * v[k]!, 0));
  for (let trial = 0; trial < 12; trial++) {
    const r = Array.from({ length: n }, () => (Math.random() < 0.5 ? 0 : 1));
    const left = times(A, times(B, r));
    const right = times(C, r);
    for (let i = 0; i < n; i++) {
      if (left[i] !== right[i]) {
        return `Freivalds' check fails at row ${i + 1}: A(Br) = ${left[i]}, Cr = ${right[i]}`;
      }
    }
  }

  if (hi.work !== n ** 3) {
    return `the run counted ${hi.work} multiply-adds, but n³ is ${n ** 3} — parallelism does not remove work`;
  }
  if (hi.span !== n + 1) {
    return `the run reported a span of ${hi.span}, but the k-loop and the zeroing make it ${n + 1}`;
  }
  // The claim the whole player rests on, stated as an inequality rather than
  // left to the reader: this is asymptotically less time than the serial run.
  if (hi.span >= hi.work && n > 1) {
    return `span ${hi.span} is not below work ${hi.work} — there would be nothing to gain`;
  }
  return null;
}

function generate(n: number): number[] {
  const size = Math.max(2, Math.min(n, 4));
  return Array.from({ length: 2 * size * size }, () => Math.floor(Math.random() * 10));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const n = Math.round(Math.sqrt(parts.length / 2));
  if (2 * n * n !== parts.length || n < 2 || n > 4) {
    return { error: 'Give two square matrices, row by row — 8, 18 or 32 numbers.' };
  }
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

export const pMatrixMultiply: AlgorithmModule = {
  id: 'p-matrix-multiply',
  name: 'Parallel Matrix Multiplication',
  visualizer: 'grid',
  aux: [{ key: 'T', label: 'time', hint: 'multiply-adds done, and steps of parallel time taken' }],
  procOrder: ['P-MATRIX-MULTIPLY'],
  procedures: {
    'P-MATRIX-MULTIPLY': {
      title: 'P-MATRIX-MULTIPLY(A, B, C, n)',
      indent: [0, 1, 2, 2, 3],
      lines: [
        'parallel for i = 1 to n',
        'parallel for j = 1 to n',
        'c(i, j) = 0',
        'for k = 1 to n',
        'c(i, j) = c(i, j) + a(i, k) · b(k, j)',
      ],
    },
  },
  complexity: {
    best: 'T₁ = Θ(n³)',
    average: 'T₁ = Θ(n³)',
    worst: 'T₁ = Θ(n³)',
    space: 'Θ(n²)',
    extra: [
      ['Span', 'T∞ = Θ(n) — the k-loop, which is the only serial part left'],
      ['Parallelism', 'T₁/T∞ = Θ(n²), one processor per entry of C'],
      ['Against chapter 4', 'identical work; two words changed in the pseudocode'],
      ['What a parallel for costs', 'a tree of spawns: Θ(lg n) span, Θ(n) extra work'],
      ['Getting to Θ(lg n)', 'parallelise the sum too, as §26.2 does recursively'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 4,
    noun: 'pair of matrices',
    placeholder: '1, 2, 3, 4, 5, 6, 7, 8',
    note: 'two square matrices, row by row',
    label: 'Both matrices, row by row, separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.round(Math.sqrt(value.length / 2)),
  },
  defaultSize: 3,
  result: { kind: 'transforms', verify },
  record,
};
