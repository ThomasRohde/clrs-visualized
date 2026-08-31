import {
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * GREEDY-SET-COVER — CLRS §35.3.
 *
 * You have a universe X of things that must all be covered, and a family F of
 * subsets you may buy. Take as few subsets as possible. This is the abstract
 * form of an enormous number of real problems — which crews to hire, which
 * servers to site, which tests to run — and it is NP-hard.
 *
 * The greedy rule is the one anybody would try first: **take whichever set
 * covers the most still-uncovered elements, and repeat.**
 *
 * It is not optimal, and the picture shows why it cannot be: it commits to the
 * biggest immediate win with no idea whether that win cuts across the sets it
 * will need later. But it is never *badly* wrong. Its ratio is **H(d)**, the
 * d-th harmonic number, where d is the size of the largest set — at most
 * ln|X| + 1.
 *
 * That is a weaker promise than §35.1's factor of 2, and it is the best
 * available: a ln|X| factor is, up to lower-order terms, provably the limit
 * for any polynomial-time algorithm unless P = NP. Greedy is not a stopgap
 * here. It is the answer.
 *
 * **The right-hand column is the algorithm.** It holds |S ∩ U| for every set —
 * how much each one would buy right now — and the whole of line 4 is "take the
 * biggest number in that column". Watch it fall as elements get covered: a set
 * that looked excellent early is worth nothing once another set has taken its
 * elements, and greedy re-reads the whole column every round precisely because
 * those numbers move.
 */

/** Element `e` is bit `e − 1`; a set is one integer. Input is `[n, …masks]`. */
const bit = (e: number): number => 1 << (e - 1);
const members = (mask: number, n: number): number[] => {
  const out: number[] = [];
  for (let e = 1; e <= n; e++) if (mask & bit(e)) out.push(e);
  return out;
};
const size = (mask: number): number => {
  let k = 0;
  for (let m = mask; m > 0; m &= m - 1) k++;
  return k;
};

export function record(input: number[]): Trace {
  const n = input[0]!;
  const sets = input.slice(1);
  const k = sets.length;

  const { steps, stats, emit } = createRecorder();
  let uncovered = (1 << n) - 1;
  const chosen: number[] = [];

  const cell = (r: number, c: number) => `${r},${c}`;
  /** The count column: one past the last element. */
  const countCol = n;

  function snapshot(): GridData {
    return {
      kind: 'grid',
      corner: 'F \\ X',
      colLabels: [...Array.from({ length: n }, (_, i) => i + 1), '|S ∩ U|'],
      rows: sets.map((mask, r) => ({
        // A tick in the label, not a colour: being in C is a fact about the
        // answer rather than a visual state, so E6 keeps it out of the ramp.
        label: `S${r + 1}${chosen.includes(r) ? ' ✓' : ''}`,
        cells: [
          ...Array.from({ length: n }, (_, i): GridCell => ({
            value: mask & bit(i + 1) ? '•' : null,
          })),
          { value: size(mask & uncovered) },
        ],
      })),
    };
  }

  /** Every membership cell whose element is already covered. */
  function coveredCells(): string[] {
    const out: string[] = [];
    sets.forEach((mask, r) => {
      for (let e = 1; e <= n; e++) {
        if (mask & bit(e) && !(uncovered & bit(e))) out.push(cell(r, e - 1));
      }
    });
    return out;
  }

  const left = () => size(uncovered);

  emit(
    'GREEDY-SET-COVER',
    2,
    snapshot(),
    { done: [] },
    `${n} elements to cover, ${k} sets to choose from. The last column is what each set is worth.`,
  );

  while (uncovered !== 0) {
    let best = -1;
    let bestGain = -1;
    for (let r = 0; r < k; r++) {
      const gain = size(sets[r]! & uncovered);
      stats.comparisons++;
      if (gain > bestGain) {
        bestGain = gain;
        best = r;
      }
    }
    if (bestGain <= 0) break;
    // "Maximizes" does not mean "beats": ties are ordinary, and a narration
    // claiming otherwise is wrong on the step the reader is looking at.
    const tied = sets.filter((m) => size(m & uncovered) === bestGain).length;

    emit(
      'GREEDY-SET-COVER',
      4,
      snapshot(),
      {
        done: coveredCells(),
        look: Array.from({ length: k }, (_, r) => cell(r, countCol)),
        mark: cell(best, countCol),
      },
      tied > 1
        ? `S${best + 1} covers ${bestGain} of the ${left()} still uncovered — tied with ${tied - 1} other${tied > 2 ? 's' : ''}, so take the first.`
        : `S${best + 1} would cover ${bestGain} of the ${left()} still uncovered — more than any other set.`,
    );

    const gained = members(sets[best]! & uncovered, n);
    uncovered &= ~sets[best]!;
    chosen.push(best);
    stats.writes++;

    emit(
      'GREEDY-SET-COVER',
      6,
      snapshot(),
      {
        // Every cell in a newly covered column goes `done`; the chosen row's
        // own cells are re-claimed as `move` below, since move outranks done.
        done: coveredCells(),
        move: gained.map((e) => cell(best, e - 1)),
        scope: Array.from({ length: n + 1 }, (_, c) => cell(best, c)),
        scopeLabel: `S${best + 1} joins C`,
      },
      left() === 0
        ? `Every element is covered, and C has ${chosen.length} sets.`
        : `${gained.join(', ')} covered. ${left()} left, and every count in the column just fell.`,
    );
  }

  emit(
    'GREEDY-SET-COVER',
    7,
    snapshot(),
    {
      done: coveredCells(),
      chosen: [...chosen],
    },
    `Return C: ${chosen.map((r) => `S${r + 1}`).join(', ')} — ${chosen.length} sets covering all ${n}.`,
  );

  return { steps, output: { sets: chosen.length } };
}

/**
 * The H(d) bound, against an optimum found by exhaustive search.
 *
 * Greedy's guarantee is weaker than the previous two sections' constants and
 * so is worth checking harder, not less: the cover is confirmed to be a cover,
 * the optimum is computed over every subfamily of F, and greedy is required to
 * land inside H(d) times it, with d the size of the largest set.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = input[0]!;
  const sets = input.slice(1);
  const chosen = (trace.steps.at(-1)!.hi as { chosen?: number[] }).chosen;
  if (!chosen) return 'the run returned no cover';

  const all = (1 << n) - 1;
  let got = 0;
  for (const r of chosen) {
    if (r < 0 || r >= sets.length) return `C names S${r + 1}, which is not in F`;
    got |= sets[r]!;
  }
  if (got !== all) {
    return `C leaves ${members(all & ~got, n).join(', ')} uncovered`;
  }

  // Every subfamily, smallest first — the exhaustive search greedy exists to
  // avoid, affordable only because F is tiny here.
  let optimum = sets.length;
  for (let mask = 0; mask < 1 << sets.length; mask++) {
    const count = size(mask);
    if (count >= optimum) continue;
    let union = 0;
    for (let r = 0; r < sets.length; r++) if (mask & (1 << r)) union |= sets[r]!;
    if (union === all) optimum = count;
  }
  if (chosen.length < optimum) {
    return `C has ${chosen.length} sets, fewer than the optimum's ${optimum} — impossible`;
  }

  const d = Math.max(...sets.map(size));
  let harmonic = 0;
  for (let i = 1; i <= d; i++) harmonic += 1 / i;
  if (chosen.length > harmonic * optimum + 1e-9) {
    return `C has ${chosen.length} sets against an optimum of ${optimum}, outside the H(${d}) = ${harmonic.toFixed(2)} bound`;
  }
  return null;
}

/**
 * A family that genuinely needs covering.
 *
 * Every element is put in some set first, so a cover exists at all; the extra
 * memberships on top are what give greedy something to be greedy about. The
 * sets are kept few and the universe small because the `verify` brute-forces
 * the optimum, and because a table wider than a dozen columns stops being
 * readable at the sizes the player draws at.
 */
function generate(nRequested: number): number[] {
  const n = Math.max(5, Math.min(nRequested, 12));
  const k = Math.max(3, Math.min(6, Math.round(n / 2) + 1));
  for (let attempt = 0; attempt < 60; attempt++) {
    const masks = new Array<number>(k).fill(0);
    for (let e = 1; e <= n; e++) masks[Math.floor(Math.random() * k)]! |= bit(e);
    for (let r = 0; r < k; r++) {
      for (let e = 1; e <= n; e++) if (Math.random() < 0.22) masks[r]! |= bit(e);
    }
    // A set nobody would ever buy makes a dead row; an instance one set covers
    // outright makes a one-step run. Neither is worth drawing.
    if (masks.some((m) => m === 0)) continue;
    if (masks.some((m) => m === (1 << n) - 1)) continue;
    return [n, ...masks];
  }
  return [
    n,
    ...new Array<number>(k).fill(0).map((_, r) => bit(1 + (r % n)) | bit(1 + ((r + 1) % n))),
  ];
}

function parse(text: string): ParsedInput {
  const groups = text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (groups.length < 2) return { error: 'Give at least two sets, separated by semicolons.' };
  if (groups.length > 8)
    return { error: 'At most eight sets — the optimum is found by brute force.' };

  const masks: number[] = [];
  let n = 0;
  for (const group of groups) {
    let mask = 0;
    const parts = group
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0)
      return { error: `"${group}" is an empty set — every set must hold something.` };
    for (const part of parts) {
      const e = Number(part);
      if (!Number.isInteger(e) || e < 1 || e > 12) {
        return { error: `"${part}" is not an element — they are numbered 1 to 12.` };
      }
      mask |= bit(e);
      n = Math.max(n, e);
    }
    masks.push(mask);
  }
  const all = (1 << n) - 1;
  let union = 0;
  for (const m of masks) union |= m;
  if (union !== all) {
    return {
      error: `Nothing covers ${members(all & ~union, n).join(', ')} — there would be no cover at all.`,
    };
  }
  return { value: [n, ...masks] };
}

export const greedySetCover: AlgorithmModule = {
  id: 'greedy-set-cover',
  name: 'Greedy Set Cover',
  visualizer: 'grid',
  procOrder: ['GREEDY-SET-COVER'],
  procedures: {
    'GREEDY-SET-COVER': {
      title: 'GREEDY-SET-COVER(X, F)',
      indent: [0, 0, 0, 1, 1, 1, 0],
      lines: [
        'U = X',
        'C = ∅',
        'while U ≠ ∅',
        'select an S ∈ F that maximizes |S ∩ U|',
        'U = U − S',
        'C = C ∪ {S}',
        'return C',
      ],
    },
  },
  complexity: {
    best: 'O(|X| · |F| · min(|X|, |F|))',
    average: 'O(|X| · |F| · min(|X|, |F|))',
    worst: 'O(|X| · |F| · min(|X|, |F|))',
    space: 'Θ(|X| + |F|)',
    extra: [
      ['Approximation ratio', 'H(d) ≤ ln|X| + 1, with d the largest set'],
      ['Why it is not a stopgap', 'no polynomial algorithm beats ln|X| unless P = NP'],
      [
        'What it re-reads every round',
        'the whole column — the counts move as elements are covered',
      ],
      ['What it never does', 'reconsider a set it already bought'],
      ['Where it appears', 'crew scheduling, test selection, facility siting'],
    ],
  },
  input: {
    minSize: 5,
    maxSize: 12,
    noun: 'family',
    placeholder: '1,2,3,4; 5,6,7,8; 1,2,5,6; 3,4,7,8',
    note: 'sets separated by semicolons; elements 1–12',
    label: 'The family F, as sets of element numbers',
    generate,
    parse,
    size: (value: number[]) => value[0]!,
  },
  defaultSize: 10,
  result: { kind: 'transforms', verify },
  record,
};
