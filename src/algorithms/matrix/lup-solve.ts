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

/**
 * LUP SOLVE — CLRS §28.1.
 *
 * The payoff for the factoring. Once `PA = LU`, solving `Ax = b` is two
 * passes of substitution and no elimination at all.
 *
 *     Ax = b  →  PAx = Pb  →  LUx = Pb
 *
 * Set `y = Ux`. Then `Ly = Pb` can be solved **forwards**, because L is lower
 * triangular with ones on the diagonal: the first equation has one unknown,
 * the second has one new unknown once the first is known, and so on. Then
 * `Ux = y` is solved **backwards** for the same reason from the other end.
 *
 * Two Θ(n²) passes, against Θ(n³) to factor. That ratio is the entire reason
 * numerical libraries hand back a factorization rather than a solution: with
 * twenty right-hand sides you factor once and substitute twenty times, and
 * the twenty substitutions together cost less than the one factoring.
 *
 * The run shows both passes on one picture. The `L\U` block is the
 * factorization from §28.1 — L below the diagonal, U on and above it — and
 * the two rows beneath it are `y` filling in left to right and then `x`
 * filling in right to left. Watch which entries of the matrix each step
 * reads: forward substitution only ever looks left of the diagonal, back
 * substitution only ever looks right of it, and neither touches the other's
 * triangle.
 *
 * The subtraction in each step is the same one: everything already known,
 * multiplied by its coefficient, taken off the right-hand side. What is left
 * is a single unknown times a single coefficient.
 *
 * **Both passes need A to be non-singular**, and the run checks that before it
 * starts rather than dividing by whatever U's diagonal happens to hold. A zero
 * there means the system has no unique solution — no solution at all, or a
 * whole family of them — and neither is something substitution can hand back.
 * The run says so and stops. Type `1, 2, 2, 4, 3, 7` into the box to see it:
 * the second equation is twice the first on the left and not on the right.
 */

const round = (x: number): number => Math.round(x * 100) / 100;

/**
 * How close to zero counts as zero, for this matrix.
 *
 * Scaled by the largest entry, because "small" is only meaningful against
 * something: a pivot of 1e-12 is zero in a matrix of small integers and is an
 * ordinary number in one scaled by 1e-15. Exact equality would be right for
 * the integers the input box accepts and wrong the moment elimination leaves
 * a rounding crumb where a zero belongs.
 */
const zeroTolerance = (values: number[]): number =>
  1e-9 * Math.max(1, ...values.map((v) => Math.abs(v)));

export function record(input: number[]): Trace {
  // n² entries of A, then n of b.
  const n = Math.round((-1 + Math.sqrt(1 + 4 * input.length)) / 2);
  const A: number[][] = Array.from({ length: n }, (_, i) => input.slice(i * n, i * n + n));
  const b = input.slice(n * n);

  // Factor first, silently: §28.1's player is where that is animated, and
  // repeating it here would bury the substitution this one is about.
  const F = A.map((row) => [...row]);
  const pi = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let best = Math.abs(F[k]![k]!);
    let at = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(F[i]![k]!) > best) {
        best = Math.abs(F[i]![k]!);
        at = i;
      }
    }
    if (at !== k) {
      [F[k], F[at]] = [F[at]!, F[k]!];
      [pi[k], pi[at]] = [pi[at]!, pi[k]!];
    }
    if (F[k]![k] === 0) continue;
    for (let i = k + 1; i < n; i++) {
      F[i]![k] = F[i]![k]! / F[k]![k]!;
      for (let j = k + 1; j < n; j++) F[i]![j] = F[i]![j]! - F[i]![k]! * F[k]![j]!;
    }
  }

  const y = new Array<number | null>(n).fill(null);
  const x = new Array<number | null>(n).fill(null);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GridData {
    const rows: GridRow[] = F.map((row, i) => ({
      label: `π${pi[i]! + 1}`,
      cells: row.map((v, j): GridCell => ({
        value: round(v),
        ...(i > j ? { note: 'L' } : { note: 'U' }),
      })),
    }));
    rows.push({ label: 'Pb', cells: pi.map((p): GridCell => ({ value: b[p]! })) });
    rows.push({
      label: 'y',
      cells: y.map((v): GridCell => ({ value: v === null ? null : round(v) })),
    });
    rows.push({
      label: 'x',
      cells: x.map((v): GridCell => ({ value: v === null ? null : round(v) })),
    });
    return {
      kind: 'grid',
      corner: 'L\\U',
      colLabels: Array.from({ length: n }, (_, j) => j + 1),
      rows,
    };
  }

  const cell = (i: number, j: number) => `${i},${j}`;
  const pb = (i: number) => `${n},${i}`;
  const yc = (i: number) => `${n + 1},${i}`;
  const xc = (i: number) => `${n + 2},${i}`;

  // The value is how many unknowns are settled; the caption is which pass is
  // running. Aux chips hold numbers, so the phase name goes underneath.
  const chips = (phase: string) =>
    auxOf(
      [null, y.filter((v) => v !== null).length, x.filter((v) => v !== null).length],
      undefined,
      [null, phase === 'forward' ? 'y (forward)' : 'y', phase === 'back' ? 'x (back)' : 'x'],
    );

  emit(
    'LUP-SOLVE',
    1,
    snapshot(),
    {
      scope: Array.from({ length: n }, (_, i) => pb(i)),
      scopeLabel: 'b, with its rows permuted by P',
      aux: { pass: chips('setup') },
    },
    `PA = LU is already known. Permute b to match, and the rest is substitution.`,
  );

  /**
   * Both passes assume A is non-singular, and this is where that assumption is
   * checked rather than discovered.
   *
   * Back substitution divides by `u_ii`. A zero there means A is singular: the
   * system has either no solution or infinitely many, and in neither case is
   * there an x to substitute for. Dividing anyway gives ±∞ or NaN; **skipping**
   * the division and calling the unknown 0 — which is what this recorder used
   * to do — is worse, because it hands back a vector that looks like an answer
   * and is not one.
   */
  const tol = zeroTolerance(input);
  const singular: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(F[i]![i]!) <= tol) singular.push(i);
  if (singular.length > 0) {
    emit(
      'LUP-SOLVE',
      3,
      snapshot(),
      {
        look: singular.map((i) => cell(i, i)),
        singular: true,
        aux: { pass: chips('setup') },
      },
      `u${singular[0]! + 1}${singular[0]! + 1} is 0, so A is singular and back substitution has nothing to divide by. The system has no unique solution, and there is no x to report.`,
    );
    return { steps, output: { n, singular: 1 } };
  }

  // ---- forward substitution: Ly = Pb -----------------------------------
  for (let i = 0; i < n; i++) {
    let sum = b[pi[i]!]!;
    for (let j = 0; j < i; j++) sum -= F[i]![j]! * (y[j] as number);
    y[i] = sum;
    stats.writes++;
    stats.comparisons += i;
    emit(
      'LUP-SOLVE',
      5,
      snapshot(),
      {
        look: [
          ...Array.from({ length: i }, (_, j) => cell(i, j)),
          ...Array.from({ length: i }, (_, j) => yc(j)),
          pb(i),
        ],
        move: [yc(i)],
        arrows: Array.from({ length: i }, (_, j) => ({
          from: yc(j),
          to: yc(i),
          role: 'look' as const,
        })),
        scope: Array.from({ length: i + 1 }, (_, j) => cell(i, j)),
        scopeLabel: `row ${i + 1} of L — everything left of the diagonal`,
        pointers: { i: yc(i) },
        aux: { pass: chips('forward') },
      },
      i === 0
        ? `y₁ = ${round(sum)} straight away: L's first row is just a 1.`
        : `y${i + 1} = ${round(sum)}: take off the ${i} already-known term${i === 1 ? '' : 's'}. L's diagonal is 1, so no division.`,
    );
  }

  // ---- back substitution: Ux = y ---------------------------------------
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i] as number;
    for (let j = i + 1; j < n; j++) sum -= F[i]![j]! * (x[j] as number);
    x[i] = sum / F[i]![i]!;
    stats.writes++;
    stats.comparisons += n - 1 - i;
    emit(
      'LUP-SOLVE',
      7,
      snapshot(),
      {
        look: [
          ...Array.from({ length: n - i }, (_, k) => cell(i, i + k)),
          ...Array.from({ length: n - 1 - i }, (_, k) => xc(i + 1 + k)),
          yc(i),
        ],
        move: [xc(i)],
        arrows: Array.from({ length: n - 1 - i }, (_, k) => ({
          from: xc(i + 1 + k),
          to: xc(i),
          role: 'look' as const,
        })),
        scope: Array.from({ length: n - i }, (_, k) => cell(i, i + k)),
        scopeLabel: `row ${i + 1} of U — everything from the diagonal right`,
        pointers: { i: xc(i) },
        aux: { pass: chips('back') },
      },
      i === n - 1
        ? `x${n} = ${round(x[i] as number)}: U's last row has one unknown, so divide and done.`
        : `x${i + 1} = ${round(x[i] as number)}: subtract the ${n - 1 - i} known term${n - 1 - i === 1 ? '' : 's'}, then divide by ${round(F[i]![i]!)}.`,
    );
  }

  emit(
    'LUP-SOLVE',
    8,
    snapshot(),
    {
      done: [
        ...Array.from({ length: n }, (_, i) => yc(i)),
        ...Array.from({ length: n }, (_, i) => xc(i)),
      ],
      solution: x.map((v) => v as number),
      aux: { pass: chips('done') },
    },
    `Two passes, Θ(n²) each. Another right-hand side costs the same again — the Θ(n³) is spent.`,
  );

  return { steps, output: { n } };
}

/**
 * The determinant, by cofactor expansion.
 *
 * Exact on the integers the input box accepts, and independent of elimination
 * — which is the point, since it is the check on a run that *stopped* because
 * elimination found a zero pivot. n is at most 4, so 24 terms is nothing.
 */
function determinant(M: number[][]): number {
  const n = M.length;
  if (n === 1) return M[0]![0]!;
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const minor = M.slice(1).map((row) => row.filter((_, c) => c !== j));
    sum += (j % 2 === 0 ? 1 : -1) * M[0]![j]! * determinant(minor);
  }
  return sum;
}

/**
 * Substitute the answer back into the original system.
 *
 * `Ax = b` is the claim and this checks the claim directly, against the
 * matrix as it was given rather than as it was factored — so a mistake in
 * either the factoring or either substitution pass shows up here.
 *
 * A run that stopped at a singular pivot is making the other claim, and it is
 * checked against the determinant rather than against the factorization it
 * abandoned. Only that direction is asserted: a matrix the elimination decided
 * was singular really must be, but a merely ill-conditioned one that slipped
 * through is caught by `Ax = b` below anyway.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = Math.round((-1 + Math.sqrt(1 + 4 * input.length)) / 2);
  const A: number[][] = Array.from({ length: n }, (_, i) => input.slice(i * n, i * n + n));
  const b = input.slice(n * n);
  const hi = trace.steps.at(-1)!.hi as { solution?: number[]; singular?: boolean };

  if (hi.singular) {
    if (hi.solution) return 'the run reported a singular system and returned a solution anyway';
    const det = determinant(A);
    const scale = Math.max(1, ...input.map((v) => Math.abs(v))) ** n;
    return Math.abs(det) <= 1e-6 * scale
      ? null
      : `the run reported a singular system, but |A| is ${det}`;
  }

  const x = hi.solution;
  if (!x) return 'the run returned no solution';
  if (x.some((v) => !Number.isFinite(v))) return 'the solution has a non-finite entry';

  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += A[i]![j]! * x[j]!;
    // Generous by floating-point standards and tight by the matrix's: the
    // entries are small integers, so a real error is off by much more.
    if (Math.abs(sum - b[i]!) > 1e-6) {
      return `row ${i + 1} of Ax comes to ${sum}, but b is ${b[i]}`;
    }
  }
  return null;
}

/**
 * A system with a unique solution, guaranteed.
 *
 * The matrix is made diagonally dominant, which makes it non-singular by
 * construction — a random small-integer matrix is singular often enough that
 * "usually solvable" would be a test that usually passes.
 */
function generate(n: number): number[] {
  const size = Math.max(2, Math.min(n, 4));
  const A: number[] = [];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const off = 1 + Math.floor(Math.random() * 4);
      A.push(i === j ? size * 5 + Math.floor(Math.random() * 5) : off);
    }
  }
  const b = Array.from({ length: size }, () => 1 + Math.floor(Math.random() * 20));
  return [...A, ...b];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const n = Math.round((-1 + Math.sqrt(1 + 4 * parts.length)) / 2);
  if (n * n + n !== parts.length || n < 2 || n > 4) {
    return { error: 'Give A row by row then b — 6, 12 or 20 numbers.' };
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

export const lupSolve: AlgorithmModule = {
  id: 'lup-solve',
  name: 'LUP Solve',
  visualizer: 'grid',
  aux: [{ key: 'pass', label: 'pass', hint: 'which substitution is running' }],
  procOrder: ['LUP-SOLVE'],
  procedures: {
    // Lines 2-3 are not in the book's LUP-SOLVE, which takes a non-singular A
    // as a precondition. A player cannot: the input box will hand it a
    // singular one, and pseudocode that says nothing about that case while
    // the recorder stops on it would be two different algorithms side by side.
    'LUP-SOLVE': {
      title: 'LUP-SOLVE(L, U, π, b, n)',
      indent: [0, 0, 1, 0, 1, 0, 1, 0],
      lines: [
        'let x and y be new vectors of length n',
        'if u_ii == 0 for some i',
        'error "no unique solution"',
        'for i = 1 to n',
        'y_i = b_{π[i]} − Σ_{j=1}^{i−1} l_ij y_j',
        'for i = n downto 1',
        'x_i = ( y_i − Σ_{j=i+1}^{n} u_ij x_j ) / u_ii',
        'return x',
      ],
    },
  },
  complexity: {
    best: 'Θ(n²)',
    average: 'Θ(n²)',
    worst: 'Θ(n²)',
    space: 'Θ(n)',
    extra: [
      ['Factoring first', 'Θ(n³), once'],
      ['Each further right-hand side', 'Θ(n²) — the reason to factor at all'],
      ['Forward pass', 'no division: L has ones on its diagonal'],
      ['Back pass', 'one division per unknown, by U’s diagonal'],
      ['Inverting A instead', 'Θ(n³) and less accurate — solve, do not invert'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 4,
    noun: 'system',
    placeholder: '10, 2, 3, 1, 12, 2, 4, 1, 15, 7, 9, 11',
    note: 'A row by row, then b; the matrix is diagonally dominant',
    label: 'The matrix A row by row, then the vector b',
    generate,
    parse,
    size: (value: number[]) => Math.round((-1 + Math.sqrt(1 + 4 * value.length)) / 2),
  },
  defaultSize: 3,
  result: { kind: 'transforms', verify },
  record,
};
