import { auxOf, createRecorder, fmt, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * COUNT-INVERSIONS — CLRS Problem 2-4(d).
 *
 * An inversion is a pair `i < j` with `A[i] > A[j]`, and the problem's earlier
 * parts establish why anyone cares: insertion sort's running time is Θ(n + I)
 * where I is the number of inversions, so counting them measures exactly how
 * unsorted an array is. Part (d) asks for a Θ(n lg n) count, and the answer is
 * merge sort with one line added.
 *
 * **The pseudocode panel is the teaching here, so MERGE-INVERSIONS is MERGE
 * line for line** — the same eighteen lines in the same order — with two
 * additions: `inversions = 0` before the loop, and one line inside the `else`.
 * A compressed transcription would have been shorter and would have thrown
 * away the only thing the reader is meant to notice.
 *
 * **Why the counted elements are not highlighted in the chart.** When R[j] is
 * taken, the `n1 - i + 1` elements still in L are each greater than it, and
 * every one of them is an inversion with it. They are in the *buffer*, though,
 * not reliably in the array: `A[k]` is being overwritten from `p` upwards, and
 * L[i] sits at `A[p + i - 1]` only while `j = 1`. Marking those positions would
 * be pointing at the wrong bars for most of the merge, so the run is marked in
 * the L row itself, with a caption under each chip that is about to be counted.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PC = 'COUNT-INVERSIONS';
  const PG = 'MERGE-INVERSIONS';

  let total = 0;
  const running = () => ({ inv: auxOf([null, total], 1) });

  function countInversions(p: number, r: number): number {
    emit(
      PC,
      1,
      A,
      { range: [p, r], aux: running() },
      `COUNT-INVERSIONS(A, ${p}, ${r}): start this call's count at 0.`,
    );
    emit(PC, 2, A, { range: [p, r], aux: running() }, `Is ${p} < ${r}?`);
    if (p >= r) {
      emit(
        PC,
        7,
        A,
        { range: [p, r], base: true, aux: running() },
        `Base case: A[${p}‥${r}] has at most one element, so it has no inversions.`,
      );
      return 0;
    }

    const q = Math.floor((p + r) / 2);
    emit(PC, 3, A, { range: [p, r], mid: q, aux: running() }, `q = ⌊(${p}+${r})/2⌋ = ${q}.`);

    emit(
      PC,
      4,
      A,
      { range: [p, q], aux: running() },
      `Count the inversions inside the left half A[${p}‥${q}].`,
    );
    const left = countInversions(p, q);

    emit(
      PC,
      5,
      A,
      { range: [q + 1, r], aux: running() },
      `Count the inversions inside the right half A[${q + 1}‥${r}].`,
    );
    const right = countInversions(q + 1, r);

    emit(
      PC,
      6,
      A,
      { range: [p, r], mid: q, aux: running() },
      `Merge, and count the inversions that cross from the left half to the right.`,
    );
    const crossing = mergeInversions(p, q, r);

    emit(
      PC,
      7,
      A,
      { range: [p, r], merged: true, aux: running() },
      `A[${p}‥${r}] is sorted, and holds ${left + right + crossing} inversion${
        left + right + crossing === 1 ? '' : 's'
      }: ${left} on the left, ${right} on the right, ${crossing} across.`,
    );
    return left + right + crossing;
  }

  function mergeInversions(p: number, q: number, r: number): number {
    const n1 = q - p + 1;
    const n2 = r - q;
    const band = { range: [p, r], mid: q };

    emit(PG, 1, A, { ...band, aux: running() }, `n1 = ${n1}.`);
    emit(PG, 2, A, { ...band, aux: running() }, `n2 = ${n2}.`);

    const L: Array<number> = new Array(n1 + 1);
    const R: Array<number> = new Array(n2 + 1);
    emit(
      PG,
      3,
      A,
      { ...band, aux: running() },
      `Create buffers L[1‥${n1 + 1}] and R[1‥${n2 + 1}].`,
    );

    const buffers = (i?: number, j?: number, counted?: Array<string | null>) => ({
      L: auxOf(L, i, counted),
      R: auxOf(R, j),
      inv: auxOf([null, total], 1),
    });

    for (let i = 1; i <= n1; i++) {
      L[i] = A[p + i - 1] as number;
      emit(
        PG,
        5,
        A,
        { ...band, source: p + i - 1, aux: buffers() },
        `L[${i}] = A[${p + i - 1}] = ${L[i]}.`,
      );
    }
    for (let j = 1; j <= n2; j++) {
      R[j] = A[q + j] as number;
      emit(
        PG,
        7,
        A,
        { ...band, source: q + j, aux: buffers() },
        `R[${j}] = A[${q + j}] = ${R[j]}.`,
      );
    }

    L[n1 + 1] = Infinity;
    R[n2 + 1] = Infinity;
    emit(PG, 8, A, { ...band, aux: buffers() }, `L[${n1 + 1}] = ∞ (sentinel).`);
    emit(PG, 9, A, { ...band, aux: buffers() }, `R[${n2 + 1}] = ∞ (sentinel).`);

    let i = 1;
    let j = 1;
    emit(PG, 10, A, { ...band, aux: buffers(i, j) }, `i = 1.`);
    emit(PG, 11, A, { ...band, aux: buffers(i, j) }, `j = 1.`);

    let crossing = 0;
    emit(
      PG,
      12,
      A,
      { ...band, aux: buffers(i, j) },
      `This merge has counted 0 crossing inversions so far.`,
    );

    for (let k = p; k <= r; k++) {
      stats.comparisons++;
      const takeLeft = L[i]! <= R[j]!;
      emit(
        PG,
        14,
        A,
        { ...band, aux: buffers(i, j) },
        `Compare L[${i}] = ${fmt(L[i])} with R[${j}] = ${fmt(R[j])}.`,
      );

      if (takeLeft) {
        A[k] = L[i]!;
        stats.writes++;
        emit(
          PG,
          15,
          A,
          { ...band, writing: k, aux: buffers(i, j) },
          `A[${k}] = L[${i}] = ${fmt(L[i])}.`,
        );
        i++;
        emit(PG, 16, A, { ...band, aux: buffers(i, j) }, `i = ${i}.`);
        continue;
      }

      // The line the whole problem is about. Every element still in L is
      // greater than R[j] — L is sorted — and each of them sits to R[j]'s left
      // in the original array, so each is an inversion with it. They are
      // counted in one step rather than one at a time, which is the whole of
      // the Θ(n²) → Θ(n lg n) improvement.
      const run = n1 - i + 1;
      // No captions at all when L is already exhausted: an all-null `labels`
      // draws exactly what no `labels` draws, and a snapshot that differs from
      // another only in ways nothing can see is a picture the text alternative
      // is then asked to distinguish.
      let counted: Array<string | null> | undefined;
      if (run > 0) {
        counted = new Array(n1 + 2).fill(null);
        for (let t = i; t <= n1; t++) counted[t] = 'inv';
      }
      crossing += run;
      total += run;
      emit(
        PG,
        18,
        A,
        { ...band, aux: buffers(i, j, counted) },
        run === 0
          ? `L is exhausted, so R[${j}] = ${fmt(R[j])} crosses nothing.`
          : run === 1
            ? `R[${j}] = ${fmt(R[j])} is smaller than L[${i}] = ${fmt(L[i])} — 1 inversion.`
            : `R[${j}] = ${fmt(R[j])} is smaller than every one of L[${i}‥${n1}] — ${run} inversions, counted in one step instead of ${run}.`,
      );

      A[k] = R[j]!;
      stats.writes++;
      emit(
        PG,
        19,
        A,
        { ...band, writing: k, aux: buffers(i, j) },
        `A[${k}] = R[${j}] = ${fmt(R[j])}.`,
      );
      j++;
      emit(PG, 20, A, { ...band, aux: buffers(i, j) }, `j = ${j}.`);
    }

    emit(
      PG,
      21,
      A,
      { ...band, merged: true, aux: buffers() },
      `Return ${crossing}: that is how many inversions crossed the split at ${q}.`,
    );
    return crossing;
  }

  const inversions = n === 0 ? 0 : countInversions(1, n);
  emit(
    PC,
    7,
    A,
    { range: [1, n], done: true, aux: running() },
    `Done — A[1‥${n}] is sorted, and it started with ${inversions} inversion${
      inversions === 1 ? '' : 's'
    }.`,
  );

  return { steps, finalArray: A.slice(1) as number[], output: { inversions, n } };
}

/** Every pair out of order, counted the obvious way — the Θ(n²) definition. */
function inversionsOf(values: number[]): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if (values[i]! > values[j]!) count++;
    }
  }
  return count;
}

export const countInversions: AlgorithmModule = {
  id: 'count-inversions',
  name: 'Counting Inversions',
  visualizer: 'array-bars',
  aux: [
    { key: 'L', label: 'L', hint: 'captioned chips are the run being counted' },
    { key: 'R', label: 'R' },
    { key: 'inv', label: 'inv', hint: 'inversions found so far, across the whole array' },
  ],
  procOrder: ['COUNT-INVERSIONS', 'MERGE-INVERSIONS'],
  procedures: {
    'COUNT-INVERSIONS': {
      title: 'COUNT-INVERSIONS(A, p, r)',
      indent: [0, 0, 1, 1, 1, 1, 0],
      lines: [
        'inversions = 0',
        'if p < r',
        'q = ⌊(p+r)/2⌋',
        'inversions = inversions + COUNT-INVERSIONS(A, p, q)',
        'inversions = inversions + COUNT-INVERSIONS(A, q+1, r)',
        'inversions = inversions + MERGE-INVERSIONS(A, p, q, r)',
        'return inversions',
      ],
    },
    'MERGE-INVERSIONS': {
      title: 'MERGE-INVERSIONS(A, p, q, r)',
      indent: [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1, 2, 2, 2, 0],
      lines: [
        'n1 = q - p + 1',
        'n2 = r - q',
        'let L[1‥n1+1] and R[1‥n2+1] be new arrays',
        'for i = 1 to n1',
        'L[i] = A[p+i-1]',
        'for j = 1 to n2',
        'R[j] = A[q+j]',
        'L[n1+1] = ∞',
        'R[n2+1] = ∞',
        'i = 1',
        'j = 1',
        'inversions = 0',
        'for k = p to r',
        'if L[i] ≤ R[j]',
        'A[k] = L[i]',
        'i = i + 1',
        'else',
        'inversions = inversions + (n1 - i + 1)',
        'A[k] = R[j]',
        'j = j + 1',
        'return inversions',
      ],
    },
  },
  complexity: {
    best: 'Θ(n log n)',
    average: 'Θ(n log n)',
    worst: 'Θ(n log n)',
    space: 'Θ(n)',
    stable: 'Yes',
    inPlace: 'No',
    extra: [
      ['Counts', 'pairs i < j with A[i] > A[j]'],
      ['Most possible', 'n(n−1)/2 — a strictly decreasing array'],
      ['Insertion sort', 'Θ(n + inversions), which is what makes this worth measuring'],
    ],
  },
  result: {
    // It sorts, exactly as merge sort does — but sorting is the side effect
    // here and the count is the answer, so the count is what verify checks,
    // against the Θ(n²) definition rather than against a second clever route.
    kind: 'sorts',
    verify(input: number[], trace: Trace): string | null {
      const expected = inversionsOf(input);
      const reported = trace.output?.inversions ?? -1;
      if (reported !== expected) {
        return `reported ${reported} inversions, but the definition gives ${expected}`;
      }
      const most = (input.length * (input.length - 1)) / 2;
      if (reported > most)
        return `reported ${reported} inversions, above the n(n−1)/2 = ${most} maximum`;
      return null;
    },
  },
  record,
};
