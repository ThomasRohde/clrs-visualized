import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type Cell,
  type CellsData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * APPROX-SUBSET-SUM — CLRS §35.5.
 *
 * Given a set of numbers and a target t, find the subset whose sum comes
 * closest to t without going over. The exact algorithm is easy to write and
 * hopeless to run: keep the list of every sum you can make, and each new
 * number doubles it.
 *
 * This section fixes that with one idea. **If two reachable sums are within a
 * hair of each other, keep only one of them.** Trimming by a factor of 1 + δ
 * collapses the list to O(ln t / δ) entries no matter how many numbers there
 * are, and the error it introduces compounds by at most (1 + δ) per round.
 *
 * Choose δ = ε/2n and the whole run comes back within a factor of 1 − ε of
 * the true best, in time polynomial in n **and** in 1/ε. That is a **fully
 * polynomial-time approximation scheme** — the strongest thing chapter 35
 * has, and the only place in the book where you get to *dial* how good an
 * answer you want and pay a predictable price for it.
 *
 * Three things happen to L on every round, and all three are worth watching.
 *
 * **It doubles.** Every sum in it, plus xᵢ, is also reachable.
 *
 * **It is trimmed.** Sums close enough to their neighbour are dropped, which
 * is the only reason the list does not explode. This is where the answer
 * stops being exact.
 *
 * **It is cut at t.** Anything over the target can never come back under it,
 * so it is dead weight.
 *
 * The list's length is the whole story of the algorithm: run it and watch the
 * row grow and then get shorter again. Without the middle step the row would
 * be 2ⁿ long by the end.
 */

/** The accuracy asked for. δ = ε/2n follows from it, and is what TRIM uses. */
const EPSILON = 0.4;

const sid = (value: number): string => `s${value}`;
const xid = (i: number): string => `x${i}`;

export function record(input: number[]): Trace {
  const t = input[0]!;
  const x = input.slice(1);
  const n = x.length;
  const delta = EPSILON / (2 * n);

  const { steps, stats, emit } = createRecorder();
  let list: number[] = [0];

  function snapshot(shown: number[]): CellsData {
    return {
      kind: 'cells',
      // L goes **first**, and not only because it is the protagonist. The
      // cells renderer draws a scope caption in the gap above the row it
      // brackets, and only the first row has a band reserved for it — under
      // any other row the caption is drawn across the cells above. L is what
      // the bracket describes, so L is the row that has to be on top.
      rows: [
        {
          label: 'L',
          cells: shown.map((v): Cell => ({ id: sid(v), value: v })),
        },
        {
          label: 'S',
          cells: x.map((v, i): Cell => ({ id: xid(i + 1), value: v })),
        },
      ],
    };
  }

  const chips = (len = list.length) => auxOf([null, len], undefined, [null, '|L|']);

  const settled = (i: number) => Array.from({ length: i }, (_, k) => xid(k + 1));

  emit(
    'APPROX-SUBSET-SUM',
    2,
    snapshot(list),
    {
      scope: list.map(sid),
      scopeLabel: 'L₀ — the only sum you can make from nothing',
      aux: { L: chips() },
    },
    `Target ${t}, and ${n} numbers. δ = ε/2n = ${delta.toFixed(3)}, so sums within ${(delta * 100).toFixed(1)}% merge.`,
  );

  for (let i = 1; i <= n; i++) {
    const xi = x[i - 1]!;

    // Line 4: MERGE-LISTS(L, L + xᵢ), kept sorted and free of duplicates.
    const grown = [...new Set([...list, ...list.map((v) => v + xi)])].sort((a, b) => a - b);
    const fresh = grown.filter((v) => !list.includes(v));
    stats.writes += fresh.length;

    emit(
      'APPROX-SUBSET-SUM',
      4,
      snapshot(grown),
      {
        done: settled(i - 1),
        mark: xid(i),
        move: fresh.map(sid),
        scope: grown.map(sid),
        scopeLabel: `L${i} before trimming — ${grown.length} sums`,
        aux: { L: chips(grown.length) },
      },
      `Add ${xi} to every sum in L: ${fresh.length} new ones, taking the list from ${list.length} to ${grown.length}.`,
    );

    // TRIM: keep a sum only when it beats the last one kept by more than 1+δ.
    const kept: number[] = [];
    const dropped: number[] = [];
    let last = -1;
    for (const v of grown) {
      stats.comparisons++;
      if (kept.length === 0 || v > last * (1 + delta)) {
        kept.push(v);
        last = v;
      } else {
        dropped.push(v);
      }
    }

    emit(
      'TRIM',
      5,
      snapshot(grown),
      {
        done: settled(i - 1),
        mark: xid(i),
        look: dropped.map(sid),
        scope: grown.map(sid),
        scopeLabel: `each sum against ${(1 + delta).toFixed(3)} × the one kept before`,
        aux: { L: chips(grown.length) },
      },
      dropped.length === 0
        ? `No two sums are within ${(delta * 100).toFixed(1)}% of each other, so nothing is trimmed.`
        : `${dropped.length} of them sit within ${(delta * 100).toFixed(1)}% of the sum before, so they go — for at most a factor of 1+δ.`,
    );

    // Line 6: anything over t can never come back under it.
    const over = kept.filter((v) => v > t);
    list = kept.filter((v) => v <= t);

    emit(
      'APPROX-SUBSET-SUM',
      6,
      snapshot(list),
      {
        done: settled(i),
        move: list.filter((v) => fresh.includes(v)).map(sid),
        scope: list.map(sid),
        scopeLabel: `L${i} — ${list.length} sums`,
        aux: { L: chips() },
      },
      over.length === 0
        ? `Nothing exceeds ${t}. L${i} has ${list.length} sums, where the exact list would have ${2 ** i}.`
        : `${over.length} ${over.length === 1 ? 'sum' : 'sums'} over ${t}, gone for good. L${i} holds ${list.length}.`,
    );
  }

  const answer = list[list.length - 1]!;
  emit(
    'APPROX-SUBSET-SUM',
    8,
    snapshot(list),
    {
      done: settled(n),
      mark: sid(answer),
      scope: list.map(sid),
      scopeLabel: `L${n} — every candidate that survived`,
      aux: { L: chips() },
      answer,
    },
    `z* = ${answer}, the largest sum that survived. It is within ${(EPSILON * 100).toFixed(0)}% of the true best.`,
  );

  return { steps, output: { answer, kept: list.length } };
}

/**
 * Theorem 35.8, checked on every generated input.
 *
 * Three claims, and the third is the one the section exists for. Every sum
 * left in L is really reachable by some subset — trimming may throw away good
 * answers but must never invent one. Nothing exceeds t. And z* is at least
 * (1 − ε) times the true optimum, which is computed here by enumerating all
 * 2ⁿ subsets: the exact algorithm this one exists to avoid, run beside it to
 * hold it to account.
 */
function verify(input: number[], trace: Trace): string | null {
  const t = input[0]!;
  const x = input.slice(1);
  const n = x.length;
  const hi = trace.steps.at(-1)!.hi as { answer?: number };
  if (hi.answer === undefined) return 'the run returned no answer';

  // Every sum any subset can make, exactly. 2ⁿ of them, which is the point.
  const reachable = new Set<number>([0]);
  let optimum = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += x[i]!;
    reachable.add(sum);
    if (sum <= t && sum > optimum) optimum = sum;
  }

  const last = trace.steps.at(-1)!.data;
  if (last?.kind !== 'cells') return 'the last step carries no list';
  const shown = last.rows[0]!.cells.map((cell) => Number(cell.value));
  for (const v of shown) {
    if (!reachable.has(v)) return `L ends holding ${v}, which no subset of S adds up to`;
    if (v > t) return `L ends holding ${v}, which is over the target of ${t}`;
  }
  if (!shown.includes(hi.answer)) return `z* = ${hi.answer} is not in the list it came from`;

  if (hi.answer > optimum) {
    return `z* = ${hi.answer} beats the true optimum of ${optimum} — impossible`;
  }
  if (hi.answer < (1 - EPSILON) * optimum) {
    return `z* = ${hi.answer} against a true optimum of ${optimum} — outside the (1 − ε) guarantee`;
  }
  return null;
}

/**
 * Numbers around a couple of magnitudes, and a target that has to be searched
 * for.
 *
 * The shape follows the book's own example, ⟨104, 102, 201, 101⟩ with t = 308:
 * several numbers near one size and one near twice it. That is not decoration.
 * Numbers drawn uniformly give sums too spread out for a δ of a few percent to
 * touch, and TRIM — the entire idea of the section — then does nothing on
 * screen. Clustered magnitudes make sums collide, which is what there is to
 * see.
 *
 * n stops at 5 for two reasons that happen to agree: the `verify` enumerates
 * all 2ⁿ subsets, and L is a single row of boxes that has to stay legible.
 */
function generate(nRequested: number): number[] {
  const n = Math.max(3, Math.min(nRequested, 5));
  const x = Array.from({ length: n }, () => {
    const base = Math.random() < 0.72 ? 100 : 200;
    return base + Math.floor(Math.random() * 16);
  });
  const total = x.reduce((a, b) => a + b, 0);
  const t = Math.round(total * (0.42 + Math.random() * 0.16));
  return [t, ...x];
}

function parse(text: string): ParsedInput {
  const parts = text.split(/[;:]/);
  if (parts.length !== 2) {
    return { error: 'Give the target, a semicolon, then the numbers: 308; 104, 102, 201, 101.' };
  }
  const t = Number(parts[0]!.trim());
  if (!Number.isInteger(t) || t < 1 || t > 2000) {
    return { error: `"${parts[0]!.trim()}" is not a target — give a whole number from 1 to 2000.` };
  }
  const values: number[] = [];
  for (const part of parts[1]!.split(/[,\s]+/).filter((s) => s.trim().length > 0)) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 1 || v > 999) {
      return { error: `"${part}" is not one of the numbers — they run from 1 to 999.` };
    }
    values.push(v);
  }
  if (values.length < 3) return { error: 'Give at least three numbers.' };
  if (values.length > 6)
    return { error: 'At most six numbers — the exact optimum is found by brute force.' };
  return { value: [t, ...values] };
}

export const approxSubsetSum: AlgorithmModule = {
  id: 'approx-subset-sum',
  name: 'Approximate Subset Sum',
  visualizer: 'cells',
  aux: [{ key: 'L', label: 'length', hint: 'how long the list of sums has got — the whole story' }],
  procOrder: ['APPROX-SUBSET-SUM', 'TRIM'],
  procedures: {
    'APPROX-SUBSET-SUM': {
      title: 'APPROX-SUBSET-SUM(S, t, ε)',
      indent: [0, 0, 0, 1, 1, 1, 0, 0],
      lines: [
        'n = |S|',
        'L₀ = ⟨0⟩',
        'for i = 1 to n',
        'Lᵢ = MERGE-LISTS(Lᵢ₋₁, Lᵢ₋₁ + xᵢ)',
        'Lᵢ = TRIM(Lᵢ, ε/2n)',
        'remove from Lᵢ every element that is greater than t',
        'let z* be the largest value in Lₙ',
        'return z*',
      ],
    },
    TRIM: {
      title: 'TRIM(L, δ)',
      indent: [0, 0, 0, 0, 1, 2, 2, 0],
      lines: [
        'let m be the length of L',
        'L′ = ⟨y₁⟩',
        'last = y₁',
        'for i = 2 to m',
        'if yᵢ > last · (1 + δ)',
        'append yᵢ onto the end of L′',
        'last = yᵢ',
        'return L′',
      ],
    },
  },
  complexity: {
    best: 'O(n² ln t / ε)',
    average: 'O(n² ln t / ε)',
    worst: 'O(n² ln t / ε)',
    space: 'O(n ln t / ε)',
    extra: [
      ['What kind of scheme', 'fully polynomial — in n and in 1/ε'],
      ['The guarantee', 'z* ≥ (1 − ε) · OPT, for whatever ε you ask for'],
      [
        'ε used here',
        `${EPSILON}, so the answer is within ${(EPSILON * 100).toFixed(0)}% of the best`,
      ],
      ['Halving ε', 'doubles the list, and so doubles the work'],
      ['Without TRIM', 'the list is 2ⁿ long and the algorithm is exact'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 5,
    noun: 'instance',
    placeholder: '308; 104, 102, 201, 101',
    note: 'target, then the numbers; ε is fixed at 0.4',
    label: 'The target t, a semicolon, then the numbers of S',
    generate,
    parse,
    size: (value: number[]) => value.length - 1,
  },
  defaultSize: 5,
  result: { kind: 'transforms', verify },
  record,
};
