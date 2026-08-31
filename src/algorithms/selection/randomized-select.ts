import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * RANDOMIZED-SELECT — CLRS §9.2.
 *
 * Quicksort that only ever recurses on the side the answer is in. Because it
 * throws away the other half instead of sorting it, the expected cost drops
 * from Θ(n lg n) to Θ(n): the recurrence is T(n) = T(n/2) + Θ(n), and that
 * geometric series sums to a constant times n.
 *
 * The order statistic asked for is the lower median, ⌈n/2⌉ — the case the
 * chapter is named after. Elements outside the bracket have been discarded
 * without ever being sorted, which is exactly what makes this linear.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PS = 'RANDOMIZED-SELECT';
  const PR = 'RANDOMIZED-PARTITION';
  const PP = 'PARTITION';

  const target = Math.ceil(n / 2);
  const random = (p: number, r: number) => p + Math.floor(Math.random() * (r - p + 1));

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
        emit(PP, 4, A, { range: [p, r], pivot: r, i, j }, `A[${j}] = ${A[j]} > x, leave it.`);
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
      `Exchange A[${i + 1}] and A[${r}] — the pivot lands where it belongs.`,
    );
    emit(PP, 8, A, { range: [p, r], settled: i + 1 }, `return ${i + 1}.`);
    return i + 1;
  }

  function randomizedPartition(p: number, r: number): number {
    const c = random(p, r);
    emit(
      PR,
      1,
      A,
      { range: [p, r], chosen: c, marks: [c] },
      `i = RANDOM(${p}, ${r}) = ${c}: A[${c}] = ${A[c]} is the pivot.`,
    );
    const tmp = A[c];
    A[c] = A[r];
    A[r] = tmp;
    stats.swaps++;
    emit(PR, 2, A, { range: [p, r], chosen: c, swap: [c, r] }, `Exchange A[${c}] with A[${r}].`);
    emit(PR, 3, A, { range: [p, r], pivot: r }, `return PARTITION(A, ${p}, ${r}).`);
    return partition(p, r);
  }

  function select(p: number, r: number, i: number): number {
    emit(
      PS,
      1,
      A,
      { range: [p, r] },
      `RANDOMIZED-SELECT(A, ${p}, ${r}, ${i}): looking for the ${ordinal(i)} smallest of A[${p}‥${r}].`,
    );
    if (p === r) {
      emit(PS, 2, A, { range: [p, r], settled: p }, `p = r, so A[${p}] = ${A[p]} is the answer.`);
      return A[p] as number;
    }

    const q = randomizedPartition(p, r);
    emit(PS, 3, A, { range: [p, r], settled: q }, `q = ${q}: the pivot is now in its final place.`);
    const k = q - p + 1;
    emit(
      PS,
      4,
      A,
      { range: [p, r], settled: q, q },
      `k = q − p + 1 = ${k}: the pivot is the ${ordinal(k)} smallest of this subarray.`,
    );

    if (i === k) {
      emit(
        PS,
        6,
        A,
        { range: [p, r], settled: q, q },
        `i = k, so the pivot A[${q}] = ${A[q]} is exactly what we were looking for.`,
      );
      return A[q] as number;
    }
    if (i < k) {
      emit(
        PS,
        8,
        A,
        { range: [p, q - 1], settled: q },
        `i < k — the answer is to the left. A[${q}‥${r}] is discarded unsorted.`,
      );
      return select(p, q - 1, i);
    }
    emit(
      PS,
      9,
      A,
      { range: [q + 1, r], settled: q },
      `i > k — the answer is to the right, and we now want the ${ordinal(i - k)} smallest of A[${q + 1}‥${r}].`,
    );
    return select(q + 1, r, i - k);
  }

  const answer = select(1, n, target);
  emit(
    PS,
    2,
    A,
    { range: [1, n] },
    `The ${ordinal(target)} smallest element is ${answer}. The array was never sorted — only partitioned enough to find it.`,
  );

  return { steps, finalArray: A.slice(1) as number[], output: { i: target, value: answer } };
}

function ordinal(i: number): string {
  const suffix = i % 100 >= 11 && i % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][i % 10] || 'th';
  return `${i}${suffix}`;
}

export const randomizedSelect: AlgorithmModule = {
  id: 'randomized-select',
  name: 'Randomized Select',
  visualizer: 'array-bars',
  procOrder: ['RANDOMIZED-SELECT', 'RANDOMIZED-PARTITION', 'PARTITION'],
  procedures: {
    'RANDOMIZED-SELECT': {
      title: 'RANDOMIZED-SELECT(A, p, r, i)',
      indent: [0, 1, 0, 0, 0, 1, 0, 1, 0],
      lines: [
        'if p == r',
        'return A[p]',
        'q = RANDOMIZED-PARTITION(A, p, r)',
        'k = q - p + 1',
        'if i == k',
        'return A[q]',
        'elseif i < k',
        'return RANDOMIZED-SELECT(A, p, q-1, i)',
        'else return RANDOMIZED-SELECT(A, q+1, r, i-k)',
      ],
    },
    'RANDOMIZED-PARTITION': {
      title: 'RANDOMIZED-PARTITION(A, p, r)',
      indent: [0, 0, 0],
      lines: ['i = RANDOM(p, r)', 'exchange A[i] with A[r]', 'return PARTITION(A, p, r)'],
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
    best: 'Θ(n)',
    average: 'Θ(n) expected',
    worst: 'Θ(n²)',
    space: 'O(1)',
    inPlace: 'Yes',
    extra: [
      ['Recurrence', 'T(n) = T(n/2) + Θ(n) expected'],
      ['Asked for here', 'the lower median, i = ⌈n/2⌉'],
      ['Worst case needs', 'consistently terrible pivots'],
    ],
  },
  result: {
    kind: 'permutes',
    verify: (input: number[], trace) => {
      const i = trace.output?.i ?? 0;
      const expected = [...input].sort((a, b) => a - b)[i - 1];
      if (trace.output?.value !== expected) {
        return `returned ${trace.output?.value} as the ${i}th smallest, expected ${expected}`;
      }
      return null;
    },
  },
  record,
};
