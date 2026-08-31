import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * RANDOMIZE-IN-PLACE — CLRS §5.3.
 *
 * Two lines, Θ(n), no extra storage, and a uniform random permutation. The
 * whole subtlety is in the range of the random draw: A[i] is swapped with a
 * slot chosen from i‥n, *including i itself*, and never with a slot before i.
 * Drawing from 1‥n instead — the obvious-looking variant — does not produce a
 * uniform permutation, and Exercise 5.3-1 makes that concrete.
 *
 * The loop invariant is drawn as it goes: after iteration i, A[1‥i] is a
 * uniformly random i-permutation and will not be touched again, so those bars
 * square off.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const P = 'RANDOMIZE-IN-PLACE';

  const random = (lo: number, hiInclusive: number) =>
    lo + Math.floor(Math.random() * (hiInclusive - lo + 1));

  for (let i = 1; i <= n; i++) {
    emit(
      P,
      1,
      A,
      { i, sortedUpTo: i - 1, range: [i, n] },
      `for i = ${i} to ${n}: A[1‥${i - 1}] is settled, and the bracket marks what is still in play.`,
    );

    const c = random(i, n);
    emit(
      P,
      2,
      A,
      { i, chosen: c, sortedUpTo: i - 1, range: [i, n], marks: [c] },
      `RANDOM(${i}, ${n}) = ${c}. The draw starts at ${i}, not at 1 — that is what makes the permutation uniform.`,
    );

    const tmp = A[i];
    A[i] = A[c];
    A[c] = tmp;
    stats.swaps++;
    emit(
      P,
      2,
      A,
      { i, chosen: c, sortedUpTo: i - 1, range: [i, n], swap: [i, c] },
      c === i
        ? `A[${i}] is exchanged with itself — a perfectly legal outcome, and leaving it out would break uniformity.`
        : `Exchange A[${i}] with A[${c}].`,
    );

    emit(
      P,
      2,
      A,
      { sortedUpTo: i, range: [i + 1, n] },
      `A[${i}] = ${A[i]} is now fixed. Every one of the ${n - i + 1} candidates had an equal chance of landing there.`,
    );
  }

  emit(
    P,
    2,
    A,
    { done: true },
    `Done in ${n} swaps. Each of the n! permutations was equally likely.`,
  );

  return { steps, finalArray: A.slice(1) as number[] };
}

export const randomizeInPlace: AlgorithmModule = {
  id: 'randomize-in-place',
  name: 'Randomize in Place',
  visualizer: 'array-bars',
  procOrder: ['RANDOMIZE-IN-PLACE'],
  procedures: {
    'RANDOMIZE-IN-PLACE': {
      title: 'RANDOMIZE-IN-PLACE(A, n)',
      indent: [0, 1],
      lines: ['for i = 1 to n', 'exchange A[i] with A[RANDOM(i, n)]'],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n)',
    worst: 'Θ(n)',
    space: 'Θ(1)',
    inPlace: 'Yes',
    extra: [
      ['Permutations produced', 'all n!, equally likely'],
      ['Random draws', 'n, from ranges i‥n'],
      ['Common bug', 'drawing from 1‥n instead of i‥n'],
    ],
  },
  result: { kind: 'permutes' },
  record,
};
