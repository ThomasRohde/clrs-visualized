import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * MINIMUM, and finding the minimum and maximum together — CLRS §9.1.
 *
 * The first thing in the book that reads an array without rearranging it: the
 * array ends exactly as it started, and the whole result is the comparison
 * counter.
 *
 * Both methods run, one after the other, on the same array. That is the
 * point of the section — n−1 comparisons for the minimum alone, and only
 * 3⌊n/2⌋ for *both* answers, rather than the 2n−2 you get by running two
 * independent scans. The trace tape shows the two passes side by side.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PM = 'MINIMUM';
  const PP = 'MIN-AND-MAX';

  // ---- MINIMUM: the obvious scan ----

  let minIdx = 1;
  emit(PM, 1, A, { minIdx, marks: [1] }, `min = A[1] = ${A[1]}.`);

  for (let i = 2; i <= n; i++) {
    emit(PM, 2, A, { i, minIdx, marks: [minIdx] }, `for i = ${i} to ${n}`);
    stats.comparisons++;
    if ((A[minIdx] as number) > (A[i] as number)) {
      emit(
        PM,
        3,
        A,
        { i, minIdx, marks: [minIdx], compare: [i] },
        `min = ${A[minIdx]} > A[${i}] = ${A[i]} — a new minimum.`,
      );
      minIdx = i;
      emit(PM, 4, A, { i, minIdx, marks: [minIdx] }, `min = A[${i}] = ${A[i]}.`);
    } else {
      emit(
        PM,
        3,
        A,
        { i, minIdx, marks: [minIdx], compare: [i] },
        `min = ${A[minIdx]} ≤ A[${i}] = ${A[i]} — min stands.`,
      );
    }
  }

  const minComparisons = stats.comparisons;
  const min = A[minIdx] as number;
  emit(
    PM,
    5,
    A,
    { minIdx, marks: [minIdx] },
    `return ${min}. That took ${minComparisons} comparison${minComparisons === 1 ? '' : 's'} — exactly n−1, and no fewer is possible.`,
  );

  // ---- MIN-AND-MAX: pairs first ----

  let lo: number;
  let hi: number;
  let i: number;

  if (n % 2 === 1) {
    lo = 1;
    hi = 1;
    i = 2;
    emit(
      PP,
      2,
      A,
      { i, minIdx: lo, maxIdx: hi, marks: [lo, hi] },
      `n = ${n} is odd, so start with min = max = A[1] = ${A[1]} and no comparison spent.`,
    );
  } else {
    stats.comparisons++;
    if ((A[1] as number) < (A[2] as number)) {
      lo = 1;
      hi = 2;
    } else {
      lo = 2;
      hi = 1;
    }
    i = 3;
    emit(
      PP,
      4,
      A,
      { i, minIdx: lo, maxIdx: hi, marks: [lo, hi], compare: [1, 2] },
      `n = ${n} is even: one comparison sets min = ${A[lo]} and max = ${A[hi]}.`,
    );
  }

  while (i < n) {
    // Compare the pair against each other first. That single comparison is
    // what buys the saving: only the smaller can beat min, only the larger
    // can beat max, so each element costs 1.5 comparisons instead of 2.
    stats.comparisons++;
    const [small, large] = (A[i] as number) < (A[i + 1] as number) ? [i, i + 1] : [i + 1, i];
    emit(
      PP,
      6,
      A,
      { i, minIdx: lo, maxIdx: hi, marks: [lo, hi], compare: [i, i + 1] },
      `Compare the pair A[${i}] = ${A[i]} and A[${i + 1}] = ${A[i + 1]}: ${A[small]} is the smaller.`,
    );

    stats.comparisons++;
    if ((A[small] as number) < (A[lo] as number)) {
      lo = small;
      emit(
        PP,
        7,
        A,
        { i, minIdx: lo, maxIdx: hi, marks: [lo, hi], compare: [small] },
        `${A[small]} beats the running minimum — min = ${A[small]}.`,
      );
    } else {
      emit(
        PP,
        7,
        A,
        { i, minIdx: lo, maxIdx: hi, marks: [lo, hi], compare: [small] },
        `${A[small]} does not beat min = ${A[lo]}. The larger of the pair never could.`,
      );
    }

    stats.comparisons++;
    if ((A[large] as number) > (A[hi] as number)) {
      hi = large;
      emit(
        PP,
        8,
        A,
        { i, minIdx: lo, maxIdx: hi, marks: [lo, hi], compare: [large] },
        `${A[large]} beats the running maximum — max = ${A[large]}.`,
      );
    } else {
      emit(
        PP,
        8,
        A,
        { i, minIdx: lo, maxIdx: hi, marks: [lo, hi], compare: [large] },
        `${A[large]} does not beat max = ${A[hi]}.`,
      );
    }

    i += 2;
    emit(PP, 9, A, { i, minIdx: lo, maxIdx: hi, marks: [lo, hi] }, `i = ${i}.`);
  }

  const pairComparisons = stats.comparisons - minComparisons;
  const max = A[hi] as number;
  emit(
    PP,
    10,
    A,
    { minIdx: lo, maxIdx: hi, marks: [lo, hi] },
    `return (${A[lo]}, ${max}). Both answers for ${pairComparisons} comparisons, where two separate scans would have cost ${Math.max(0, 2 * n - 2)}.`,
  );

  return {
    steps,
    finalArray: A.slice(1) as number[],
    output: { min, max, minComparisons, pairComparisons },
  };
}

export const minimumMaximum: AlgorithmModule = {
  id: 'minimum-maximum',
  name: 'Minimum and Maximum',
  visualizer: 'array-bars',
  procOrder: ['MINIMUM', 'MIN-AND-MAX'],
  procedures: {
    MINIMUM: {
      title: 'MINIMUM(A, n)',
      indent: [0, 0, 1, 2, 0],
      lines: ['min = A[1]', 'for i = 2 to n', 'if min > A[i]', 'min = A[i]', 'return min'],
    },
    // §9.1 gives this one in prose rather than pseudocode; this is that prose
    // written out in the book's style.
    'MIN-AND-MAX': {
      title: 'MIN-AND-MAX(A, n)',
      indent: [0, 1, 0, 1, 0, 1, 1, 1, 1, 0],
      lines: [
        'if n is odd',
        'min = max = A[1];  i = 2',
        'else',
        'compare A[1] with A[2];  min = smaller, max = larger;  i = 3',
        'while i < n',
        'compare A[i] with A[i+1]',
        'compare the smaller of the pair with min',
        'compare the larger of the pair with max',
        'i = i + 2',
        'return (min, max)',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n)',
    worst: 'Θ(n)',
    space: 'Θ(1)',
    extra: [
      ['MINIMUM alone', 'n − 1 comparisons'],
      ['Both, separately', '2n − 2 comparisons'],
      ['Both, in pairs', '3⌊n/2⌋ comparisons'],
      ['Lower bound', 'n − 1 for either alone'],
    ],
  },
  result: {
    kind: 'preserves',
    verify: (input: number[], trace) => {
      const min = Math.min(...input);
      const max = Math.max(...input);
      if (trace.output?.min !== min) return `reported min ${trace.output?.min}, expected ${min}`;
      if (trace.output?.max !== max) return `reported max ${trace.output?.max}, expected ${max}`;
      // The saving is the whole point of §9.1, so it is worth asserting.
      const budget = 3 * Math.floor(input.length / 2);
      if ((trace.output?.pairComparisons ?? 0) > budget) {
        return `paired scan used ${trace.output?.pairComparisons} comparisons, over the 3⌊n/2⌋ = ${budget} budget`;
      }
      return null;
    },
  },
  record,
};
