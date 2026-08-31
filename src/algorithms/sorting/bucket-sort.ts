import { auxOf, createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * BUCKET-SORT — CLRS §8.4.
 *
 * The book's A[i] are drawn uniformly from [0, 1); here they are two-digit
 * keys read as hundredths, which is the same thing scaled by 100. Element
 * A[i] belongs to bucket ⌊n·A[i]⌋, so on uniform input each bucket gets about
 * one element and the insertion sorts cost Θ(1) each.
 *
 * The book sorts each bucket and *then* concatenates. This recording does it
 * the other way round — concatenate first, then sort each bucket's run where
 * it lies — because a linked list of buckets is invisible in a bar chart and
 * a contiguous run is not. The result is identical: concatenation never moves
 * an element out of its bucket, so sorting before or after is the same sort.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const P = 'BUCKET-SORT';

  // Buckets hold the values themselves, in the order they were inserted, so
  // the concatenation below is exactly the book's.
  const buckets: number[][] = Array.from({ length: n }, () => []);
  const bucketOf = (v: number) => Math.min(n - 1, Math.max(0, Math.floor((n * v) / 100)));

  /** Bucket occupancy, captioned with the bucket number. */
  const sizes = (active?: number) =>
    auxOf([null, ...buckets.map((b) => b.length)], active === undefined ? undefined : active + 1, [
      null,
      ...buckets.map((_, i) => i),
    ]);

  /** Both aux rows on every step, so neither ever pops in and shifts layout. */
  const bag = (active?: number, key?: number) => ({
    B: sizes(active),
    key: auxOf([null, key ?? null], key === undefined ? undefined : 1),
  });

  emit(
    P,
    1,
    A,
    { aux: bag() },
    `${n} empty buckets. A[i] read as a fraction goes to bucket ⌊${n}·A[i]⌋.`,
  );

  for (let i = 1; i <= n; i++) {
    const v = A[i] as number;
    const b = bucketOf(v);
    emit(
      P,
      4,
      A,
      { reading: i, i, aux: bag(b) },
      `for i = 1 to ${n}: A[${i}] = ${v}, read as 0.${String(v).padStart(2, '0')}.`,
    );
    buckets[b]!.push(v);
    stats.writes++;
    emit(
      P,
      5,
      A,
      { reading: i, i, aux: bag(b) },
      `⌊${n}·0.${String(v).padStart(2, '0')}⌋ = ${b}, so ${v} joins bucket ${b}, now holding ${buckets[b]!.length}.`,
    );
  }

  // Lay the buckets out end to end in the array. This is the book's line 8,
  // done early so the rest of the run has something to show.
  const out: Array<number | null> = new Array(n + 1).fill(null);
  emit(
    P,
    8,
    out,
    { aux: bag() },
    `Now lay the buckets out end to end, bucket 0 first. The array empties and refills in bucket order.`,
  );

  /** Where each bucket's run starts and ends in the laid-out array. */
  const runs: Array<[number, number]> = [];
  let at = 1;
  for (let b = 0; b < n; b++) {
    const start = at;
    for (const v of buckets[b]!) {
      out[at] = v;
      stats.writes++;
      emit(
        P,
        8,
        out,
        { writing: at, range: [start, at], aux: bag(b) },
        `Bucket ${b} → A[${at}] = ${v}.`,
      );
      at++;
    }
    if (at > start) runs.push([start, at - 1]);
  }

  // Insertion-sort each run in place — the book's lines 6–7.
  const settled: number[] = [];
  for (const [start, end] of runs) {
    const b = bucketOf(out[start] as number);
    emit(
      P,
      6,
      out,
      { range: [start, end], doneSet: settled.slice(), aux: bag(b) },
      end === start
        ? `Bucket ${b} holds one element — already sorted.`
        : `Insertion-sort bucket ${b}, which lies in A[${start}‥${end}].`,
    );

    for (let j = start + 1; j <= end; j++) {
      const key = out[j] as number;
      let i = j - 1;
      while (true) {
        stats.comparisons++;
        const shift = i >= start && (out[i] as number) > key;
        emit(
          P,
          7,
          out,
          {
            range: [start, end],
            compare: i >= start ? [i] : [],
            doneSet: settled.slice(),
            aux: bag(b, key),
          },
          i >= start
            ? `A[${i}] = ${out[i]} vs key ${key}: ${shift ? 'shift it right' : 'key stays here'}.`
            : `Reached the start of the bucket.`,
        );
        if (!shift) break;
        out[i + 1] = out[i];
        stats.writes++;
        emit(
          P,
          7,
          out,
          {
            range: [start, end],
            shift: i + 1,
            doneSet: settled.slice(),
            aux: bag(b, key),
          },
          `A[${i + 1}] = A[${i}] = ${out[i]}.`,
        );
        i--;
      }
      out[i + 1] = key;
      stats.writes++;
      emit(
        P,
        7,
        out,
        { range: [start, end], placed: i + 1, doneSet: settled.slice(), aux: bag(b) },
        `A[${i + 1}] = ${key}.`,
      );
    }

    for (let s = start; s <= end; s++) settled.push(s);
    emit(
      P,
      7,
      out,
      { doneSet: settled.slice(), aux: bag(b) },
      `Bucket ${b} is sorted, and every key in it is smaller than every key in the buckets after it.`,
    );
  }

  emit(
    P,
    9,
    out,
    { done: true, aux: bag() },
    `Done — the buckets were already in order, so sorting inside each one finished the job.`,
  );
  return { steps, finalArray: out.slice(1) as number[] };
}

export const bucketSort: AlgorithmModule = {
  id: 'bucket-sort',
  name: 'Bucket Sort',
  visualizer: 'array-bars',
  defaultSize: 10,
  aux: [
    { key: 'B', label: 'B', hint: 'how many keys are in each bucket' },
    { key: 'key', label: 'key', hint: 'held while a bucket is insertion-sorted' },
  ],
  input: {
    min: 0,
    max: 99,
    placeholder: '78, 17, 39, 26, 72, 94, 21, 12, 23, 68',
    note: 'two-digit keys, read as hundredths',
  },
  procOrder: ['BUCKET-SORT'],
  procedures: {
    'BUCKET-SORT': {
      title: 'BUCKET-SORT(A, n)',
      indent: [0, 0, 1, 0, 1, 0, 1, 0, 0],
      lines: [
        'let B[0‥n-1] be a new array',
        'for i = 0 to n-1',
        'make B[i] an empty list',
        'for i = 1 to n',
        'insert A[i] into list B[⌊n·A[i]⌋]',
        'for i = 0 to n-1',
        'sort list B[i] with insertion sort',
        'concatenate B[0], B[1], …, B[n-1] in order',
        'return the concatenated lists',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n)',
    worst: 'Θ(n²)',
    space: 'Θ(n)',
    stable: 'Yes',
    inPlace: 'No',
    extra: [
      ['Assumes', 'keys uniform over [0, 1)'],
      ['Worst case', 'every key in one bucket'],
      ['Expected bucket size', '1'],
    ],
  },
  record,
};
