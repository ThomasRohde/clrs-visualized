import { auxOf, createRecorder, fmt, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * The max-priority-queue operations — CLRS §6.5.
 *
 * Heapsort uses a heap and throws it away. §6.5 keeps it: the same array is a
 * queue you can query, drain and refill. There is no single "run" to record,
 * so this module scripts one of each operation over the reader's array —
 * MAXIMUM, EXTRACT-MAX, INCREASE-KEY, INSERT — after building the heap.
 *
 * Everything happens inside the reader's n slots. `heap-size` is what says
 * how much of the array the queue currently owns; extracting parks the
 * departed element in the slot the heap just gave up, and inserting reclaims
 * it. That is also how the renderer draws the boundary.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PB = 'BUILD-MAX-HEAP';
  const PX = 'MAX-HEAPIFY';
  const PM = 'HEAP-MAXIMUM';
  const PE = 'HEAP-EXTRACT-MAX';
  const PI = 'HEAP-INCREASE-KEY';
  const PN = 'MAX-HEAP-INSERT';

  let heapSize = 0;
  const parent = (i: number) => Math.floor(i / 2);
  const left = (i: number) => 2 * i;
  const right = (i: number) => 2 * i + 1;

  /** The one value that is in flight and not in the array. */
  const held = (v: number | null) => ({ key: auxOf([null, v], v === null ? undefined : 1) });

  function maxHeapify(i: number): void {
    const l = left(i);
    const r = right(i);
    emit(PX, 1, A, { i, l, r, heapSize }, `l = LEFT(${i}) = ${l}.`);
    emit(PX, 2, A, { i, l, r, heapSize }, `r = RIGHT(${i}) = ${r}.`);

    let largest = i;
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
        emit(
          PX,
          5,
          A,
          { i, l, r, heapSize, largest, compare: [l, i] },
          `A[${l}] = ${A[l]} ≤ A[${i}] = ${A[i]}, so largest = ${i}.`,
        );
      }
    } else {
      emit(PX, 5, A, { i, l, r, heapSize, largest }, `No left child in the heap, largest = ${i}.`);
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
      emit(PX, 8, A, { i, l, r, heapSize, largest }, `largest (${largest}) ≠ i (${i}) — sink it.`);
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
      emit(PX, 8, A, { i, l, r, heapSize, largest }, `largest = i — the heap property holds here.`);
    }
  }

  function buildMaxHeap(): void {
    heapSize = n;
    emit(PB, 1, A, { heapSize }, `heap-size = ${n}: the whole array is the queue.`);
    for (let i = Math.floor(n / 2); i >= 1; i--) {
      emit(PB, 2, A, { heapSize, i }, `for i = ${i} downto 1`);
      emit(PB, 3, A, { heapSize, i }, `MAX-HEAPIFY(A, ${i}).`);
      maxHeapify(i);
    }
  }

  function heapMaximum(): number {
    const max = A[1] as number;
    emit(
      PM,
      1,
      A,
      { heapSize, node: 1, marks: [1] },
      `return A[1] = ${max}. The largest key is always at the root — one look, no work.`,
    );
    return max;
  }

  function heapExtractMax(): number {
    emit(
      PE,
      1,
      A,
      { heapSize, node: 1 },
      `heap-size = ${heapSize} ≥ 1, so the queue is not empty.`,
    );
    const max = A[1] as number;
    emit(PE, 2, A, { heapSize, node: 1, marks: [1] }, `max = A[1] = ${max}.`);

    // The book writes A[1] = A[heap-size]; exchanging instead loses nothing
    // and parks the departing key in the slot the heap is about to give up,
    // where the reader can still see it.
    const tmp = A[1];
    A[1] = A[heapSize];
    A[heapSize] = tmp;
    stats.swaps++;
    emit(
      PE,
      3,
      A,
      { heapSize, swap: [1, heapSize] },
      `A[1] = A[${heapSize}] — the last leaf moves up to the root, and ${max} steps outside.`,
    );

    heapSize--;
    emit(PE, 4, A, { heapSize }, `heap-size = ${heapSize}: the queue is one shorter.`);
    emit(PE, 5, A, { heapSize, node: 1 }, `MAX-HEAPIFY(A, 1) — the new root has to sink.`);
    if (heapSize >= 1) maxHeapify(1);
    emit(PE, 6, A, { heapSize }, `return ${max}.`);
    return max;
  }

  function heapIncreaseKey(i: number, key: number): void {
    emit(
      PI,
      1,
      A,
      { heapSize, node: i, marks: [i], aux: held(key) },
      `key = ${key} is not smaller than A[${i}] = ${A[i]}, so the raise is legal.`,
    );
    A[i] = key;
    stats.writes++;
    emit(
      PI,
      3,
      A,
      { heapSize, node: i, writing: i, aux: held(key) },
      `A[${i}] = ${key}. It may now be bigger than its parent.`,
    );

    while (i > 1) {
      stats.comparisons++;
      const p = parent(i);
      if ((A[p] as number) >= (A[i] as number)) {
        emit(
          PI,
          4,
          A,
          { heapSize, node: i, parent: p, compare: [p, i], aux: held(key) },
          `A[PARENT(${i})] = ${A[p]} ≥ A[${i}] = ${A[i]} — it has risen far enough.`,
        );
        break;
      }
      emit(
        PI,
        4,
        A,
        { heapSize, node: i, parent: p, compare: [p, i], aux: held(key) },
        `A[PARENT(${i})] = ${A[p]} < A[${i}] = ${A[i]} — keep rising.`,
      );
      const tmp = A[i];
      A[i] = A[p];
      A[p] = tmp;
      stats.swaps++;
      emit(
        PI,
        5,
        A,
        { heapSize, node: i, parent: p, swap: [i, p], aux: held(key) },
        `Exchange A[${i}] with A[${p}].`,
      );
      i = p;
      emit(PI, 6, A, { heapSize, node: i, aux: held(key) }, `i = PARENT(i) = ${i}.`);
    }
  }

  function maxHeapInsert(key: number): void {
    heapSize++;
    emit(
      PN,
      1,
      A,
      { heapSize, node: heapSize, aux: held(key) },
      `heap-size = ${heapSize}: the queue reclaims the slot it gave up.`,
    );
    A[heapSize] = -Infinity;
    stats.writes++;
    emit(
      PN,
      2,
      A,
      { heapSize, node: heapSize, writing: heapSize, aux: held(key) },
      `A[${heapSize}] = −∞ — a placeholder no key can be smaller than.`,
    );
    emit(
      PN,
      3,
      A,
      { heapSize, node: heapSize, aux: held(key) },
      `HEAP-INCREASE-KEY(A, ${heapSize}, ${key}) does the rest.`,
    );
    heapIncreaseKey(heapSize, key);
  }

  // ---- the scripted session ----

  emit(PB, 1, A, {}, `Start with an arbitrary array. BUILD-MAX-HEAP turns it into a queue.`);
  buildMaxHeap();
  emit(PB, 1, A, { heapSize }, `A[1‥${n}] is a max-heap: every parent is ≥ its children.`);

  const maximum = heapMaximum();
  const extracted = heapExtractMax();

  // Raise a key that is currently near the bottom, so the rise is worth
  // watching. Any legal target would do; the deepest leaf travels furthest.
  const raised = Math.max(1, heapSize);
  const finiteMax = Math.max(...input);
  const newKey = finiteMax + 1 + Math.floor(Math.random() * 9);
  if (heapSize >= 1) heapIncreaseKey(raised, newKey);

  // Put the extracted key back, so the run ends with the queue the same size
  // it started and the reader can see INSERT reuse the vacated slot.
  maxHeapInsert(extracted);

  emit(
    PN,
    3,
    A,
    { heapSize },
    `Four operations, one array: maximum ${fmt(maximum)}, extracted ${fmt(extracted)}, raised A[${raised}] to ${newKey}, and inserted ${fmt(extracted)} again.`,
  );

  return {
    steps,
    finalArray: A.slice(1) as number[],
    output: { heapSize, maximum, extracted, raised, newKey },
  };
}

/** Does A[1‥heapSize] satisfy the max-heap property? */
function heapViolation(A: number[], heapSize: number): string | null {
  for (let i = 2; i <= heapSize; i++) {
    const p = Math.floor(i / 2);
    if (A[p - 1]! < A[i - 1]!) {
      return `A[${p}] = ${A[p - 1]} < A[${i}] = ${A[i - 1]} — the heap property is broken`;
    }
  }
  return null;
}

export const maxPriorityQueue: AlgorithmModule = {
  id: 'max-priority-queue',
  name: 'Max-Priority Queue',
  visualizer: 'array-bars',
  aux: [{ key: 'key', label: 'key', hint: 'the key in flight, not yet in the heap' }],
  procOrder: [
    'HEAP-MAXIMUM',
    'HEAP-EXTRACT-MAX',
    'HEAP-INCREASE-KEY',
    'MAX-HEAP-INSERT',
    'BUILD-MAX-HEAP',
    'MAX-HEAPIFY',
  ],
  procedures: {
    'HEAP-MAXIMUM': {
      title: 'HEAP-MAXIMUM(A)',
      indent: [0],
      lines: ['return A[1]'],
    },
    'HEAP-EXTRACT-MAX': {
      title: 'HEAP-EXTRACT-MAX(A)',
      indent: [0, 1, 0, 0, 0, 0],
      lines: [
        'if heap-size[A] < 1  error "heap underflow"',
        'max = A[1]',
        'A[1] = A[heap-size[A]]',
        'heap-size[A] = heap-size[A] - 1',
        'MAX-HEAPIFY(A, 1)',
        'return max',
      ],
    },
    'HEAP-INCREASE-KEY': {
      title: 'HEAP-INCREASE-KEY(A, i, key)',
      indent: [0, 1, 0, 0, 1, 1],
      lines: [
        'if key < A[i]  error "new key is smaller"',
        '// the key may only rise',
        'A[i] = key',
        'while i > 1 and A[PARENT(i)] < A[i]',
        'exchange A[i] with A[PARENT(i)]',
        'i = PARENT(i)',
      ],
    },
    'MAX-HEAP-INSERT': {
      title: 'MAX-HEAP-INSERT(A, key)',
      indent: [0, 0, 0],
      lines: [
        'heap-size[A] = heap-size[A] + 1',
        'A[heap-size[A]] = -∞',
        'HEAP-INCREASE-KEY(A, heap-size[A], key)',
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
    best: 'Θ(1)',
    average: 'O(lg n)',
    worst: 'O(lg n)',
    space: 'O(1)',
    extra: [
      ['HEAP-MAXIMUM', 'Θ(1)'],
      ['HEAP-EXTRACT-MAX', 'O(lg n)'],
      ['HEAP-INCREASE-KEY', 'O(lg n)'],
      ['MAX-HEAP-INSERT', 'O(lg n)'],
    ],
  },
  result: {
    // INCREASE-KEY raises a key that was never in the input, so no claim about
    // the multiset survives. What must survive is the heap property.
    kind: 'transforms',
    // `finalArray` is optional on a Trace now that a step can carry a tree or
    // a graph instead. This one does return an array, and a missing one is a
    // failure to report rather than a check to skip.
    verify: (_input, trace) =>
      trace.finalArray
        ? heapViolation(trace.finalArray, trace.output?.heapSize ?? 0)
        : 'the run returned no final array, so the heap property cannot be checked',
  },
  record,
};
