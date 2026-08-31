import { auxOf, createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * INSERTION-SORT — CLRS §2.1.
 *
 * The array is 1-indexed to match the book: A[0] is an unused dummy slot.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const P = 'INSERTION-SORT';

  emit(P, 1, A, { sortedUpTo: 1 }, `Start: A[1] is trivially sorted.`);

  for (let j = 2; j <= n; j++) {
    emit(P, 1, A, { sortedUpTo: j - 1, j }, `Take the next element, A[${j}] = ${A[j]}.`);
    const key = A[j] as number;
    emit(P, 2, A, { sortedUpTo: j - 1, j, key: j }, `key = A[${j}] = ${key}.`);

    let i = j - 1;
    emit(P, 4, A, { sortedUpTo: j - 1, j, key: j, i }, `i = ${i}.`);

    while (true) {
      stats.comparisons++;
      const cond = i > 0 && (A[i] as number) > key;
      emit(
        P,
        5,
        A,
        { sortedUpTo: j - 1, compare: i > 0 ? [i] : [], aux: { key: auxOf([null, key], 1) }, j, i },
        i > 0
          ? `Compare A[${i}] = ${A[i]} with key = ${key}: ${
              (A[i] as number) > key ? 'greater, shift it right' : 'not greater, stop'
            }.`
          : `Reached the start of the array, stop.`,
      );
      if (!cond) break;

      A[i + 1] = A[i];
      stats.writes++;
      emit(
        P,
        6,
        A,
        { sortedUpTo: j - 1, shift: i + 1, aux: { key: auxOf([null, key], 1) }, j, i },
        `A[${i + 1}] = A[${i}] = ${A[i]}.`,
      );

      i = i - 1;
      emit(P, 7, A, { sortedUpTo: j - 1, aux: { key: auxOf([null, key], 1) }, j, i }, `i = ${i}.`);
    }

    A[i + 1] = key;
    stats.writes++;
    emit(P, 8, A, { sortedUpTo: j, placed: i + 1 }, `Place key: A[${i + 1}] = ${key}.`);
  }

  emit(P, 1, A, { sortedUpTo: n }, `Done — A[1..${n}] is sorted.`);
  return { steps, finalArray: A.slice(1) as number[] };
}

export const insertionSort: AlgorithmModule = {
  id: 'insertion-sort',
  name: 'Insertion Sort',
  visualizer: 'array-bars',
  aux: [{ key: 'key', label: 'key', hint: 'held in a variable, not in the array' }],
  procOrder: ['INSERTION-SORT'],
  procedures: {
    'INSERTION-SORT': {
      title: 'INSERTION-SORT(A)',
      indent: [0, 1, 1, 1, 1, 2, 2, 1],
      lines: [
        'for j = 2 to A.length',
        'key = A[j]',
        '// Insert A[j] into the sorted sequence A[1‥j-1].',
        'i = j - 1',
        'while i > 0 and A[i] > key',
        'A[i+1] = A[i]',
        'i = i - 1',
        'A[i+1] = key',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n²)',
    worst: 'Θ(n²)',
    space: 'O(1)',
    stable: 'Yes',
    inPlace: 'Yes',
  },
  record,
};
