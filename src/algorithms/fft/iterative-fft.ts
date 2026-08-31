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
import { C, add, fmt, mul, near, omega, sub, type Complex } from './complex.ts';

/**
 * THE ITERATIVE FFT — CLRS §30.3.
 *
 * The recursive FFT of §30.2 is the derivation; this is the version that gets
 * written. Same Θ(n lg n), no recursion, no allocation, and a memory access
 * pattern a cache can follow.
 *
 * Two things turn one into the other.
 *
 * **The bit-reversal permutation.** The recursion splits the input into even
 * and odd indices, then splits each of those the same way, until it reaches
 * single elements. Which element ends up where? Reading the choices as bits —
 * even is 0, odd is 1 — the leaf a coefficient lands in is its own index with
 * the bits **reversed**. So the whole recursion's rearranging can be done up
 * front, in one pass, and the algorithm can then work bottom-up. The first
 * row of the run is that permutation: watch index 1 and index 4 swap in an
 * eight-point transform, because 001 reversed is 100.
 *
 * **The butterfly.** Once the leaves are in place, each stage combines
 * adjacent blocks in pairs:
 *
 *     y_k        = u + ω·v
 *     y_{k+n/2}  = u − ω·v
 *
 * The same product `ω·v` appears in both, so it is computed once and used
 * twice, and the two results overwrite the two inputs in place. That is the
 * butterfly, and there are exactly n/2 of them per stage and lg n stages.
 *
 * Each row of the table below is one stage. The arrows into a cell are its
 * butterfly's two inputs — and the picture they trace over the whole run is
 * the diagram every signal-processing textbook draws.
 *
 * What the transform is *for* is §30.1's point: a polynomial can be written
 * as coefficients or as values at n points, multiplication is Θ(n²) in the
 * first form and Θ(n) in the second, and the FFT converts between them in
 * Θ(n lg n). So multiplying two polynomials — or two large integers — takes
 * Θ(n lg n) rather than Θ(n²), by changing representation, working, and
 * changing back.
 */

function bitReverse(x: number, bits: number): number {
  let out = 0;
  for (let b = 0; b < bits; b++) out = (out << 1) | ((x >> b) & 1);
  return out;
}

export function record(input: number[]): Trace {
  // n is a power of two — the generator and parser both guarantee it.
  const n = input.length;
  const lgn = Math.round(Math.log2(n));

  const { steps, stats, emit } = createRecorder();

  /** Row 0 is the input; row 1 the bit-reversed copy; then one row per stage. */
  const rows: Array<Array<Complex | null>> = [
    input.map((x) => C(x)),
    new Array<Complex | null>(n).fill(null),
  ];
  for (let s = 0; s < lgn; s++) rows.push(new Array<Complex | null>(n).fill(null));

  function snapshot(): GridData {
    const out: GridRow[] = rows.map((row, r) => ({
      label: r === 0 ? 'a' : r === 1 ? 'rev' : `s${r - 1}`,
      cells: row.map((z): GridCell => ({ value: z === null ? null : fmt(z) })),
    }));
    return {
      kind: 'grid',
      corner: '',
      colLabels: Array.from({ length: n }, (_, k) => k),
      rows: out,
    };
  }

  const cell = (r: number, k: number) => `${r},${k}`;
  const filled = (upto: number): string[] => {
    const out: string[] = [];
    for (let r = 0; r <= upto; r++) {
      for (let k = 0; k < n; k++) if (rows[r]![k] !== null) out.push(cell(r, k));
    }
    return out;
  };

  const chips = (stage: number, m: number) =>
    auxOf([null, stage, m], undefined, [null, 'stage', 'block size']);

  emit(
    'ITERATIVE-FFT',
    1,
    snapshot(),
    { done: filled(0), aux: { fft: chips(0, 1) } },
    `${n} coefficients. The transform will give their values at the ${n} complex roots of unity.`,
  );

  // ---- BIT-REVERSE-COPY --------------------------------------------------
  for (let k = 0; k < n; k++) {
    const to = bitReverse(k, lgn);
    rows[1]![to] = rows[0]![k]!;
    stats.writes++;
    emit(
      'BIT-REVERSE-COPY',
      3,
      snapshot(),
      {
        done: filled(0),
        look: [cell(0, k)],
        move: [cell(1, to)],
        arrows: [{ from: cell(0, k), to: cell(1, to), role: 'move' as const }],
        pointers: { k: cell(0, k) },
        aux: { fft: chips(0, 1) },
      },
      `a[${k}] goes to position ${to}: ${k.toString(2).padStart(lgn, '0')} reversed is ${to
        .toString(2)
        .padStart(lgn, '0')}.`,
    );
  }

  // ---- the lg n stages ---------------------------------------------------
  let current = rows[1]!.map((z) => z!);
  for (let s = 1; s <= lgn; s++) {
    const m = 1 << s;
    const wm = omega(m);
    const target = s + 1;
    const next = new Array<Complex | null>(n).fill(null);

    for (let k = 0; k < n; k += m) {
      let w = C(1, 0);
      for (let j = 0; j < m / 2; j++) {
        const u = current[k + j]!;
        const t = mul(w, current[k + j + m / 2]!);
        next[k + j] = add(u, t);
        next[k + j + m / 2] = sub(u, t);
        rows[target]![k + j] = next[k + j]!;
        rows[target]![k + j + m / 2] = next[k + j + m / 2]!;
        stats.comparisons++;
        stats.writes += 2;
        emit(
          'ITERATIVE-FFT',
          9,
          snapshot(),
          {
            done: filled(s),
            look: [cell(s, k + j), cell(s, k + j + m / 2)],
            move: [cell(target, k + j), cell(target, k + j + m / 2)],
            // Four arrows: both inputs feed both outputs, which is exactly why
            // the shape is called a butterfly.
            arrows: [
              { from: cell(s, k + j), to: cell(target, k + j), role: 'look' as const },
              { from: cell(s, k + j + m / 2), to: cell(target, k + j), role: 'look' as const },
              { from: cell(s, k + j), to: cell(target, k + j + m / 2), role: 'look' as const },
              {
                from: cell(s, k + j + m / 2),
                to: cell(target, k + j + m / 2),
                role: 'look' as const,
              },
            ],
            scope: Array.from({ length: m }, (_, x) => cell(target, k + x)),
            scopeLabel: `block of ${m}, ω = ${fmt(w)}`,
            aux: { fft: chips(s, m) },
          },
          `Butterfly: u = ${fmt(u)}, ω·v = ${fmt(t)}. One product, used twice — once added, once subtracted.`,
        );
        w = mul(w, wm);
      }
    }
    current = next.map((z) => z!);
  }

  const y = current;
  emit(
    'ITERATIVE-FFT',
    10,
    snapshot(),
    {
      done: filled(lgn + 1),
      result: y.map((z) => ({ re: z.re, im: z.im })),
      aux: { fft: chips(lgn, n) },
    },
    `${lgn} stages of ${n / 2} butterflies: Θ(n lg n), against Θ(n²) for the definition.`,
  );

  return { steps, output: { n, stages: lgn } };
}

/**
 * The transform matches the definition, computed directly.
 *
 * `y_k = Σ_j a_j ω^{jk}` is Θ(n²) and is what the FFT exists to avoid, which
 * makes it exactly the right reference: it shares no structure with the
 * butterflies, so agreeing on every output is real evidence.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = input.length;
  const y = (trace.steps.at(-1)!.hi as { result?: Complex[] }).result;
  if (!y) return 'the run returned no transform';
  if (y.length !== n) return `the transform has ${y.length} values, not ${n}`;

  for (let k = 0; k < n; k++) {
    let sum = C(0, 0);
    for (let j = 0; j < n; j++) sum = add(sum, mul(C(input[j]!), omega(n, j * k)));
    if (!near(sum, y[k]!, 1e-6)) {
      return `y[${k}] is ${fmt(y[k]!)}, but the definition gives ${fmt(sum)}`;
    }
  }
  return null;
}

/** A power of two, because every split has to be even the whole way down. */
function generate(n: number): number[] {
  const size = n >= 6 ? 8 : 4;
  return Array.from({ length: size }, () => Math.floor(Math.random() * 10));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== 4 && parts.length !== 8) {
    return { error: 'Give 4 or 8 coefficients — the FFT needs a power of two.' };
  }
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < -9 || v > 9) {
      return { error: `"${part}" is not a whole number between −9 and 9.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const iterativeFft: AlgorithmModule = {
  id: 'iterative-fft',
  name: 'Iterative FFT',
  visualizer: 'grid',
  aux: [{ key: 'fft', label: 'fft', hint: 'the stage, and the block size it combines' }],
  procOrder: ['ITERATIVE-FFT', 'BIT-REVERSE-COPY'],
  procedures: {
    'ITERATIVE-FFT': {
      title: 'ITERATIVE-FFT(a)',
      indent: [0, 0, 1, 1, 1, 2, 2, 3, 3, 3, 0],
      lines: [
        'BIT-REVERSE-COPY(a, A)',
        'for s = 1 to lg n',
        'm = 2^s',
        'ω_m = e^(2πi/m)',
        'for k = 0 to n − 1 by m',
        'ω = 1',
        'for j = 0 to m/2 − 1',
        't = ω · A[k + j + m/2]',
        'u = A[k + j]',
        'A[k+j] = u + t;  A[k+j+m/2] = u − t;  ω = ω·ω_m',
        'return A',
      ],
    },
    'BIT-REVERSE-COPY': {
      title: 'BIT-REVERSE-COPY(a, A)',
      indent: [0, 0, 1],
      lines: ['n = a.length', 'for k = 0 to n − 1', 'A[rev(k)] = a[k]'],
    },
  },
  complexity: {
    best: 'Θ(n lg n)',
    average: 'Θ(n lg n)',
    worst: 'Θ(n lg n)',
    space: 'Θ(n)',
    extra: [
      ['By the definition', 'Θ(n²) — one sum of n terms per output'],
      ['Butterflies', 'n/2 per stage, lg n stages'],
      ['In place', 'yes, after the bit-reversal copy'],
      ['What it buys', 'polynomial and big-integer multiplication in Θ(n lg n)'],
      ['Requires', 'n a power of two — pad with zeros otherwise'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 8,
    noun: 'polynomial',
    placeholder: '1, 2, 3, 4',
    note: '4 or 8 coefficients; n must be a power of two',
    label: 'Polynomial coefficients, low order first, separated by commas',
    generate,
    parse,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
