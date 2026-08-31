import { auxOf, createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * PERMUTE-BY-SORTING — CLRS §5.3.
 *
 * The first of the chapter's two ways to produce a uniform random
 * permutation: give every element a random priority, then sort by priority.
 * It is correct as long as the priorities are distinct, which is why the book
 * draws them from 1‥n³ — that makes a collision unlikely enough to ignore,
 * and Exercise 5.3-5 asks you to bound the probability.
 *
 * The priorities ride above the chart as chips, because they are the sort
 * keys and they are nowhere in the array. The bars move; the chips move with
 * them.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const P = 'PERMUTE-BY-SORTING';

  const prio: Array<number | null> = new Array(n + 1).fill(null);
  const bound = Math.max(1, n * n * n);
  const random = (lo: number, hiInclusive: number) =>
    lo + Math.floor(Math.random() * (hiInclusive - lo + 1));

  const keys = (ptr?: number) => ({ P: auxOf(prio, ptr) });

  emit(P, 1, A, { aux: keys() }, `P[1‥${n}] will hold one random priority per element.`);

  for (let i = 1; i <= n; i++) {
    emit(P, 2, A, { i, reading: i, aux: keys(i) }, `for i = 1 to ${n}`);
    prio[i] = random(1, bound);
    stats.writes++;
    emit(
      P,
      3,
      A,
      { i, reading: i, aux: keys(i) },
      `P[${i}] = RANDOM(1, ${bound}) = ${prio[i]}. The range is n³ so that two elements almost never tie.`,
    );
  }

  emit(
    P,
    4,
    A,
    { aux: keys() },
    `Now sort A by P. Any sort would do; this one is insertion sort, so you can watch the pairs move together.`,
  );

  // Insertion sort on (A, P) pairs, keyed by P. Both arrays move as one — an
  // element and its priority must never come apart.
  for (let j = 2; j <= n; j++) {
    const key = A[j] as number;
    const keyP = prio[j] as number;
    let i = j - 1;

    while (true) {
      stats.comparisons++;
      const shift = i >= 1 && (prio[i] as number) > keyP;
      emit(
        P,
        4,
        A,
        { j, i, sortedUpTo: j - 1, compare: i >= 1 ? [i] : [], aux: keys(i >= 1 ? i : undefined) },
        i >= 1
          ? `P[${i}] = ${prio[i]} vs the held priority ${keyP}: ${shift ? 'bigger, so shift its element right' : 'smaller, so the held element stops here'}.`
          : `Reached the front of the array.`,
      );
      if (!shift) break;

      A[i + 1] = A[i];
      prio[i + 1] = prio[i];
      stats.writes++;
      emit(
        P,
        4,
        A,
        { j, i, sortedUpTo: j - 1, shift: i + 1, aux: keys(i + 1) },
        `A[${i + 1}] = ${A[i]} and P[${i + 1}] = ${prio[i]} — the value and its priority move together.`,
      );
      i--;
    }

    A[i + 1] = key;
    prio[i + 1] = keyP;
    stats.writes++;
    emit(
      P,
      4,
      A,
      { j, sortedUpTo: j, placed: i + 1, aux: keys(i + 1) },
      `A[${i + 1}] = ${key}, with priority ${keyP}.`,
    );
  }

  emit(
    P,
    4,
    A,
    { done: true, aux: keys() },
    `The priorities are now in increasing order, and A is a uniformly random permutation of what you started with.`,
  );

  return { steps, finalArray: A.slice(1) as number[] };
}

export const permuteBySorting: AlgorithmModule = {
  id: 'permute-by-sorting',
  name: 'Permute by Sorting',
  visualizer: 'array-bars',
  aux: [{ key: 'P', label: 'P', hint: 'the random sort key for the element below it' }],
  procOrder: ['PERMUTE-BY-SORTING'],
  procedures: {
    'PERMUTE-BY-SORTING': {
      title: 'PERMUTE-BY-SORTING(A, n)',
      indent: [0, 0, 1, 0],
      lines: [
        'let P[1‥n] be a new array',
        'for i = 1 to n',
        'P[i] = RANDOM(1, n³)',
        'sort A, using P as sort keys',
      ],
    },
  },
  complexity: {
    best: 'Θ(n lg n)',
    average: 'Θ(n lg n)',
    worst: 'Θ(n lg n)',
    space: 'Θ(n)',
    inPlace: 'No',
    extra: [
      ['Priorities drawn from', '1‥n³'],
      ['Correct when', 'the priorities are all distinct'],
      ['P(some collision)', '< 1/n'],
      ['Beaten by', 'RANDOMIZE-IN-PLACE, at Θ(n)'],
    ],
  },
  result: { kind: 'permutes' },
  record,
};
