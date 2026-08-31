import { auxOf, createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * COUNTING-SORT — CLRS §8.2.
 *
 * The first sort in the book that never compares two elements. It buys that
 * with an assumption: the keys are integers in a known, small range 0‥k. Watch
 * the comparison counter — it stays at zero for the entire run.
 *
 * Three arrays are in play and only one fits in the chart, so the chart shows
 * whichever one the algorithm is currently working in: A while the counts are
 * being taken, B once the output starts filling. C rides above as chips,
 * captioned with the key each count belongs to, because C is indexed by *key*
 * and a row of bare numbers would say nothing.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const k = Math.max(0, ...input);
  const { steps, stats, emit } = createRecorder();
  const P = 'COUNTING-SORT';

  const B: Array<number | null> = new Array(n + 1).fill(null);
  B[0] = null;
  const C: number[] = new Array(k + 1).fill(0);

  /** C as chips: position i+1 holds C[i], captioned with the key i. */
  const counts = (key?: number) =>
    auxOf([null, ...C], key === undefined ? undefined : key + 1, [null, ...C.map((_, i) => i)]);

  /** Slots of B that already hold their final value. */
  const filled: number[] = [];

  /** The input, shown as chips once the chart has moved on to B. */
  const source = (j?: number) => auxOf(A, j);

  emit(
    P,
    1,
    A,
    { aux: { C: counts() } },
    `B[1‥${n}] will hold the answer; C[0‥${k}] will hold one counter per key.`,
  );

  for (let i = 0; i <= k; i++) {
    emit(P, 2, A, { aux: { C: counts(i) } }, `for i = 0 to ${k}`);
    C[i] = 0;
    stats.writes++;
    emit(P, 3, A, { aux: { C: counts(i) } }, `C[${i}] = 0.`);
  }

  for (let j = 1; j <= n; j++) {
    const key = A[j] as number;
    emit(
      P,
      4,
      A,
      { reading: j, j, aux: { C: counts(key) } },
      `for j = ${j} to ${n}: A[${j}] = ${key}.`,
    );
    C[key] = C[key]! + 1;
    stats.writes++;
    emit(
      P,
      5,
      A,
      { reading: j, j, aux: { C: counts(key) } },
      `C[${key}] = ${C[key]} — that is how many ${key}s we have seen.`,
    );
  }

  emit(
    P,
    6,
    A,
    { aux: { C: counts() } },
    `C now holds how many elements equal each key. No comparison has happened yet.`,
  );

  for (let i = 1; i <= k; i++) {
    emit(P, 7, A, { aux: { C: counts(i) } }, `for i = 1 to ${k}`);
    C[i] = C[i]! + C[i - 1]!;
    stats.writes++;
    emit(
      P,
      8,
      A,
      { aux: { C: counts(i) } },
      `C[${i}] = C[${i}] + C[${i - 1}] = ${C[i]} — running total.`,
    );
  }

  emit(
    P,
    9,
    A,
    { aux: { C: counts() } },
    `C[i] is now the count of elements ≤ i, which is exactly the last slot of B a key i may take.`,
  );

  // The chart moves to B here: from this line on, the algorithm is writing the
  // output array, and A is only ever read. A rides above as chips instead.
  emit(
    P,
    10,
    B,
    { doneSet: filled.slice(), aux: { C: counts(), A: source() } },
    `The chart now shows B, which starts out empty. A moves up to the chips above it.`,
  );

  for (let j = n; j >= 1; j--) {
    const key = A[j] as number;
    emit(
      P,
      10,
      B,
      { doneSet: filled.slice(), aux: { C: counts(key), A: source(j) } },
      `for j = ${n} downto 1: A[${j}] = ${key}.`,
    );
    const dest = C[key]!;
    B[dest] = key;
    stats.writes++;
    emit(
      P,
      11,
      B,
      { writing: dest, dest, doneSet: filled.slice(), aux: { C: counts(key), A: source(j) } },
      `B[C[${key}]] = B[${dest}] = ${key} — straight into its final slot, no comparison.`,
    );
    filled.push(dest);
    C[key] = dest - 1;
    stats.writes++;
    emit(
      P,
      12,
      B,
      { doneSet: filled.slice(), dest, aux: { C: counts(key), A: source(j) } },
      `C[${key}] = ${C[key]}, so the next ${key} lands just to the left. That is what keeps the sort stable.`,
    );
  }

  emit(P, 13, B, { done: true, aux: { C: counts() } }, `return B — sorted, with zero comparisons.`);
  return { steps, finalArray: B.slice(1) as number[] };
}

export const countingSort: AlgorithmModule = {
  id: 'counting-sort',
  name: 'Counting Sort',
  visualizer: 'array-bars',
  defaultSize: 10,
  aux: [
    { key: 'C', label: 'C', hint: 'one counter per key, captioned with the key' },
    { key: 'A', label: 'A', hint: 'the input, read right to left' },
  ],
  input: {
    min: 0,
    max: 9,
    placeholder: '2, 5, 3, 0, 2, 3, 0, 3',
    note: 'keys 0–9, so C stays short',
  },
  procOrder: ['COUNTING-SORT'],
  procedures: {
    'COUNTING-SORT': {
      title: 'COUNTING-SORT(A, n, k)',
      indent: [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0],
      lines: [
        'let B[1‥n] and C[0‥k] be new arrays',
        'for i = 0 to k',
        'C[i] = 0',
        'for j = 1 to n',
        'C[A[j]] = C[A[j]] + 1',
        '// C[i] now holds the number of elements equal to i',
        'for i = 1 to k',
        'C[i] = C[i] + C[i-1]',
        '// C[i] now holds the number of elements ≤ i',
        'for j = n downto 1',
        'B[C[A[j]]] = A[j]',
        'C[A[j]] = C[A[j]] - 1',
        'return B',
      ],
    },
  },
  complexity: {
    best: 'Θ(n + k)',
    average: 'Θ(n + k)',
    worst: 'Θ(n + k)',
    space: 'Θ(n + k)',
    stable: 'Yes',
    inPlace: 'No',
    extra: [
      ['Comparisons', 'none — ever'],
      ['Assumes', 'integer keys in 0‥k'],
      ['Linear when', 'k = O(n)'],
    ],
  },
  record,
};
