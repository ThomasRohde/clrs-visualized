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
 * MATRIX MULTIPLICATION — CLRS §4.1.
 *
 * Three nested loops, Θ(n³), and the definition written out:
 *
 *     c_ij = sum over k of a_ik · b_kj
 *
 * Each entry of the answer is one **row of A** dotted with one **column of
 * B**, which is what the run below shows: watch the row travel along and the
 * column travel down, meeting at the entry being built.
 *
 * Θ(n³) is the whole reason chapter 4 exists. It is the obvious cost, it was
 * assumed to be the only cost for a long time, and §4.2 shows it is not — a
 * result surprising enough that it opened a line of work still running today.
 * The current record exponent is around 2.37, though every algorithm below
 * Strassen's is impractical for any matrix you would actually multiply.
 *
 * Note what is *not* in the running time: the shape of the data, the values,
 * anything at all about the input. Every run of this on an n × n pair costs
 * exactly n³ multiplications and n³ − n² additions. It is one of the few
 * algorithms in the book with no best case and no worst case, which makes it
 * the right baseline to be surprised by.
 */

export function record(input: number[]): Trace {
  // Two n × n matrices, laid out row by row: A first, then B.
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

  /** Rows 0‥n−1 are A, n‥2n−1 are B, 2n‥3n−1 are C. */
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

  const settled = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (C[i]![j] !== null) out.push(c(i, j));
    return out;
  };

  const chips = (k: number | null, sum: number | null) => ({
    dot: auxOf([null, k, sum], sum === null ? undefined : 2, [null, 'k', 'Σ']),
  });

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      emit(
        'MATRIX-MULTIPLY',
        4,
        snapshot(),
        {
          done: settled(),
          move: c(i, j),
          look: [
            ...Array.from({ length: n }, (_, k) => a(i, k)),
            ...Array.from({ length: n }, (_, k) => b(k, j)),
          ],
          scope: Array.from({ length: n }, (_, x) => c(i, x)),
          scopeLabel: `row ${i + 1} of C`,
          pointers: { j: c(i, j) },
          aux: chips(null, null),
        },
        `c${i + 1}${j + 1} is row ${i + 1} of A dotted with column ${j + 1} of B.`,
      );

      for (let k = 0; k < n; k++) {
        const term = A[i]![k]! * B[k]![j]!;
        sum += term;
        stats.comparisons++;
        stats.writes++;
        emit(
          'MATRIX-MULTIPLY',
          6,
          snapshot(),
          {
            done: settled(),
            move: c(i, j),
            mark: [a(i, k), b(k, j)],
            look: [
              ...Array.from({ length: n }, (_, x) => a(i, x)),
              ...Array.from({ length: n }, (_, x) => b(x, j)),
            ],
            pointers: { k: a(i, k) },
            aux: chips(k + 1, sum),
          },
          `a${i + 1}${k + 1}·b${k + 1}${j + 1} = ${A[i]![k]}·${B[k]![j]} = ${term}. Running total ${sum}.`,
        );
      }

      C[i]![j] = sum;
      emit(
        'MATRIX-MULTIPLY',
        6,
        snapshot(),
        {
          done: settled().filter((key) => key !== c(i, j)),
          move: c(i, j),
          scope: Array.from({ length: n }, (_, x) => c(i, x)),
          scopeLabel: `row ${i + 1} of C`,
          aux: chips(n, sum),
        },
        `c${i + 1}${j + 1} = ${sum}. ${n} multiplications for one entry, and there are ${n * n} entries.`,
      );
    }
  }

  emit(
    'MATRIX-MULTIPLY',
    6,
    snapshot(),
    { done: settled(), product: C.map((row) => [...row] as number[]), aux: chips(n, null) },
    `Done: ${n ** 3} multiplications, which is what Θ(n³) means on a ${n} × ${n} pair.`,
  );

  return { steps, output: { n, multiplications: n ** 3 } };
}

/**
 * Freivalds' algorithm: check the product without computing it.
 *
 * Pick a random 0/1 vector r and test whether `A(Br) = Cr`. Each side costs
 * Θ(n²) rather than Θ(n³), and it uses no part of the triple loop — so this
 * is a genuinely independent check rather than the same computation run
 * twice. If `C` is wrong, a single trial catches it with probability at least
 * ½; a dozen trials make a miss less likely than a hardware fault.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = Math.round(Math.sqrt(input.length / 2));
  const A: number[][] = [];
  const B: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push(input.slice(i * n, i * n + n));
    B.push(input.slice(n * n + i * n, n * n + i * n + n));
  }

  const C = (trace.steps.at(-1)!.hi as { product?: number[][] }).product;
  if (!C) return 'the run returned no product';
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

export const matrixMultiply: AlgorithmModule = {
  id: 'matrix-multiply',
  name: 'Matrix Multiplication',
  visualizer: 'grid',
  aux: [{ key: 'dot', label: 'dot', hint: 'the index being multiplied, and the running total' }],
  procOrder: ['MATRIX-MULTIPLY'],
  procedures: {
    'MATRIX-MULTIPLY': {
      title: 'MATRIX-MULTIPLY(A, B, C, n)',
      indent: [0, 1, 2, 2, 3, 0],
      lines: [
        'for i = 1 to n',
        'for j = 1 to n',
        'c_ij = 0',
        'for k = 1 to n',
        'c_ij = c_ij + a_ik · b_kj',
        'return C',
      ],
    },
  },
  complexity: {
    best: 'Θ(n³)',
    average: 'Θ(n³)',
    worst: 'Θ(n³)',
    space: 'Θ(n²)',
    extra: [
      ['Multiplications', 'exactly n³ — no best or worst case'],
      ['Additions', 'n³ − n²'],
      ['Strassen', 'Θ(n^lg 7) ≈ Θ(n^2.81) — §4.2'],
      ['Best known', '≈ Θ(n^2.37), and impractical at every size'],
      ['Lower bound', 'Ω(n²), since the answer has n² entries'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 4,
    noun: 'pair',
    placeholder: '1, 2, 3, 4, 5, 6, 7, 8',
    note: 'two n × n matrices, A then B, row by row',
    label: 'Two square matrices, row by row, separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.round(Math.sqrt(value.length / 2)),
  },
  defaultSize: 3,
  result: { kind: 'transforms', verify },
  record,
};
