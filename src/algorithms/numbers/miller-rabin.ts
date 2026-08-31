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
 * MILLER-RABIN — CLRS §31.8.
 *
 * Starred, and so Tier 2 here, but it is the reason chapter 31 is in the book
 * at all: RSA needs large primes, and finding one means testing candidates
 * until one passes. Fermat's test — is `a^(n−1) ≡ 1 (mod n)`? — is the obvious
 * candidate and is not enough, because **Carmichael numbers** pass it for every
 * base `a` coprime to them. 561 = 3 · 11 · 17 is the smallest.
 *
 * Miller-Rabin patches the hole with one extra observation. Write
 * `n − 1 = 2ᵗ · u` with `u` odd, and compute `a^u` and then square it `t`
 * times, which reaches `a^(n−1)` by the route §31.6's player already draws. If
 * `n` is prime, the only square roots of 1 mod n are 1 and n − 1 — so if the
 * squaring sequence ever hits 1 from something that is neither, `n` cannot be
 * prime. That is a **nontrivial square root of 1**, and it is the evidence the
 * table below marks.
 *
 * **The error is one-sided, and that is what makes the test worth anything.**
 * A witness is a proof: when this returns COMPOSITE it is never wrong, and the
 * verify below asserts exactly that. PRIME is the weaker answer — it means "no
 * witness turned up in s tries", and each try misses with probability at most
 * ¼, so s tries leave at most 4⁻ˢ. Press Randomize with a Carmichael number
 * and watch a witness turn up anyway; press it again and occasionally watch one
 * not, which is the algorithm being honest rather than broken.
 */
export function record(input: number[]): Trace {
  const n = input[0] ?? 561;
  const trials = Math.max(1, Math.min(input[1] ?? 3, Math.max(1, n - 2)));
  const { steps, stats, emit } = createRecorder();
  const P = 'MILLER-RABIN';
  const PW = 'WITNESS';

  // n − 1 = 2^t · u, with u odd.
  let t = 0;
  let u = n - 1;
  while (u % 2 === 0) {
    u /= 2;
    t++;
  }

  /** The squaring chain of every trial, at final size from the first frame. */
  const table: Array<Array<number | null>> = Array.from({ length: trials }, () =>
    new Array<number | null>(t + 1).fill(null),
  );
  const bases: Array<number | null> = new Array<number | null>(trials).fill(null);
  /** `"row,col"` of every cell that is evidence n is composite. */
  const evidence = new Set<string>();

  const cell = (row: number, col: number) => `${row},${col}`;

  function snapshot(): GridData {
    return {
      kind: 'grid',
      corner: 'a \\ i',
      colLabels: Array.from({ length: t + 1 }, (_, i) => `x${sub(i)}`),
      rows: table.map((values, r) => ({
        label: bases[r] === null ? '—' : `a=${bases[r]}`,
        cells: values.map((value, c): GridCell => {
          if (value === null) return { value: null };
          const note = evidence.has(cell(r, c)) ? 'witness' : undefined;
          return note ? { value, note } : { value };
        }),
      })),
    };
  }

  /** The decomposition, which every step is measured against. */
  const held = () => ({
    nu: auxOf([null, t, u], undefined, [null, 't', 'u']),
  });

  /** The row currently being worked on, as a rectangle. */
  const row = (r: number) => Array.from({ length: t + 1 }, (_, c) => cell(r, c));

  /**
   * Every trial that has finished without finding a witness.
   *
   * Accumulated rather than named one row at a time: a trial that has been
   * settled stays settled, and a row that lost its colour when the next trial
   * began would read as though the test had gone back to it.
   */
  const cleared: string[] = [];

  function modpow(base: number, exp: number, mod: number): number {
    let result = 1;
    let b = base % mod;
    let e = exp;
    while (e > 0) {
      if (e % 2 === 1) result = (result * b) % mod;
      b = (b * b) % mod;
      e = Math.floor(e / 2);
    }
    return result;
  }

  emit(
    P,
    1,
    snapshot(),
    { aux: held() },
    `Testing n = ${n}. First, n − 1 = ${n - 1} = 2^${t} · ${u}, with u odd — that decomposition is what the whole test is built on.`,
  );

  const tried = new Set<number>();
  let composite = false;

  for (let r = 0; r < trials && !composite; r++) {
    let a = 2 + Math.floor(Math.random() * Math.max(1, n - 3));
    for (let guard = 0; tried.has(a) && guard < 50; guard++) {
      a = 2 + Math.floor(Math.random() * Math.max(1, n - 3));
    }
    tried.add(a);
    bases[r] = a;

    emit(
      P,
      2,
      snapshot(),
      { aux: held(), scope: row(r), scopeLabel: `trial ${r + 1} of ${trials}` },
      `Trial ${r + 1}: pick a base a = ${a}, somewhere in 1‥n−1.`,
    );

    // x₀ = a^u mod n — §31.6's algorithm, whose player is on this page.
    table[r]![0] = modpow(a, u, n);
    stats.writes++;
    emit(
      PW,
      2,
      snapshot(),
      {
        aux: held(),
        scope: row(r),
        scopeLabel: `trial ${r + 1} of ${trials}`,
        move: [cell(r, 0)],
      },
      `x₀ = ${a}^${u} mod ${n} = ${table[r]![0]}, by the repeated squaring §31.6 draws.`,
    );

    let witness = false;

    for (let i = 1; i <= t; i++) {
      const previous = table[r]![i - 1]!;
      const value = (previous * previous) % n;
      table[r]![i] = value;
      stats.writes++;
      stats.comparisons++;
      emit(
        PW,
        4,
        snapshot(),
        {
          aux: held(),
          scope: row(r),
          scopeLabel: `trial ${r + 1} of ${trials}`,
          look: [cell(r, i - 1)],
          move: [cell(r, i)],
          arrows: [{ from: cell(r, i - 1), to: cell(r, i) }],
        },
        `x${sub(i)} = x${sub(i - 1)}² mod ${n} = ${previous}² mod ${n} = ${value}.`,
      );

      stats.comparisons++;
      if (value === 1 && previous !== 1 && previous !== n - 1) {
        evidence.add(cell(r, i - 1));
        witness = true;
        emit(
          PW,
          6,
          snapshot(),
          {
            aux: held(),
            scope: row(r),
            scopeLabel: `trial ${r + 1} of ${trials}`,
            mark: [cell(r, i - 1), cell(r, i)],
            arrows: [{ from: cell(r, i - 1), to: cell(r, i) }],
          },
          `${previous}² ≡ 1 (mod ${n}), and ${previous} is neither 1 nor ${n - 1}. A prime has only two square roots of 1, so ${n} is composite — and this is a proof, not a guess.`,
        );
        break;
      }
    }

    if (!witness) {
      const last = table[r]![t]!;
      stats.comparisons++;
      if (last !== 1) {
        evidence.add(cell(r, t));
        witness = true;
        emit(
          PW,
          8,
          snapshot(),
          {
            aux: held(),
            scope: row(r),
            scopeLabel: `trial ${r + 1} of ${trials}`,
            mark: [cell(r, t)],
          },
          `x${sub(t)} = ${a}^${n - 1} mod ${n} = ${last}, not 1. Fermat's little theorem says a prime would give 1, so ${n} is composite.`,
        );
      } else {
        cleared.push(...row(r));
        emit(
          PW,
          9,
          snapshot(),
          {
            aux: held(),
            scope: row(r),
            scopeLabel: `trial ${r + 1} of ${trials}`,
            done: cleared,
          },
          `The chain reaches 1 without ever passing through a nontrivial square root, and ends at 1. Base ${a} is no witness — which is evidence for ${n} being prime, and not proof.`,
        );
      }
    }

    if (witness) {
      composite = true;
      emit(
        P,
        4,
        snapshot(),
        { aux: held(), mark: [...evidence] },
        `Return COMPOSITE. One witness is enough, and it is never wrong — the marked cell is the proof.`,
      );
    }
  }

  if (!composite) {
    emit(
      P,
      5,
      snapshot(),
      { aux: held(), done: cleared },
      `Return PRIME. ${trials} base${trials === 1 ? '' : 's'} found no witness, and at most a quarter of the bases can miss, so the chance of being wrong is under 4^−${trials} ≈ ${(4 ** -trials).toFixed(4)}.`,
    );
  }

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = {
    n,
    t,
    u,
    composite,
    rows: table.map((values, r) => ({ a: bases[r], values: values.slice() })),
  };
  return { steps, output: { n, trials, composite: composite ? 1 : 0 } };
}

/** Digits as subscripts, so a column heading reads x₀ rather than x0. */
function sub(value: number): string {
  return String(value).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]!);
}

/** Trial division — the definition of prime, for a verify to hold the run to. */
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

/**
 * Candidates worth testing, rather than random odd numbers.
 *
 * Almost every random odd number is composite for a reason the first base
 * finds instantly, which makes for a dull table and hides what the test is
 * for. These are the interesting cases: Carmichael numbers, which pass
 * Fermat's test for every coprime base; strong pseudoprimes, which pass
 * Miller-Rabin for base 2 in particular; genuine primes; and a few ordinary
 * composites so the common case is on screen too.
 */
const CANDIDATES = [
  561,
  1105,
  1729,
  2465,
  2821,
  6601, // Carmichael
  2047,
  3277,
  4033,
  4681, // strong pseudoprimes to base 2
  101,
  211,
  401,
  787,
  907,
  1013,
  2003, // prime
  91,
  143,
  341,
  703,
  1387, // ordinary composites
];

export const millerRabin: AlgorithmModule = {
  id: 'miller-rabin',
  name: 'Miller-Rabin',
  visualizer: 'grid',
  aux: [{ key: 'nu', label: 'n−1', hint: 'the decomposition n − 1 = 2ᵗ · u, with u odd' }],
  input: {
    minSize: 1,
    maxSize: 6,
    noun: 'test',
    placeholder: '561, 3',
    note: 'n and s — the slider sets how many bases are tried',
    label: 'The number to test and the number of trials, separated by a comma',
    generate(trials: number): number[] {
      const n = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)]!;
      return [n, Math.max(1, Math.min(trials, 6))];
    },
    parse(text: string): ParsedInput {
      const parts = text
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length !== 2) return { error: 'Give two numbers: n and the number of trials.' };
      const [n, s] = parts.map(Number) as [number, number];
      if (!Number.isInteger(n) || !Number.isInteger(s))
        return { error: 'Both must be whole numbers.' };
      if (n < 5 || n > 99999) return { error: 'Test an n between 5 and 99999.' };
      if (n % 2 === 0) return { error: 'n must be odd — every even number above 2 is composite.' };
      if (s < 1 || s > 6) return { error: 'Between 1 and 6 trials.' };
      return { value: [n, s] };
    },
    size: (input: number[]) => input[1] ?? 1,
  },
  defaultSize: 3,
  procOrder: ['MILLER-RABIN', 'WITNESS'],
  procedures: {
    'MILLER-RABIN': {
      title: 'MILLER-RABIN(n, s)',
      indent: [0, 1, 1, 2, 0],
      lines: [
        'for j = 1 to s',
        'a = RANDOM(1, n - 1)',
        'if WITNESS(a, n)',
        'return COMPOSITE',
        'return PRIME',
      ],
    },
    WITNESS: {
      title: 'WITNESS(a, n)',
      indent: [0, 0, 0, 1, 1, 2, 0, 1, 0],
      lines: [
        'let n - 1 = 2ᵗ · u, with t ≥ 1 and u odd',
        'x₀ = MODULAR-EXPONENTIATION(a, u, n)',
        'for i = 1 to t',
        'xᵢ = xᵢ₋₁² mod n',
        'if xᵢ == 1 and xᵢ₋₁ ≠ 1 and xᵢ₋₁ ≠ n - 1',
        'return TRUE',
        'if xₜ ≠ 1',
        'return TRUE',
        'return FALSE',
      ],
    },
  },
  complexity: {
    best: 'Θ(lg n)',
    average: 'Θ(s · lg n)',
    worst: 'Θ(s · lg n)',
    space: 'Θ(1) beyond the squaring chain',
    extra: [
      ['Error', 'one-sided — COMPOSITE is a proof, PRIME is a probability'],
      ['Wrong at most', '4⁻ˢ, whatever n is'],
      ['Fermat alone', 'fooled by every Carmichael number: 561, 1105, 1729, …'],
      ['The extra check', 'a nontrivial square root of 1, which no prime has'],
      ['Why it matters', 'RSA needs primes, and this is how they are found'],
    ],
  },
  result: {
    kind: 'transforms',
    /**
     * The one-sided error, and the arithmetic underneath it.
     *
     * A COMPOSITE verdict is a claim that can be checked outright: it must be
     * true, and the cell marked as evidence must really be evidence. A PRIME
     * verdict cannot be checked the same way — the algorithm is allowed to be
     * wrong, with probability at most 4⁻ˢ — so what is checked instead is that
     * it is never wrong about a **prime**, which is a guarantee rather than a
     * probability, and that every square in the table is a square.
     */
    verify(input: number[], trace: Trace): string | null {
      const n = input[0]!;
      const answer = (
        trace.steps.at(-1)?.hi as {
          result?: {
            n: number;
            t: number;
            u: number;
            composite: boolean;
            rows: Array<{ a: number | null; values: Array<number | null> }>;
          };
        }
      )?.result;
      if (!answer) return 'the run recorded no verdict';

      if (answer.n !== n) return `tested ${answer.n} rather than ${n}`;
      if (2 ** answer.t * answer.u !== n - 1 || answer.u % 2 === 0) {
        return `decomposed n − 1 = ${n - 1} as 2^${answer.t} · ${answer.u}, which is wrong or has u even`;
      }

      const prime = isPrime(n);

      // The guarantee. A witness exists only for a composite, so a prime can
      // never be declared composite however unlucky the bases are.
      if (answer.composite && prime) {
        return `declared ${n} composite, but it is prime — the error is meant to be one-sided`;
      }
      // And the converse is *not* an error: a composite may survive s trials.
      if (!answer.composite && !prime) {
        // Allowed, but only if no row actually held a witness.
        for (const { a, values } of answer.rows) {
          if (a === null) continue;
          for (let i = 1; i < values.length; i++) {
            const previous = values[i - 1];
            const value = values[i];
            if (value === 1 && previous !== null && previous !== 1 && previous !== n - 1) {
              return `base ${a} produced the nontrivial square root ${previous}, which was not reported`;
            }
          }
          if (values[answer.t] !== null && values[answer.t] !== 1) {
            return `base ${a} ended at ${values[answer.t]} rather than 1, which was not reported`;
          }
        }
      }

      // The chain itself: x₀ = a^u, and every later entry is the square of the
      // one before it. Recomputed here rather than read back.
      for (const { a, values } of answer.rows) {
        if (a === null) continue;
        let expected = 1;
        let base = a % n;
        let exponent = answer.u;
        while (exponent > 0) {
          if (exponent % 2 === 1) expected = (expected * base) % n;
          base = (base * base) % n;
          exponent = Math.floor(exponent / 2);
        }
        if (values[0] !== expected) {
          return `x₀ for base ${a} is ${values[0]}, but ${a}^${answer.u} mod ${n} is ${expected}`;
        }
        for (let i = 1; i < values.length; i++) {
          if (values[i] === null) break;
          const previous = values[i - 1]!;
          if (values[i] !== (previous * previous) % n) {
            return `x${i} for base ${a} is ${values[i]}, not ${previous}² mod ${n}`;
          }
        }
      }
      return null;
    },
  },
  record,
};
