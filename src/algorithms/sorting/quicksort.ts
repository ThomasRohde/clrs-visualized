import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * QUICKSORT and PARTITION — CLRS §7.1, using Lomuto partitioning with the
 * last element as pivot. That choice is what makes the Θ(n²) worst case easy
 * to demonstrate: feed it an already-sorted array and watch the step count.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PQ = 'QUICKSORT';
  const PP = 'PARTITION';

  function partition(p: number, r: number): number {
    const x = A[r] as number;
    emit(PP, 1, A, { range: [p, r], pivot: r }, `x = A[${r}] = ${x} (the pivot).`);
    let i = p - 1;
    emit(PP, 2, A, { range: [p, r], pivot: r, i }, `i = ${p - 1}.`);

    for (let j = p; j <= r - 1; j++) {
      stats.comparisons++;
      emit(
        PP,
        3,
        A,
        { range: [p, r], pivot: r, i, j, compare: [j, r] },
        `for j = ${j} to ${r - 1}`,
      );
      if ((A[j] as number) <= x) {
        i++;
        emit(PP, 5, A, { range: [p, r], pivot: r, i, j }, `A[${j}] = ${A[j]} ≤ x, so i = ${i}.`);
        const tmp = A[i];
        A[i] = A[j];
        A[j] = tmp;
        stats.swaps++;
        emit(
          PP,
          6,
          A,
          { range: [p, r], pivot: r, i, j, swap: [i, j] },
          `Exchange A[${i}] and A[${j}].`,
        );
      } else {
        emit(
          PP,
          4,
          A,
          { range: [p, r], pivot: r, i, j },
          `A[${j}] = ${A[j]} > x, leave it in the tail.`,
        );
      }
    }

    const tmp = A[i + 1];
    A[i + 1] = A[r];
    A[r] = tmp;
    stats.swaps++;
    emit(
      PP,
      7,
      A,
      { range: [p, r], pivot: r, i, swap: [i + 1, r] },
      `Exchange A[${i + 1}] and A[${r}] — pivot settles in place.`,
    );
    emit(PP, 8, A, { range: [p, r], settled: i + 1 }, `return ${i + 1}.`);
    return i + 1;
  }

  function quicksort(p: number, r: number): void {
    emit(PQ, 1, A, { range: [p, r] }, `QUICKSORT(A, ${p}, ${r}): is ${p} < ${r}?`);
    if (p < r) {
      const q = partition(p, r);
      emit(PQ, 2, A, { range: [p, r], settled: q }, `q = PARTITION(A, ${p}, ${r}) = ${q}.`);
      emit(PQ, 3, A, { range: [p, q - 1] }, `Recurse left: QUICKSORT(A, ${p}, ${q - 1}).`);
      quicksort(p, q - 1);
      emit(PQ, 4, A, { range: [q + 1, r] }, `Recurse right: QUICKSORT(A, ${q + 1}, ${r}).`);
      quicksort(q + 1, r);
    } else {
      emit(PQ, 1, A, { range: [p, r], base: true }, `Base case: A[${p}..${r}] has ≤ 1 element.`);
    }
  }

  quicksort(1, n);
  emit(PQ, 1, A, { range: [1, n], done: true }, `Done — A[1..${n}] is sorted.`);
  return { steps, finalArray: A.slice(1) as number[] };
}

export const quicksort: AlgorithmModule = {
  id: 'quicksort',
  name: 'Quicksort',
  visualizer: 'array-bars',
  procOrder: ['QUICKSORT', 'PARTITION'],
  procedures: {
    QUICKSORT: {
      title: 'QUICKSORT(A, p, r)',
      indent: [0, 1, 1, 1],
      lines: ['if p < r', 'q = PARTITION(A, p, r)', 'QUICKSORT(A, p, q-1)', 'QUICKSORT(A, q+1, r)'],
    },
    PARTITION: {
      title: 'PARTITION(A, p, r)',
      indent: [0, 0, 0, 1, 2, 2, 0, 0],
      lines: [
        'x = A[r]',
        'i = p - 1',
        'for j = p to r - 1',
        'if A[j] ≤ x',
        'i = i + 1',
        'exchange A[i] with A[j]',
        'exchange A[i+1] with A[r]',
        'return i + 1',
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
  },
  record,
};
