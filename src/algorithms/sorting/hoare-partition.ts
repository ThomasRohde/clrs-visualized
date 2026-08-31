import { auxOf, createRecorder, type AlgorithmModule, type Step, type Trace } from '../types.ts';

/**
 * HOARE-PARTITION and QUICKSORT′ — CLRS Problem 7-1.
 *
 * The partition Hoare published in 1961, which is what quicksort was
 * originally written with; §7.1's Lomuto scheme is the one the book teaches
 * because it is easier to reason about. Two pointers start outside the
 * subarray and walk towards each other, exchanging the pairs they find on the
 * wrong side, until they cross.
 *
 * **The one thing to notice is the recursion, and it is why this is a separate
 * player rather than a footnote.** Lomuto's PARTITION *places* the pivot: the
 * element at the returned index q is in its final position for the rest of the
 * run, so §7.1's QUICKSORT recurses on `(p, q-1)` and `(q+1, r)` and leaves it
 * out of both. Hoare's returns a **split point**, not a placed element — A[j]
 * is merely somewhere in the left part — so QUICKSORT′ recurses on `(p, q)`,
 * with q *included*. Writing `q-1` there is the classic way to break it, and
 * the array comes back almost sorted, which is the worst kind of wrong.
 *
 * That is also why nothing here is ever painted as settled until the whole run
 * finishes. There is no step at which this algorithm knows an element is home.
 *
 * **The pivot value lives in the aux row, not on a bar.** `x` is A[p] read
 * once at the start, and the first exchange can move whatever is at p, so a
 * marker on that position would name the wrong element for most of the call.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PQ = 'QUICKSORT′';
  const PH = 'HOARE-PARTITION';

  function hoarePartition(p: number, r: number): number {
    const x = A[p] as number;
    const held = () => ({ x: auxOf([null, x], 1) });
    const band = { range: [p, r] };

    emit(
      PH,
      1,
      A,
      { ...band, aux: held() },
      `x = A[${p}] = ${x} — the pivot value, taken from the front and held in a variable.`,
    );

    let i = p - 1;
    emit(PH, 2, A, { ...band, aux: held(), i }, `i = ${p} − 1 = ${i}, just outside the left end.`);
    let j = r + 1;
    emit(
      PH,
      3,
      A,
      { ...band, aux: held(), i, j },
      `j = ${r} + 1 = ${j}, just outside the right end.`,
    );

    for (;;) {
      emit(PH, 4, A, { ...band, aux: held(), i, j }, `Walk the two pointers towards each other.`);

      // repeat j = j - 1 until A[j] ≤ x
      for (;;) {
        j--;
        emit(PH, 6, A, { ...band, aux: held(), i, j }, `j = ${j}.`);
        stats.comparisons++;
        const stop = (A[j] as number) <= x;
        emit(
          PH,
          7,
          A,
          { ...band, aux: held(), i, j, compare: [j] },
          stop
            ? `A[${j}] = ${A[j]} ≤ x = ${x}: j stops here.`
            : `A[${j}] = ${A[j]} > x = ${x}: it belongs on the right, keep moving j left.`,
        );
        if (stop) break;
      }

      // repeat i = i + 1 until A[i] ≥ x
      for (;;) {
        i++;
        emit(PH, 9, A, { ...band, aux: held(), i, j }, `i = ${i}.`);
        stats.comparisons++;
        const stop = (A[i] as number) >= x;
        emit(
          PH,
          10,
          A,
          { ...band, aux: held(), i, j, compare: [i] },
          stop
            ? `A[${i}] = ${A[i]} ≥ x = ${x}: i stops here.`
            : `A[${i}] = ${A[i]} < x = ${x}: it belongs on the left, keep moving i right.`,
        );
        if (stop) break;
      }

      stats.comparisons++;
      emit(
        PH,
        11,
        A,
        { ...band, aux: held(), i, j, compare: [i, j] },
        i < j
          ? `i = ${i} < j = ${j}: the pointers have not met, so these two are on the wrong sides.`
          : `i = ${i} is not less than j = ${j}: the pointers have crossed.`,
      );

      if (i < j) {
        const tmp = A[i];
        A[i] = A[j];
        A[j] = tmp;
        stats.swaps++;
        emit(
          PH,
          12,
          A,
          { ...band, aux: held(), i, j, swap: [i, j] },
          `Exchange A[${i}] and A[${j}] — each moves to the side it belongs on.`,
        );
        continue;
      }

      emit(
        PH,
        13,
        A,
        { ...band, aux: held(), pivot: j },
        `Return ${j}. Everything in A[${p}‥${j}] is at most everything in A[${j + 1}‥${r}] — but ` +
          `A[${j}] = ${A[j]} is not necessarily where it finally belongs.`,
      );
      return j;
    }
  }

  function quicksort(p: number, r: number): void {
    emit(PQ, 1, A, { range: [p, r] }, `QUICKSORT′(A, ${p}, ${r}): is ${p} < ${r}?`);
    if (p >= r) {
      emit(
        PQ,
        1,
        A,
        { range: [p, r], base: true },
        `Base case: A[${p}‥${r}] has at most one element.`,
      );
      return;
    }

    const q = hoarePartition(p, r);
    emit(
      PQ,
      2,
      A,
      { range: [p, r], pivot: q },
      `q = HOARE-PARTITION(A, ${p}, ${r}) = ${q} — a split point, not a placed element.`,
    );
    emit(
      PQ,
      3,
      A,
      { range: [p, q] },
      `Recurse left on A[${p}‥${q}] — note that ${q} is included, unlike §7.1's quicksort.`,
    );
    quicksort(p, q);
    emit(PQ, 4, A, { range: [q + 1, r] }, `Recurse right on A[${q + 1}‥${r}].`);
    quicksort(q + 1, r);
  }

  if (n > 0) quicksort(1, n);
  emit(PQ, 1, A, { range: [1, n], done: true }, `Done — A[1‥${n}] is sorted.`);
  return { steps, finalArray: A.slice(1) as number[] };
}

export const hoarePartition: AlgorithmModule = {
  id: 'hoare-partition',
  name: "Hoare's Partition",
  visualizer: 'array-bars',
  aux: [{ key: 'x', label: 'x', hint: 'the pivot value, read once from A[p]' }],
  procOrder: ['QUICKSORT′', 'HOARE-PARTITION'],
  procedures: {
    'QUICKSORT′': {
      title: 'QUICKSORT′(A, p, r)',
      indent: [0, 1, 1, 1],
      lines: [
        'if p < r',
        'q = HOARE-PARTITION(A, p, r)',
        'QUICKSORT′(A, p, q)',
        'QUICKSORT′(A, q+1, r)',
      ],
    },
    'HOARE-PARTITION': {
      title: 'HOARE-PARTITION(A, p, r)',
      indent: [0, 0, 0, 0, 1, 2, 1, 1, 2, 1, 1, 2, 2],
      lines: [
        'x = A[p]',
        'i = p - 1',
        'j = r + 1',
        'while TRUE',
        'repeat',
        'j = j - 1',
        'until A[j] ≤ x',
        'repeat',
        'i = i + 1',
        'until A[i] ≥ x',
        'if i < j',
        'exchange A[i] with A[j]',
        'else return j',
      ],
    },
  },
  complexity: {
    best: 'Θ(n log n)',
    average: 'Θ(n log n)',
    worst: 'Θ(n²)',
    space: 'O(log n)',
    stable: 'No',
    inPlace: 'Yes',
    extra: [
      ['Pivot', 'A[p], the first element — and it is not placed'],
      ['Returns', 'a split point q with p ≤ q < r, so QUICKSORT′ recurses on (p, q)'],
      ['Exchanges', 'fewer than Lomuto on the same input — compare the two tapes'],
    ],
  },
  result: {
    kind: 'sorts',
    /**
     * Problem 7-1(b) and (c), checked on every generated input.
     *
     * The sortedness of the answer comes free from `kind: 'sorts'`, and it is
     * not the interesting claim: a partition that returned `r` would still
     * sort, by recursing forever on a subarray that never shrinks, and one
     * that split in the wrong place would be caught only sometimes. The two
     * facts that make QUICKSORT′ correct are read straight off the trace.
     */
    verify(_input: number[], trace: Trace): string | null {
      let partitions = 0;

      for (const step of trace.steps as Step[]) {
        if (step.proc !== 'HOARE-PARTITION' || step.line !== 13) continue;
        const hi = step.hi as { range?: [number, number]; pivot?: number };
        const [p, r] = hi.range!;
        const q = hi.pivot!;
        const A = step.array!;
        partitions++;

        // (b) The bounds. `q = r` is the classic break: QUICKSORT′ would then
        // recurse on the same subarray forever.
        if (!(p <= q && q < r)) {
          return `HOARE-PARTITION(A, ${p}, ${r}) returned ${q}, outside p ≤ q < r`;
        }

        // (c) The split itself: every element at or left of q is at most every
        // element right of it.
        let leftMax = -Infinity;
        for (let k = p; k <= q; k++) leftMax = Math.max(leftMax, A[k] as number);
        let rightMin = Infinity;
        for (let k = q + 1; k <= r; k++) rightMin = Math.min(rightMin, A[k] as number);
        if (leftMax > rightMin) {
          return `HOARE-PARTITION(A, ${p}, ${r}) returned ${q}, but A[${p}‥${q}] holds ${leftMax} and A[${q + 1}‥${r}] holds ${rightMin}`;
        }
      }

      if (partitions === 0 && (trace.finalArray?.length ?? 0) > 1) {
        return 'sorted more than one element without partitioning once';
      }
      return null;
    },
  },
  record,
};
