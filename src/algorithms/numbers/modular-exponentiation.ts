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
 * MODULAR EXPONENTIATION — CLRS §31.6.
 *
 * Compute `a^b mod n` where b may have hundreds of digits. Two things make
 * the naive approach impossible, and the algorithm fixes both at once.
 *
 * **You cannot multiply b times.** With b around 2^1024 — which is what RSA
 * uses — there is not enough time in the universe. Repeated squaring reduces
 * it to **⌊lg b⌋ + 1 multiplications**, one per bit of the exponent, by
 * reading b in binary: square the running value at every bit, and multiply by
 * `a` as well at every bit that is 1.
 *
 * **You cannot compute a^b and then reduce.** The number would have more
 * digits than there are atoms available to write them on. So the modulus is
 * applied *after every multiplication*, which is legal because modular
 * arithmetic commutes with multiplication, and keeps every intermediate value
 * under n.
 *
 * The `c` row in the run is the book's bookkeeping variable: it is the prefix
 * of the exponent read so far, and it exists to make the loop invariant
 * checkable — at every step, `d = a^c mod n`. It is not needed to compute
 * anything, and a real implementation drops it. Watch it double, and add one
 * exactly when the bit is 1.
 *
 * This is the operation RSA is made of, in both directions, and it is why
 * public-key cryptography is possible at all: `a^b mod n` is cheap, and
 * recovering `b` from it — the discrete logarithm — is not known to be.
 */

const ROW = { bit: 0, c: 1, d: 2 } as const;

export function record(input: number[]): Trace {
  const [a, b, n] = input as [number, number, number];
  const bits = b.toString(2).split('').map(Number);
  const k = bits.length;

  const c: Array<number | null> = new Array<number | null>(k).fill(null);
  const d: Array<number | null> = new Array<number | null>(k).fill(null);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GridData {
    return {
      kind: 'grid',
      corner: 'i',
      colLabels: bits.map((_, i) => k - 1 - i),
      rows: [
        { label: 'bᵢ', cells: bits.map((v): GridCell => ({ value: v })) },
        { label: 'c', cells: c.map((v): GridCell => ({ value: v })) },
        { label: 'd', cells: d.map((v): GridCell => ({ value: v })) },
      ],
    };
  }

  const cell = (row: number, i: number) => `${row},${i}`;
  const chips = (ci: number | null, di: number | null) =>
    auxOf([null, ci, di], undefined, [null, 'c', 'd = a^c mod n']);

  emit(
    'MODULAR-EXPONENTIATION',
    3,
    snapshot(),
    {
      scope: bits.map((_, i) => cell(ROW.bit, i)),
      scopeLabel: `${b} in binary — one multiplication per bit`,
      aux: { state: chips(0, 1) },
    },
    `${b} is ${bits.join('')} in binary: ${k} bits, so ${k} squarings rather than ${b} multiplications.`,
  );

  let ci = 0;
  let di = 1;
  for (let i = 0; i < k; i++) {
    ci = 2 * ci;
    di = (di * di) % n;
    stats.comparisons++;
    stats.writes += 2;
    c[i] = ci;
    d[i] = di;
    emit(
      'MODULAR-EXPONENTIATION',
      6,
      snapshot(),
      {
        done: [
          ...Array.from({ length: i }, (_, j) => cell(ROW.c, j)),
          ...Array.from({ length: i }, (_, j) => cell(ROW.d, j)),
        ],
        look: i > 0 ? [cell(ROW.d, i - 1)] : [],
        move: [cell(ROW.c, i), cell(ROW.d, i)],
        mark: [cell(ROW.bit, i)],
        ...(i > 0
          ? { arrows: [{ from: cell(ROW.d, i - 1), to: cell(ROW.d, i), role: 'look' as const }] }
          : {}),
        pointers: { i: cell(ROW.bit, i) },
        aux: { state: chips(ci, di) },
      },
      `Square: d = ${i === 0 ? 1 : d[i - 1]}² mod ${n} = ${di}. The exponent so far doubles to ${ci}.`,
    );

    if (bits[i] === 1) {
      ci += 1;
      di = (di * a) % n;
      stats.writes += 2;
      c[i] = ci;
      d[i] = di;
      emit(
        'MODULAR-EXPONENTIATION',
        9,
        snapshot(),
        {
          done: [
            ...Array.from({ length: i }, (_, j) => cell(ROW.c, j)),
            ...Array.from({ length: i }, (_, j) => cell(ROW.d, j)),
          ],
          move: [cell(ROW.c, i), cell(ROW.d, i)],
          mark: [cell(ROW.bit, i)],
          pointers: { i: cell(ROW.bit, i) },
          aux: { state: chips(ci, di) },
        },
        `The bit is 1, so multiply by a as well: d = ${di}, and c = ${ci}. Still d = a^c mod n.`,
      );
    }
  }

  emit(
    'MODULAR-EXPONENTIATION',
    10,
    snapshot(),
    {
      done: [
        ...bits.map((_, i) => cell(ROW.c, i)),
        ...Array.from({ length: k - 1 }, (_, i) => cell(ROW.d, i)),
      ],
      mark: [cell(ROW.d, k - 1)],
      result: di,
      aux: { state: chips(ci, di) },
    },
    `c has reached ${b}, so d = ${a}^${b} mod ${n} = ${di}. ${stats.writes / 2} multiplications, none larger than n².`,
  );

  return { steps, output: { result: di, bits: k } };
}

/**
 * The answer matches repeated multiplication, and every intermediate value
 * stayed small.
 *
 * The reference is the definition — multiply `a` by itself `b` times, reducing
 * as you go — which is a different computation from squaring and is only
 * affordable because the generated exponents are small. That the exponents
 * *have* to be small for the check to run is the whole point of the algorithm.
 */
function verify(input: number[], trace: Trace): string | null {
  const [a, b, n] = input as [number, number, number];
  const result = (trace.steps.at(-1)!.hi as { result?: number }).result;
  if (result === undefined) return 'the run reported no result';

  let expected = 1 % n;
  for (let i = 0; i < b; i++) expected = (expected * a) % n;
  if (result !== expected)
    return `the run says ${result}, repeated multiplication says ${expected}`;

  for (const step of trace.steps) {
    if (step.data?.kind !== 'grid') continue;
    for (const row of step.data.rows.slice(2)) {
      for (const cell of row.cells) {
        if (typeof cell.value === 'number' && (cell.value < 0 || cell.value >= n)) {
          return `an intermediate value ${cell.value} escaped the range 0‥${n - 1}`;
        }
      }
    }
  }
  return null;
}

/** Small enough that the verify's repeated multiplication can keep up. */
function generate(n: number): number[] {
  const bits = Math.max(3, Math.min(n, 10));
  const b = (1 << (bits - 1)) + Math.floor(Math.random() * (1 << (bits - 1)));
  const mod = 11 + Math.floor(Math.random() * 200);
  const a = 2 + Math.floor(Math.random() * (mod - 2));
  return [a, b, mod];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== 3) return { error: 'Give three numbers: a, b and n.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0) return { error: `"${part}" is not a whole number.` };
    values.push(v);
  }
  const [a, b, mod] = values as [number, number, number];
  if (mod < 2 || mod > 9999) return { error: 'The modulus must be between 2 and 9999.' };
  if (b < 1 || b > 1023)
    return { error: 'Keep the exponent under 1024, so the check can keep up.' };
  if (a < 1 || a >= mod) return { error: 'The base should be between 1 and n − 1.' };
  return { value: values };
}

export const modularExponentiation: AlgorithmModule = {
  id: 'modular-exponentiation',
  name: 'Modular Exponentiation',
  visualizer: 'grid',
  aux: [{ key: 'state', label: 'inv', hint: 'the loop invariant: d is always a^c mod n' }],
  procOrder: ['MODULAR-EXPONENTIATION'],
  procedures: {
    'MODULAR-EXPONENTIATION': {
      title: 'MODULAR-EXPONENTIATION(a, b, n)',
      indent: [0, 0, 0, 0, 1, 1, 1, 2, 2, 0],
      lines: [
        'c = 0',
        'd = 1',
        'let ⟨b_k, b_{k−1}, …, b_0⟩ be the binary representation of b',
        'for i = k downto 0',
        'c = 2c',
        'd = (d · d) mod n',
        'if b_i == 1',
        'c = c + 1',
        'd = (d · a) mod n',
        'return d',
      ],
    },
  },
  complexity: {
    best: 'Θ(lg b)',
    average: 'Θ(lg b)',
    worst: 'Θ(lg b)',
    space: 'Θ(1)',
    extra: [
      ['Multiplications', '⌊lg b⌋ + 1 squarings, plus one per 1 bit'],
      ['Naive repeated multiplication', 'Θ(b) — impossible at cryptographic sizes'],
      ['Every intermediate value', 'stays under n², so nothing overflows'],
      ['What c is for', 'nothing — it makes the invariant d = a^c mod n visible'],
      ['The hard direction', 'recovering b from a^b mod n: the discrete logarithm'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 10,
    noun: 'exponent',
    placeholder: '7, 560, 561',
    note: 'a, b and n; the slider sets how many bits the exponent has',
    label: 'The base, the exponent and the modulus, separated by commas',
    generate,
    parse,
    size: (value: number[]) => value[1]!.toString(2).length,
  },
  defaultSize: 7,
  result: { kind: 'transforms', verify },
  record,
};
