import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * HEAPSORT, BUILD-MAX-HEAP and MAX-HEAPIFY — CLRS §6.1–6.4.
 *
 * `hi.heapSize` is recorded on every step so the visualizer can always draw
 * the boundary between the live heap and the sorted tail, including during
 * the nested MAX-HEAPIFY recursion.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PH = 'HEAPSORT';
  const PB = 'BUILD-MAX-HEAP';
  const PX = 'MAX-HEAPIFY';
  let heapSize = 0;

  const left = (i: number) => 2 * i;
  const right = (i: number) => 2 * i + 1;

  function maxHeapify(i: number): void {
    const l = left(i);
    const r = right(i);
    emit(PX, 1, A, { i, l, r, heapSize }, `l = LEFT(${i}) = ${l}.`);
    emit(PX, 2, A, { i, l, r, heapSize }, `r = RIGHT(${i}) = ${r}.`);

    let largest: number;
    if (l <= heapSize) {
      stats.comparisons++;
      if ((A[l] as number) > (A[i] as number)) {
        largest = l;
        emit(
          PX,
          4,
          A,
          { i, l, r, heapSize, largest, compare: [l, i] },
          `A[${l}] = ${A[l]} > A[${i}] = ${A[i]}, so largest = ${l}.`,
        );
      } else {
        largest = i;
        emit(
          PX,
          5,
          A,
          { i, l, r, heapSize, largest, compare: [l, i] },
          `A[${l}] = ${A[l]} ≤ A[${i}] = ${A[i]}, so largest = ${i}.`,
        );
      }
    } else {
      largest = i;
      emit(PX, 5, A, { i, l, r, heapSize, largest }, `No left child in heap, largest = ${i}.`);
    }

    if (r <= heapSize) {
      stats.comparisons++;
      if ((A[r] as number) > (A[largest] as number)) {
        emit(
          PX,
          7,
          A,
          { i, l, r, heapSize, largest: r, compare: [r, largest] },
          `A[${r}] = ${A[r]} > A[${largest}], so largest = ${r}.`,
        );
        largest = r;
      } else {
        emit(
          PX,
          6,
          A,
          { i, l, r, heapSize, largest, compare: [r, largest] },
          `A[${r}] = ${A[r]} ≤ A[${largest}], largest stays ${largest}.`,
        );
      }
    }

    if (largest !== i) {
      emit(
        PX,
        8,
        A,
        { i, l, r, heapSize, largest },
        `largest (${largest}) ≠ i (${i}), so swap and recurse.`,
      );
      const tmp = A[i];
      A[i] = A[largest];
      A[largest] = tmp;
      stats.swaps++;
      emit(
        PX,
        9,
        A,
        { i, l, r, heapSize, swap: [i, largest] },
        `Exchange A[${i}] and A[${largest}].`,
      );
      emit(PX, 10, A, { i: largest, heapSize }, `MAX-HEAPIFY(A, ${largest}).`);
      maxHeapify(largest);
    } else {
      emit(
        PX,
        8,
        A,
        { i, l, r, heapSize, largest },
        `largest = i, the heap property holds at ${i}.`,
      );
    }
  }

  function buildMaxHeap(): void {
    heapSize = n;
    emit(PB, 1, A, { heapSize }, `heap-size = ${n}.`);
    for (let i = Math.floor(n / 2); i >= 1; i--) {
      emit(PB, 2, A, { heapSize, i }, `for i = ${i} downto 1`);
      emit(PB, 3, A, { heapSize, i }, `MAX-HEAPIFY(A, ${i}).`);
      maxHeapify(i);
    }
  }

  emit(PH, 1, A, {}, `BUILD-MAX-HEAP(A): turn A into a max-heap.`);
  buildMaxHeap();
  emit(PH, 1, A, { heapSize }, `Max-heap built.`);

  for (let i = n; i >= 2; i--) {
    emit(PH, 2, A, { heapSize, sortedFrom: i + 1 }, `for i = ${i} downto 2`);
    const tmp = A[1];
    A[1] = A[i];
    A[i] = tmp;
    stats.swaps++;
    emit(
      PH,
      3,
      A,
      { heapSize, swap: [1, i], sortedFrom: i },
      `Exchange A[1] and A[${i}] — the max goes to its final spot.`,
    );
    heapSize--;
    emit(PH, 4, A, { heapSize, sortedFrom: i }, `heap-size = ${heapSize}.`);
    emit(PH, 5, A, { heapSize, sortedFrom: i }, `MAX-HEAPIFY(A, 1) to restore the heap.`);
    maxHeapify(1);
  }

  emit(PH, 5, A, { heapSize: 1, sortedFrom: 1 }, `Done — A[1..${n}] is sorted.`);
  return { steps, finalArray: A.slice(1) as number[] };
}

export const heapsort: AlgorithmModule = {
  id: 'heapsort',
  name: 'Heapsort',
  visualizer: 'array-bars',
  procOrder: ['HEAPSORT', 'BUILD-MAX-HEAP', 'MAX-HEAPIFY'],
  procedures: {
    HEAPSORT: {
      title: 'HEAPSORT(A)',
      indent: [0, 0, 1, 1, 1],
      lines: [
        'BUILD-MAX-HEAP(A)',
        'for i = A.length downto 2',
        'exchange A[1] with A[i]',
        'heap-size[A] = heap-size[A] - 1',
        'MAX-HEAPIFY(A, 1)',
      ],
    },
    'BUILD-MAX-HEAP': {
      title: 'BUILD-MAX-HEAP(A)',
      indent: [0, 0, 1],
      lines: ['heap-size[A] = A.length', 'for i = ⌊A.length/2⌋ downto 1', 'MAX-HEAPIFY(A, i)'],
    },
    'MAX-HEAPIFY': {
      title: 'MAX-HEAPIFY(A, i)',
      indent: [0, 0, 0, 1, 0, 0, 1, 0, 1, 1],
      lines: [
        'l = LEFT(i)',
        'r = RIGHT(i)',
        'if l ≤ heap-size[A] and A[l] > A[i]',
        'largest = l',
        'else largest = i',
        'if r ≤ heap-size[A] and A[r] > A[largest]',
        'largest = r',
        'if largest ≠ i',
        'exchange A[i] with A[largest]',
        'MAX-HEAPIFY(A, largest)',
      ],
    },
  },
  complexity: {
    best: 'Θ(n log n)',
    average: 'Θ(n log n)',
    worst: 'Θ(n log n)',
    space: 'O(1)',
    stable: 'No',
    inPlace: 'Yes',
  },
  record,
};
