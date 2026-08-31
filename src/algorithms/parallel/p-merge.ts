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
 * P-MERGE — CLRS §26.3.
 *
 * Merge sort parallelises badly, and it is worth being precise about why.
 * Spawning the two recursive sorts is easy, but `MERGE` itself is a
 * left-to-right scan: every step depends on the one before it, so its span is
 * Θ(n) and the whole sort is stuck at Θ(n) span no matter how many processors
 * you have. Parallelism Θ(lg n). Hardly worth the trouble.
 *
 * So §26.3 replaces the merge. And the replacement is genuinely surprising,
 * because merging two sorted lists does not look divisible at all.
 *
 * **Take the median of the longer run.** Binary-search for it in the other
 * run. That single comparison splits *both* runs at once: everything to the
 * left of both split points is smaller than the median, everything to the
 * right is larger. So the median's final position is known immediately — it
 * is the number of elements below it, which is now counted — and the two
 * remaining pieces are two smaller merges that share nothing and can be done
 * in parallel.
 *
 * **The bracket over A is the subproblem, and its width is what shrinks.**
 * Every call owns a contiguous slice of the output and fills it without ever
 * consulting another call; that non-overlap is the whole licence to run them
 * at the same time. Watch the bracket halve and halve again.
 *
 * Why the median of the *longer* run, and not either? Because that is what
 * bounds the shrinkage. The longer run has at least half the elements, so
 * splitting it in the middle leaves each side with at most **3/4** of what the
 * call started with — even in the worst case, where the binary search puts
 * every element of the shorter run on one side. Depth Θ(lg n), span Θ(lg² n),
 * and merge sort as a whole gets to Θ(lg³ n) span and Θ(n/lg² n) parallelism.
 * The player's `verify` asserts that 3/4 on every recursive call rather than
 * quoting it.
 */

const tid = (i: number): string => `t${i}`;
const aid = (i: number): string => `a${i}`;

/**
 * BINARY-SEARCH as §26.3 defines it: the smallest q in p‥r+1 with x ≤ T[q],
 * treating T[r+1] as ∞. The +1 is what lets it answer "past the end", which
 * is the ordinary case when the median is bigger than everything else.
 */
function binarySearch(x: number, T: Array<number | null>, p: number, r: number): number {
  let lo = p;
  let hi = Math.max(p, r + 1);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (x <= (T[mid] as number)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function record(input: number[]): Trace {
  const n1Initial = input[0]!;
  const values = input.slice(1);
  const n = values.length;
  /** 1-indexed, like every array in the book. */
  const T: Array<number | null> = [null, ...values];
  const A: Array<number | null> = [null, ...new Array<number | null>(n).fill(null)];

  const { steps, stats, emit } = createRecorder();
  /** Every recursive call's size, for the verify to test the 3/4 bound on. */
  const calls: Array<{ parent: number; child: number }> = [];

  function snapshot(): CellsData {
    return {
      kind: 'cells',
      // A carries the bracket, so A is the first row: the cells renderer draws
      // a scope caption in the gap above its row, and only the first row has a
      // band reserved for it.
      rows: [
        {
          label: 'A',
          cells: Array.from({ length: n }, (_, i): Cell => ({ id: aid(i + 1), value: A[i + 1]! })),
        },
        {
          label: 'T',
          cells: Array.from({ length: n }, (_, i): Cell => ({ id: tid(i + 1), value: T[i + 1]! })),
        },
      ],
    };
  }

  /** Which T slots have been placed. Not the same indices as A's filled ones. */
  const taken = new Set<number>();
  const written = (): string[] => {
    const out: string[] = [];
    for (let i = 1; i <= n; i++) {
      if (A[i] !== null) out.push(aid(i));
      if (taken.has(i)) out.push(tid(i));
    }
    return out;
  };

  const range = (lo: number, hi: number, id: (i: number) => string): string[] =>
    hi < lo ? [] : Array.from({ length: hi - lo + 1 }, (_, k) => id(lo + k));

  const chips = (a: number | null, b: number | null, d: number | null) =>
    auxOf([null, a, b, d], undefined, [null, 'n₁', 'n₂', 'depth']);

  emit(
    'P-MERGE',
    1,
    snapshot(),
    {
      scope: range(1, n, aid),
      scopeLabel: `one call owns all ${n} slots of A`,
      look: range(1, n, tid),
      aux: { n: chips(n1Initial, n - n1Initial, 0) },
    },
    `Two sorted runs of ${n1Initial} and ${n - n1Initial}, and one output. No scan: this divides.`,
  );

  (function merge(p1: number, r1: number, p2: number, r2: number, p3: number, depth: number): void {
    let n1 = r1 - p1 + 1;
    let n2 = r2 - p2 + 1;
    // Lines 3–6: the longer run is always the one that gets halved, and that
    // is the only reason the 3/4 bound holds.
    if (n1 < n2) {
      [p1, p2] = [p2, p1];
      [r1, r2] = [r2, r1];
      [n1, n2] = [n2, n1];
    }
    if (n1 === 0) return;

    const q1 = Math.floor((p1 + r1) / 2);
    const median = T[q1] as number;
    stats.comparisons++;

    emit(
      'P-MERGE',
      9,
      snapshot(),
      {
        done: written(),
        scope: range(p3, p3 + n1 + n2 - 1, aid),
        scopeLabel: `this call owns ${n1 + n2} slot${n1 + n2 === 1 ? '' : 's'} of A`,
        look: [...range(p1, r1, tid), ...range(p2, r2, tid)],
        mark: tid(q1),
        aux: { n: chips(n1, n2, depth) },
      },
      n2 === 0
        ? `Only one run left, ${n1} long. Its middle element is ${median}.`
        : `The longer run has ${n1}; its middle is ${median}. That one choice will split both runs.`,
    );

    const q2 = binarySearch(median, T, p2, r2);
    stats.comparisons += Math.ceil(Math.log2(Math.max(2, n2 + 1)));

    emit(
      'P-MERGE',
      10,
      snapshot(),
      {
        done: written(),
        scope: range(p3, p3 + n1 + n2 - 1, aid),
        scopeLabel: `this call owns ${n1 + n2} slot${n1 + n2 === 1 ? '' : 's'} of A`,
        look: range(p2, r2, tid),
        mark: tid(q1),
        // Only when it lands inside the run: q2 may be r₂ + 1, which is past
        // the last cell, and a marker clamped to r₂ would name the wrong one.
        ...(q2 <= r2 ? { pointers: { q2: tid(q2) } } : {}),
        aux: { n: chips(n1, n2, depth) },
      },
      n2 === 0
        ? `Nothing left to search against, so ${median} keeps its place: no element can come between.`
        : `Binary search finds ${q2 - p2} of the other run below ${median}, and ${r2 - q2 + 1} above.`,
    );

    const q3 = p3 + (q1 - p1) + (q2 - p2);
    A[q3] = median;
    taken.add(q1);
    stats.writes++;

    const leftSize = q1 - p1 + (q2 - p2);
    const rightSize = r1 - q1 + (r2 - q2 + 1);
    calls.push({ parent: n1 + n2, child: leftSize });
    calls.push({ parent: n1 + n2, child: rightSize });

    emit(
      'P-MERGE',
      12,
      snapshot(),
      {
        done: written().filter((id) => id !== aid(q3) && id !== tid(q1)),
        scope: range(p3, p3 + n1 + n2 - 1, aid),
        scopeLabel: `this call owns ${n1 + n2} slot${n1 + n2 === 1 ? '' : 's'} of A`,
        move: [aid(q3), tid(q1)],
        pointers: { q3: aid(q3) },
        aux: { n: chips(n1, n2, depth) },
      },
      `${median} is settled: exactly ${q3 - 1} elements are below it. The two sides, ${leftSize} and ${rightSize}, are independent.`,
    );

    merge(p1, q1 - 1, p2, q2 - 1, p3, depth + 1);
    merge(q1 + 1, r1, q2, r2, q3 + 1, depth + 1);
  })(1, n1Initial, n1Initial + 1, n, 1, 1);

  emit(
    'P-MERGE',
    15,
    snapshot(),
    {
      done: written(),
      scope: range(1, n, aid),
      scopeLabel: 'every slot filled, and no two calls touched the same one',
      aux: { n: chips(null, null, null) },
      merged: A.slice(1) as number[],
      calls: calls.map((c) => ({ ...c })),
    },
    `Merged. Every element was placed by exactly one call, which is why they could all run at once.`,
  );

  return { steps, output: { n, calls: calls.length } };
}

/**
 * The merge, and then the bound that makes it worth doing.
 *
 * That A comes out sorted and holding exactly what T held is the easy half.
 * The half that matters is §26.3's **3/4 claim**: because the median comes
 * from the *longer* run, no recursive call gets more than three quarters of
 * what its parent had. That is what makes the recursion Θ(lg n) deep and the
 * span polylogarithmic, and it is asserted here on every call the run made —
 * a version that halved the wrong run would still merge correctly and would
 * quietly have a linear span.
 */
function verify(input: number[], trace: Trace): string | null {
  const n1 = input[0]!;
  const values = input.slice(1);
  const hi = trace.steps.at(-1)!.hi as {
    merged?: number[];
    calls?: Array<{ parent: number; child: number }>;
  };
  if (!hi.merged || !hi.calls) return 'the run returned no merged array';

  const run1 = values.slice(0, n1);
  const run2 = values.slice(n1);
  for (const [name, run] of [
    ['first', run1],
    ['second', run2],
  ] as const) {
    for (let i = 1; i < run.length; i++) {
      if (run[i - 1]! > run[i]!) return `the ${name} run was not sorted to begin with`;
    }
  }

  for (let i = 1; i < hi.merged.length; i++) {
    if (hi.merged[i - 1]! > hi.merged[i]!) {
      return `A is not sorted: ${hi.merged[i - 1]} comes before ${hi.merged[i]}`;
    }
  }
  const sortedIn = [...values].sort((a, b) => a - b);
  if (JSON.stringify(sortedIn) !== JSON.stringify([...hi.merged].sort((a, b) => a - b))) {
    return 'A does not hold exactly the elements T held';
  }

  for (const { parent, child } of hi.calls) {
    if (child > (3 * parent) / 4) {
      return `a call of ${parent} produced a subcall of ${child}, over the 3/4 the median of the longer run guarantees`;
    }
  }
  return null;
}

/**
 * Two runs that genuinely interleave.
 *
 * Splitting a sorted array in half would make two runs whose values do not
 * overlap at all, and the merge would be a concatenation — every binary search
 * landing at one end, and nothing to see. So the values are dealt out at
 * random between the runs and each is sorted afterwards.
 */
function generate(nRequested: number): number[] {
  const n = Math.max(4, Math.min(nRequested, 12));
  const pool = new Set<number>();
  while (pool.size < n) pool.add(2 + Math.floor(Math.random() * 96));
  const values = [...pool];

  const run1: number[] = [];
  const run2: number[] = [];
  for (const v of values) (Math.random() < 0.5 ? run1 : run2).push(v);
  // Both runs must be non-empty, or there is nothing being merged.
  if (run1.length === 0) run1.push(run2.pop()!);
  if (run2.length === 0) run2.push(run1.pop()!);
  run1.sort((a, b) => a - b);
  run2.sort((a, b) => a - b);
  return [run1.length, ...run1, ...run2];
}

function parse(text: string): ParsedInput {
  const halves = text.split(/[;|]/);
  if (halves.length !== 2) {
    return { error: 'Give two sorted runs separated by a semicolon: 3, 7, 12; 1, 5, 9.' };
  }
  const runs: number[][] = [];
  for (const half of halves) {
    const run: number[] = [];
    for (const part of half.split(/[,\s]+/).filter((s) => s.trim().length > 0)) {
      const v = Number(part);
      if (!Number.isInteger(v) || v < 1 || v > 99) {
        return { error: `"${part}" is not a whole number between 1 and 99.` };
      }
      run.push(v);
    }
    if (run.length === 0) return { error: 'Both runs must hold at least one number.' };
    for (let i = 1; i < run.length; i++) {
      if (run[i - 1]! > run[i]!) {
        return { error: `${run.join(', ')} is not sorted — P-MERGE is given two sorted runs.` };
      }
    }
    runs.push(run);
  }
  const total = runs[0]!.length + runs[1]!.length;
  if (total < 4) return { error: 'Give at least four numbers between the two runs.' };
  if (total > 14) return { error: 'At most fourteen — the rows stop fitting.' };
  return { value: [runs[0]!.length, ...runs[0]!, ...runs[1]!] };
}

export const pMerge: AlgorithmModule = {
  id: 'p-merge',
  name: 'Parallel Merge',
  visualizer: 'cells',
  aux: [{ key: 'n', label: 'call', hint: 'the two run lengths, and how deep the recursion is' }],
  procOrder: ['P-MERGE'],
  procedures: {
    'P-MERGE': {
      title: 'P-MERGE(T, p₁, r₁, p₂, r₂, A, p₃)',
      indent: [0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1],
      lines: [
        'n₁ = r₁ − p₁ + 1',
        'n₂ = r₂ − p₂ + 1',
        'if n₁ < n₂   // ensure that n₁ ≥ n₂',
        'exchange p₁ with p₂',
        'exchange r₁ with r₂',
        'exchange n₁ with n₂',
        'if n₁ == 0   // both empty?',
        'return',
        'else q₁ = ⌊(p₁ + r₁)/2⌋',
        'q₂ = BINARY-SEARCH(T[q₁], T, p₂, r₂)',
        'q₃ = p₃ + (q₁ − p₁) + (q₂ − p₂)',
        'A[q₃] = T[q₁]',
        'spawn P-MERGE(T, p₁, q₁ − 1, p₂, q₂ − 1, A, p₃)',
        'P-MERGE(T, q₁ + 1, r₁, q₂, r₂, A, q₃ + 1)',
        'sync',
      ],
    },
  },
  complexity: {
    best: 'T₁ = Θ(n)',
    average: 'T₁ = Θ(n)',
    worst: 'T₁ = Θ(n)',
    space: 'Θ(n) for the output',
    extra: [
      ['Span', 'T∞ = Θ(lg² n), against Θ(n) for an ordinary MERGE'],
      ['Why 3/4', 'the median comes from the longer run, which holds at least half'],
      ['Inside P-MERGE-SORT', 'span Θ(lg³ n), parallelism Θ(n/lg² n)'],
      ['With a serial MERGE', 'span Θ(n), and parallelism only Θ(lg n)'],
      ['What makes it safe', 'each call owns a disjoint slice of the output'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'pair of runs',
    placeholder: '3, 7, 12; 1, 5, 9, 14',
    note: 'two sorted runs, separated by a semicolon',
    label: 'Two sorted runs of numbers, separated by a semicolon',
    generate,
    parse,
    size: (value: number[]) => value.length - 1,
  },
  defaultSize: 9,
  result: { kind: 'transforms', verify },
  record,
};
