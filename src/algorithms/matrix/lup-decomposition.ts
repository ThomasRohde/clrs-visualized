import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type GridRow,
  type ParsedInput,
  type Trace,
} from '../types.ts';
import { determinant, isSingular } from './singular.ts';

/**
 * LUP DECOMPOSITION — CLRS §28.1.
 *
 * Factor a matrix into `PA = LU`: a permutation, a lower-triangular matrix
 * with ones on the diagonal, and an upper-triangular one. It is Gaussian
 * elimination, with the multipliers kept instead of thrown away.
 *
 * The reason to want it is that **triangular systems are easy**. Solving
 * `Ax = b` directly is awkward; solving `Ly = Pb` and then `Ux = y` is two
 * passes of substitution, Θ(n²) each. So the Θ(n³) factoring is done once and
 * every subsequent right-hand side costs Θ(n²) — which is the whole reason
 * numerical libraries factor rather than solve.
 *
 * The run below transforms **one matrix in place**, which is the standard
 * trick and worth understanding rather than being surprised by. Below the
 * diagonal, an entry holds the multiplier that eliminated it — an entry of
 * `L`. On and above the diagonal it holds `U`. The two triangles never
 * collide, because `L` has an implicit 1 on its diagonal that is not stored.
 *
 * **The P is not decoration.** Without row exchanges the algorithm divides by
 * whatever happens to be on the diagonal, which may be zero — in which case
 * it fails on a perfectly invertible matrix — or merely tiny, in which case
 * it survives and returns nonsense, because dividing by a small number
 * magnifies every rounding error that came before it. **Partial pivoting**
 * fixes both: before each elimination, swap in the row whose entry in this
 * column is largest in absolute value. Watch the pivot search at the start of
 * each step; it is chosen for size, not for convenience.
 *
 * That is the whole of numerical stability in this book, in one line of
 * pseudocode: the algorithm that is right on paper and the one that is right
 * in floating point differ by a `max`.
 *
 * **Pivoting cannot rescue a singular matrix**, only a badly ordered one. If
 * every candidate in a column is zero there is no pivot to find, `PA = LU`
 * has no solution, and the procedure does what its line 8 says and stops. Try
 * `1, 2, 2, 4`, whose second row is twice its first.
 */

const round = (x: number): number => Math.round(x * 100) / 100;

export function record(input: number[]): Trace {
  const n = Math.round(Math.sqrt(input.length));
  const A: number[][] = Array.from({ length: n }, (_, i) => input.slice(i * n, i * n + n));
  const pi = Array.from({ length: n }, (_, i) => i);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GridData {
    const rows: GridRow[] = A.map((row, i) => ({
      label: `π${pi[i]! + 1}`,
      cells: row.map((v, j): GridCell => ({
        value: round(v),
        // Below the diagonal the stored number is a multiplier, not a
        // coefficient of U. Saying so in the cell is the only way the
        // in-place trick reads as deliberate rather than as corruption.
        ...(i > j ? { note: 'L' } : {}),
      })),
    }));
    return {
      kind: 'grid',
      corner: 'π\\j',
      colLabels: Array.from({ length: n }, (_, j) => j + 1),
      rows,
    };
  }

  const cell = (i: number, j: number) => `${i},${j}`;
  const chips = (k: number, pivot: number | null) =>
    auxOf([null, k + 1, pivot], undefined, [null, 'k', 'pivot']);

  emit(
    'LUP-DECOMPOSITION',
    2,
    snapshot(),
    { aux: { lup: chips(0, null) } },
    `P starts as the identity: the row labels track where each original row has gone.`,
  );

  for (let k = 0; k < n; k++) {
    // ---- partial pivoting ----------------------------------------------
    let best = 0;
    let at = k;
    for (let i = k; i < n; i++) {
      stats.comparisons++;
      if (Math.abs(A[i]![k]!) > best) {
        best = Math.abs(A[i]![k]!);
        at = i;
      }
    }
    emit(
      'LUP-DECOMPOSITION',
      6,
      snapshot(),
      {
        look: Array.from({ length: n - k }, (_, x) => cell(k + x, k)),
        mark: [cell(at, k)],
        scope: Array.from({ length: n - k }, (_, x) => cell(k + x, k)),
        scopeLabel: `column ${k + 1}, rows ${k + 1} down`,
        pointers: { k: cell(k, k) },
        aux: { lup: chips(k, round(A[at]![k]!)) },
      },
      `The largest entry in column ${k + 1} is ${round(A[at]![k]!)}, in row ${pi[at]! + 1}. That is the pivot.`,
    );

    if (best === 0) {
      // `error` in the pseudocode is `error`: the procedure stops, and there
      // is no π to return. Carrying on to emit an ordinary Done as well would
      // put two terminal states in one trace and contradict the line the
      // player is highlighting.
      emit(
        'LUP-DECOMPOSITION',
        8,
        snapshot(),
        { mark: [cell(k, k)], singular: true, aux: { lup: chips(k, 0) } },
        `Every candidate in column ${k + 1} is zero, so no pivot exists: A is singular, PA = LU has no solution, and the procedure stops here.`,
      );
      return { steps, output: { n, singular: 1 } };
    }

    if (at !== k) {
      [A[k], A[at]] = [A[at]!, A[k]!];
      [pi[k], pi[at]] = [pi[at]!, pi[k]!];
      stats.swaps++;
      emit(
        'LUP-DECOMPOSITION',
        10,
        snapshot(),
        {
          move: [
            ...Array.from({ length: n }, (_, j) => cell(k, j)),
            ...Array.from({ length: n }, (_, j) => cell(at, j)),
          ],
          aux: { lup: chips(k, round(A[k]![k]!)) },
        },
        `Swap rows ${k + 1} and ${at + 1}. P records it, so PA = LU still holds.`,
      );
    }

    // ---- eliminate -------------------------------------------------------
    for (let i = k + 1; i < n; i++) {
      const factor = A[i]![k]! / A[k]![k]!;
      A[i]![k] = factor;
      stats.writes++;
      emit(
        'LUP-DECOMPOSITION',
        12,
        snapshot(),
        {
          look: [cell(k, k)],
          move: [cell(i, k)],
          arrows: [{ from: cell(k, k), to: cell(i, k), role: 'look' as const }],
          pointers: { k: cell(k, k) },
          aux: { lup: chips(k, round(A[k]![k]!)) },
        },
        `Row ${i + 1} needs ${round(factor)} times row ${k + 1} subtracted. Store the multiplier where the zero would go.`,
      );

      for (let j = k + 1; j < n; j++) {
        A[i]![j] = A[i]![j]! - factor * A[k]![j]!;
        stats.writes++;
      }
      emit(
        'LUP-DECOMPOSITION',
        14,
        snapshot(),
        {
          look: Array.from({ length: n - k - 1 }, (_, x) => cell(k, k + 1 + x)),
          move: Array.from({ length: n - k - 1 }, (_, x) => cell(i, k + 1 + x)),
          scope: Array.from({ length: n - k - 1 }, (_, x) => cell(i, k + 1 + x)),
          scopeLabel: `row ${i + 1}, right of the pivot`,
          aux: { lup: chips(k, round(A[k]![k]!)) },
        },
        `Subtract, and the rest of row ${i + 1} comes down with it. Nothing left of column ${k + 1} moves.`,
      );
    }
  }

  const all: string[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) all.push(cell(i, j));
  emit(
    'LUP-DECOMPOSITION',
    15,
    snapshot(),
    {
      done: all,
      factored: A.map((row) => [...row]),
      permutation: [...pi],
      aux: { lup: chips(n - 1, null) },
    },
    `Done: L below the diagonal, U on and above it, and π says which original row is which.`,
  );

  return { steps, output: { n, singular: 0 } };
}

/**
 * Multiply the factors back out and compare with the original.
 *
 * `PA = LU` is the claim, so the check is the claim: reassemble L and U from
 * the single stored matrix, multiply them, and compare against A with its
 * rows permuted. Nothing about elimination is reused, so a wrong multiplier
 * or a mis-recorded swap shows up immediately.
 *
 * A run that stopped at a pivotless column is making no such claim, and is
 * checked against the determinant instead. Only that direction is asserted: a
 * matrix elimination called singular really must be, but a nearly singular one
 * that squeaked past a tiny pivot still has to satisfy `PA = LU`, which is
 * what the rest of this checks.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = Math.round(Math.sqrt(input.length));
  const A: number[][] = Array.from({ length: n }, (_, i) => input.slice(i * n, i * n + n));
  const hi = trace.steps.at(-1)!.hi as {
    factored?: number[][];
    permutation?: number[];
    singular?: boolean;
  };
  const F = hi.factored;
  const pi = hi.permutation;

  if (hi.singular) {
    if (F) return 'the run reported a singular matrix and returned a factorization anyway';
    return isSingular(A, input)
      ? null
      : `the run reported a singular matrix, but |A| is ${determinant(A)}`;
  }
  if (!F || !pi) return 'the run returned no factorization';

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      // (LU)_ij = Σ_k L_ik U_kj, with L's unit diagonal and both triangles
      // read out of the one stored matrix.
      for (let k = 0; k <= Math.min(i, j); k++) {
        const l = k === i ? 1 : F[i]![k]!;
        const u = F[k]![j]!;
        sum += l * u;
      }
      const expected = A[pi[i]!]![j]!;
      if (Math.abs(sum - expected) > 1e-6) {
        return `(LU)[${i},${j}] is ${sum}, but (PA)[${i},${j}] is ${expected}`;
      }
    }
  }
  return null;
}

/** Small integers, so the multipliers stay readable when rounded. */
function generate(n: number): number[] {
  const size = Math.max(2, Math.min(n, 4));
  return Array.from({ length: size * size }, () => 1 + Math.floor(Math.random() * 9));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const n = Math.round(Math.sqrt(parts.length));
  if (n * n !== parts.length || n < 2 || n > 4) {
    return { error: 'Give a square matrix row by row — 4, 9 or 16 numbers.' };
  }
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isFinite(v) || v < -99 || v > 99) {
      return { error: `"${part}" is not a number between −99 and 99.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const lupDecomposition: AlgorithmModule = {
  id: 'lup-decomposition',
  name: 'LUP Decomposition',
  visualizer: 'grid',
  aux: [{ key: 'lup', label: 'k', hint: 'the column being eliminated, and its pivot' }],
  procOrder: ['LUP-DECOMPOSITION'],
  procedures: {
    // Condensed from the book's LUP-DECOMPOSITION: its index bookkeeping for
    // the row exchange is written here as one swap, because the picture shows
    // two rows trading places and not four assignments.
    'LUP-DECOMPOSITION': {
      title: 'LUP-DECOMPOSITION(A, n)',
      indent: [0, 1, 0, 1, 1, 2, 3, 1, 2, 1, 1, 2, 2, 3, 0],
      lines: [
        'let π[1:n] be a new array',
        'for i = 1 to n:  π[i] = i',
        'for k = 1 to n',
        'p = 0',
        'for i = k to n',
        'if |a_ik| > p',
        'p = |a_ik|;  k′ = i',
        'if p == 0',
        'error "singular matrix"',
        'exchange π[k] with π[k′], and row k with row k′',
        'for i = k + 1 to n',
        'a_ik = a_ik / a_kk',
        'for j = k + 1 to n',
        'a_ij = a_ij − a_ik · a_kj',
        'return π',
      ],
    },
  },
  complexity: {
    best: 'Θ(n³)',
    average: 'Θ(n³)',
    worst: 'Θ(n³)',
    space: 'Θ(1) extra — it factors in place',
    extra: [
      ['Then each solve', 'Θ(n²) — which is why you factor once'],
      ['Why pivot', 'a zero on the diagonal fails; a tiny one silently loses precision'],
      ['L and U together', 'stored in one matrix; L’s unit diagonal is not written'],
      ['The claim', 'PA = LU'],
      ['Determinant', 'the product of U’s diagonal, times the sign of P'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 4,
    noun: 'matrix',
    placeholder: '2, 3, 1, 4, 7, 5, 6, 9, 8',
    note: 'a square matrix, row by row',
    label: 'A square matrix, row by row, separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.round(Math.sqrt(value.length)),
  },
  defaultSize: 3,
  result: { kind: 'transforms', verify },
  record,
};
