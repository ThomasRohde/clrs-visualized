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
 * EUCLID AND EXTENDED-EUCLID — CLRS §31.2.
 *
 * The oldest algorithm still in daily use — Euclid wrote it down around 300
 * BC — and the engine underneath most of modern cryptography.
 *
 * The plain version rests on one identity: **gcd(a, b) = gcd(b, a mod b)**.
 * Any common divisor of a and b divides `a − qb` for any q, so the pair
 * (b, a mod b) has exactly the same common divisors as (a, b) — and it is a
 * much smaller pair. Recurse until the second number is 0, at which point the
 * first one is the answer.
 *
 * It is fast for a reason worth knowing. `a mod b` is less than half of `a`
 * whenever `b ≤ a/2`, and otherwise `a mod b = a − b` is also less than
 * `a/2` — so the numbers halve every **two** steps and the algorithm is
 * O(lg b) divisions. **Lamé's theorem** sharpens that: the worst case is
 * consecutive Fibonacci numbers, and even then it is only about 4.8 digits
 * of input per division. Try 89 and 55.
 *
 * The extended version returns two more numbers, `x` and `y`, with
 *
 *     a·x + b·y = gcd(a, b)
 *
 * which is **Bézout's identity**. Those coefficients are what make the rest
 * of chapter 31 possible: `x` is the modular inverse of `a` whenever the gcd
 * is 1, and a modular inverse is what §31.4 solves equations with, what the
 * Chinese remainder theorem reassembles with, and what turns an RSA public
 * key into a private one.
 *
 * The run has two halves and they go in opposite directions. **Down** the
 * columns, the pair shrinks by repeated division — that is plain Euclid.
 * **Back up**, the coefficients are assembled from the level below, and each
 * one is one subtraction. Watch the arrows reverse at the bottom.
 */

const ROW = { a: 0, b: 1, q: 2, d: 3, x: 4, y: 5 } as const;

export function record(input: number[]): Trace {
  const [a0, b0] = input as [number, number];

  /** One recursion level: the pair, the quotient, and the answers. */
  interface Level {
    a: number;
    b: number;
    q: number | null;
    d: number | null;
    x: number | null;
    y: number | null;
  }
  const levels: Level[] = [];
  for (let a = a0, b = b0; ;) {
    levels.push({ a, b, q: b === 0 ? null : Math.floor(a / b), d: null, x: null, y: null });
    if (b === 0) break;
    [a, b] = [b, a % b];
  }

  const { steps, stats, emit } = createRecorder();
  const depth = levels.length;
  /** How far down the descent has got, and how far back up the ascent has. */
  let shown = 0;
  let filled = depth;

  function snapshot(): GridData {
    const cellsFor = (pick: (l: Level) => number | null, downward: boolean): GridCell[] =>
      levels.map((l, k): GridCell => {
        const visible = downward ? k < shown : k >= filled;
        const v = pick(l);
        return { value: visible && v !== null ? v : null };
      });
    return {
      kind: 'grid',
      corner: '',
      colLabels: levels.map((_, k) => k),
      rows: [
        { label: 'a', cells: cellsFor((l) => l.a, true) },
        { label: 'b', cells: cellsFor((l) => l.b, true) },
        { label: 'q', cells: cellsFor((l) => l.q, true) },
        { label: 'd', cells: cellsFor((l) => l.d, false) },
        { label: 'x', cells: cellsFor((l) => l.x, false) },
        { label: 'y', cells: cellsFor((l) => l.y, false) },
      ],
    };
  }

  const cell = (row: number, k: number) => `${row},${k}`;
  const column = (k: number) => [0, 1, 2, 3, 4, 5].map((r) => cell(r, k));
  const chips = (k: number) => auxOf([null, k, depth - 1], undefined, [null, 'level', 'deepest']);

  // ---- down: plain Euclid ------------------------------------------------
  for (let k = 0; k < depth; k++) {
    shown = k + 1;
    const l = levels[k]!;
    stats.comparisons++;
    if (l.b !== 0) stats.writes++;
    emit(
      'EXTENDED-EUCLID',
      l.b === 0 ? 1 : 3,
      snapshot(),
      {
        done: Array.from({ length: k }, (_, j) => column(j)).flat(),
        move: [cell(ROW.a, k), cell(ROW.b, k), ...(l.q === null ? [] : [cell(ROW.q, k)])],
        ...(k > 0
          ? {
              look: [cell(ROW.a, k - 1), cell(ROW.b, k - 1)],
              arrows: [
                { from: cell(ROW.b, k - 1), to: cell(ROW.a, k), role: 'look' as const },
                { from: cell(ROW.a, k - 1), to: cell(ROW.b, k), role: 'look' as const },
              ],
            }
          : {}),
        scope: column(k),
        scopeLabel: `level ${k}`,
        aux: { level: chips(k) },
      },
      l.b === 0
        ? `b is 0, so the gcd is a = ${l.a}. The descent stops and the coefficients start coming back.`
        : `gcd(${l.a}, ${l.b}) = gcd(${l.b}, ${l.a % l.b}): ${l.a} = ${l.q}·${l.b} + ${l.a % l.b}, and the pair shrinks.`,
    );
  }

  /** Every column with something in it — the descent is complete by now. */
  const settledColumns = (): string[] => levels.map((_, j) => column(j)).flat();

  // ---- back up: the coefficients ----------------------------------------
  for (let k = depth - 1; k >= 0; k--) {
    const l = levels[k]!;
    filled = k;
    if (l.b === 0) {
      l.d = l.a;
      l.x = 1;
      l.y = 0;
      stats.writes += 3;
      emit(
        'EXTENDED-EUCLID',
        2,
        snapshot(),
        {
          done: settledColumns(),
          move: [cell(ROW.d, k), cell(ROW.x, k), cell(ROW.y, k)],
          scope: column(k),
          scopeLabel: `level ${k}`,
          aux: { level: chips(k) },
        },
        `The base case: ${l.a}·1 + 0·0 = ${l.a}. Every level above builds its own pair from this.`,
      );
      continue;
    }
    const below = levels[k + 1]!;
    l.d = below.d!;
    l.x = below.y!;
    l.y = below.x! - l.q! * below.y!;
    stats.writes += 3;
    emit(
      'EXTENDED-EUCLID',
      4,
      snapshot(),
      {
        done: settledColumns(),
        move: [cell(ROW.d, k), cell(ROW.x, k), cell(ROW.y, k)],
        look: [cell(ROW.d, k + 1), cell(ROW.x, k + 1), cell(ROW.y, k + 1), cell(ROW.q, k)],
        arrows: [
          { from: cell(ROW.y, k + 1), to: cell(ROW.x, k), role: 'look' as const },
          { from: cell(ROW.x, k + 1), to: cell(ROW.y, k), role: 'look' as const },
        ],
        scope: column(k),
        scopeLabel: `level ${k}`,
        aux: { level: chips(k) },
      },
      `x takes the level below's y; y is ${below.x} − ${l.q}·${below.y} = ${l.y}. One subtraction per level.`,
    );
  }

  const top = levels[0]!;
  emit(
    'EXTENDED-EUCLID',
    5,
    snapshot(),
    {
      done: levels
        .map((_, k) => column(k))
        .flat()
        .filter((c) => !column(0).includes(c)),
      mark: column(0),
      result: { d: top.d!, x: top.x!, y: top.y! },
      aux: { level: chips(0) },
    },
    `${a0}·${top.x} + ${b0}·${top.y} = ${top.d}. That is Bézout's identity, and x is the inverse when d = 1.`,
  );

  return { steps, output: { gcd: top.d!, levels: depth } };
}

/**
 * The gcd is the gcd, and Bézout's identity actually holds.
 *
 * The first is checked by trial division from below — slow, unrelated to
 * Euclid, and unambiguous. The second is one multiplication and an addition,
 * and it is the claim the extended version exists to make, so checking it is
 * checking the whole point rather than a side effect.
 */
function verify(input: number[], trace: Trace): string | null {
  const [a, b] = input as [number, number];
  const hi = trace.steps.at(-1)!.hi as { result?: { d: number; x: number; y: number } };
  const r = hi.result;
  if (!r) return 'the run reported no result';

  let expected = 0;
  for (let k = 1; k <= Math.max(a, b); k++) {
    if ((a === 0 || a % k === 0) && (b === 0 || b % k === 0)) expected = k;
  }
  if (r.d !== expected) return `the run says gcd is ${r.d}, trial division says ${expected}`;
  if (a * r.x + b * r.y !== r.d) {
    return `${a}·${r.x} + ${b}·${r.y} = ${a * r.x + b * r.y}, not ${r.d}`;
  }
  return null;
}

/** How many divisions Euclid takes on this pair — what the size slider sets. */
function descent(a: number, b: number): number {
  let steps = 0;
  while (b !== 0) {
    [a, b] = [b, a % b];
    steps++;
  }
  return steps;
}

/**
 * A pair whose descent is exactly as long as the slider asks for.
 *
 * Built backwards from the answer rather than drawn at random: start at
 * `(g, 0)` and run the recurrence `aᵢ₊₁ = qᵢ·aᵢ + aᵢ₋₁` upwards, which is
 * Euclid in reverse. Every quotient of 1 makes it the Fibonacci worst case,
 * so keeping the quotients small keeps the numbers small for a given depth —
 * which is Lamé's theorem, used as a construction. Drawing a random pair
 * instead would make a long descent rare, and the slider a lie.
 */
function generate(n: number): number[] {
  const want = Math.max(2, Math.min(n, 14));
  const g = 1 + Math.floor(Math.random() * 5);
  let prev = 0;
  let cur = g;
  for (let i = 0; i < want; i++) {
    const q = 1 + Math.floor(Math.random() * 3);
    const next = q * cur + prev;
    if (next > 9999) break;
    prev = cur;
    cur = next;
  }
  return [cur, prev];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== 2) return { error: 'Give two numbers, a and b, separated by a comma.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 9999) {
      return { error: `"${part}" is not a whole number between 0 and 9999.` };
    }
    values.push(v);
  }
  if (values[0]! < values[1]!) return { error: 'Put the larger number first.' };
  if (values[0] === 0) return { error: 'The first number must be positive.' };
  return { value: values };
}

export const extendedEuclid: AlgorithmModule = {
  id: 'extended-euclid',
  name: 'Extended Euclid',
  visualizer: 'grid',
  aux: [{ key: 'level', label: 'k', hint: 'how deep the recursion has gone' }],
  procOrder: ['EXTENDED-EUCLID'],
  procedures: {
    'EXTENDED-EUCLID': {
      title: 'EXTENDED-EUCLID(a, b)',
      indent: [0, 1, 0, 1, 1],
      lines: [
        'if b == 0',
        'return (a, 1, 0)',
        'else (d′, x′, y′) = EXTENDED-EUCLID(b, a mod b)',
        '(d, x, y) = (d′, y′, x′ − ⌊a/b⌋ y′)',
        'return (d, x, y)',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'O(lg b)',
    worst: 'O(lg b)',
    space: 'O(lg b)',
    extra: [
      ['Why it is fast', 'the numbers halve every two steps'],
      ['Worst case', 'consecutive Fibonacci numbers — Lamé’s theorem'],
      ['What x is for', 'the inverse of a modulo b, whenever gcd(a, b) = 1'],
      ['Bézout’s identity', 'a·x + b·y = gcd(a, b), always solvable'],
      ['Age', 'about 2,300 years, and unimproved'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 14,
    noun: 'pair',
    placeholder: '99, 78',
    note: 'the larger number first; n is how many divisions the pair takes',
    label: 'Two whole numbers, larger first, separated by a comma',
    generate,
    parse,
    size: (value: number[]) => descent(value[0]!, value[1]!),
  },
  defaultSize: 10,
  result: { kind: 'transforms', verify },
  record,
};
