import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * SELECT — CLRS §9.3, the median-of-medians algorithm.
 *
 * Randomized select is linear *in expectation*; this one is linear in the
 * worst case, because it refuses to accept a bad pivot. It spends real work
 * choosing one: sort the elements in groups of five, take the median of each
 * group, and recursively select the median of those medians. That pivot is
 * guaranteed to beat at least 3/10 of the array and lose to at least 3/10, so
 * each recursive call sheds a constant fraction no matter what the input is.
 *
 * This is the 4th-edition presentation, which does the whole thing in place:
 * the groups are strided rather than contiguous, which puts all g group
 * medians into the middle fifth of the subarray with no extra storage.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PS = 'SELECT';
  const PA = 'PARTITION-AROUND';
  const PP = 'PARTITION';

  const target = Math.ceil(n / 2);

  const swap = (a: number, b: number) => {
    const tmp = A[a];
    A[a] = A[b];
    A[b] = tmp;
    stats.swaps++;
  };

  function partition(p: number, r: number): number {
    const x = A[r] as number;
    emit(PP, 1, A, { range: [p, r], pivot: r }, `x = A[${r}] = ${x}.`);
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
        swap(i, j);
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

    swap(i + 1, r);
    emit(
      PP,
      7,
      A,
      { range: [p, r], pivot: r, i, swap: [i + 1, r] },
      `Exchange A[${i + 1}] and A[${r}].`,
    );
    emit(PP, 8, A, { range: [p, r], settled: i + 1 }, `return ${i + 1}.`);
    return i + 1;
  }

  function partitionAround(p: number, r: number, x: number): number {
    let t = p;
    while (t <= r && A[t] !== x) t++;
    emit(PA, 1, A, { range: [p, r], pivot: t, marks: [t] }, `The pivot ${x} sits at A[${t}].`);
    swap(t, r);
    emit(
      PA,
      2,
      A,
      { range: [p, r], swap: [t, r] },
      `Exchange A[${t}] with A[${r}], so PARTITION finds it where it expects to.`,
    );
    emit(PA, 3, A, { range: [p, r], pivot: r }, `return PARTITION(A, ${p}, ${r}).`);
    return partition(p, r);
  }

  /** Insertion-sort five strided slots by adjacent exchanges. */
  function sortGroup(pos: number[], groupNo: number, p: number, r: number): void {
    for (let t = 1; t < pos.length; t++) {
      let s = t;
      while (s > 0) {
        const a = pos[s - 1]!;
        const b = pos[s]!;
        stats.comparisons++;
        const others = pos.filter((k) => k !== a && k !== b);
        if ((A[a] as number) > (A[b] as number)) {
          emit(
            PS,
            11,
            A,
            { range: [p, r], compare: [a, b], marks: others },
            `Group ${groupNo}: A[${a}] = ${A[a]} > A[${b}] = ${A[b]}, so they swap.`,
          );
          swap(a, b);
          emit(
            PS,
            11,
            A,
            { range: [p, r], swap: [a, b], marks: others },
            `Exchange A[${a}] with A[${b}].`,
          );
          s--;
        } else {
          emit(
            PS,
            11,
            A,
            { range: [p, r], compare: [a, b], marks: others },
            `Group ${groupNo}: A[${a}] = ${A[a]} ≤ A[${b}] = ${A[b]}, so this one is in place.`,
          );
          break;
        }
      }
    }
  }

  function selectRange(p: number, r: number, i: number): number {
    emit(
      PS,
      1,
      A,
      { range: [p, r] },
      `SELECT(A, ${p}, ${r}, ${i}): the ${ordinal(i)} smallest of the ${r - p + 1} elements in A[${p}‥${r}].`,
    );

    // Trim from the left until the subarray length is a multiple of 5. Each
    // trip pulls the minimum to the front and drops it, which costs Θ(n) and
    // at most four trips.
    while ((r - p + 1) % 5 !== 0) {
      emit(
        PS,
        1,
        A,
        { range: [p, r] },
        `${r - p + 1} is not a multiple of 5, so peel off the minimum first.`,
      );
      for (let j = p + 1; j <= r; j++) {
        stats.comparisons++;
        emit(
          PS,
          3,
          A,
          { range: [p, r], marks: [p], compare: [j] },
          `Is A[${p}] = ${A[p]} > A[${j}] = ${A[j]}?`,
        );
        if ((A[p] as number) > (A[j] as number)) {
          swap(p, j);
          emit(
            PS,
            4,
            A,
            { range: [p, r], swap: [p, j] },
            `Yes — exchange, so the smallest so far stays at A[${p}].`,
          );
        }
      }
      if (i === 1) {
        emit(
          PS,
          6,
          A,
          { range: [p, r], settled: p },
          `i = 1, and A[${p}] = ${A[p]} is the minimum of the subarray. Done.`,
        );
        return A[p] as number;
      }
      p = p + 1;
      i = i - 1;
      emit(
        PS,
        7,
        A,
        { range: [p, r] },
        `The minimum is settled, so drop it: p = ${p}, and we now want the ${ordinal(i)} smallest of what is left.`,
      );
    }

    const g = (r - p + 1) / 5;
    emit(PS, 9, A, { range: [p, r] }, `g = ${g}: ${g} group${g === 1 ? '' : 's'} of five.`);

    const medians: number[] = [];
    for (let j = p; j <= p + g - 1; j++) {
      const pos = [j, j + g, j + 2 * g, j + 3 * g, j + 4 * g];
      emit(
        PS,
        10,
        A,
        { range: [p, r], marks: pos },
        `Group ${j - p + 1}: A[${pos.join('], A[')}] — every fifth-of-the-way slot, not five in a row.`,
      );
      sortGroup(pos, j - p + 1, p, r);
      medians.push(j + 2 * g);
      emit(
        PS,
        11,
        A,
        { range: [p, r], marks: pos, reading: j + 2 * g },
        `Group ${j - p + 1} is sorted, so its median is the middle slot, A[${j + 2 * g}] = ${A[j + 2 * g]}.`,
      );
    }

    emit(
      PS,
      12,
      A,
      { range: [p + 2 * g, p + 3 * g - 1], marks: medians },
      `Because the groups are strided, all ${g} medians have landed together in A[${p + 2 * g}‥${p + 3 * g - 1}] — the middle fifth.`,
    );

    emit(
      PS,
      13,
      A,
      { range: [p + 2 * g, p + 3 * g - 1] },
      `Recurse on just that fifth to find its median: the median of the medians.`,
    );
    const x = selectRange(p + 2 * g, p + 3 * g - 1, Math.ceil(g / 2));
    emit(
      PS,
      13,
      A,
      { range: [p, r] },
      `x = ${x}. At least 3/10 of A[${p}‥${r}] is ≤ x and at least 3/10 is ≥ x, whatever the input.`,
    );

    const q = partitionAround(p, r, x);
    emit(PS, 14, A, { range: [p, r], settled: q }, `q = ${q}: x is now in its final position.`);
    const k = q - p + 1;
    emit(
      PS,
      15,
      A,
      { range: [p, r], settled: q, q },
      `k = ${k}: x is the ${ordinal(k)} smallest of this subarray.`,
    );

    if (i === k) {
      emit(PS, 17, A, { range: [p, r], settled: q, q }, `i = k, so x = ${x} is the answer.`);
      return x;
    }
    if (i < k) {
      emit(
        PS,
        19,
        A,
        { range: [p, q - 1], settled: q },
        `i < k, so recurse on the left part — at most 7/10 of what we started with.`,
      );
      return selectRange(p, q - 1, i);
    }
    emit(
      PS,
      20,
      A,
      { range: [q + 1, r], settled: q },
      `i > k, so recurse on the right part, now looking for the ${ordinal(i - k)} smallest.`,
    );
    return selectRange(q + 1, r, i - k);
  }

  const answer = selectRange(1, n, target);
  emit(
    PS,
    1,
    A,
    { range: [1, n] },
    `The ${ordinal(target)} smallest element is ${answer} — found in Θ(n) time in the worst case, not just on average.`,
  );

  return { steps, finalArray: A.slice(1) as number[], output: { i: target, value: answer } };
}

function ordinal(i: number): string {
  const suffix = i % 100 >= 11 && i % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][i % 10] || 'th';
  return `${i}${suffix}`;
}

export const select: AlgorithmModule = {
  id: 'select',
  name: 'Select (Median of Medians)',
  visualizer: 'array-bars',
  defaultSize: 15,
  procOrder: ['SELECT', 'PARTITION-AROUND', 'PARTITION'],
  procedures: {
    SELECT: {
      title: 'SELECT(A, p, r, i)',
      indent: [0, 1, 2, 3, 1, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0],
      lines: [
        'while (r - p + 1) mod 5 ≠ 0',
        'for j = p + 1 to r',
        'if A[p] > A[j]',
        'exchange A[p] with A[j]',
        'if i == 1',
        'return A[p]',
        'p = p + 1',
        'i = i - 1',
        'g = (r - p + 1) / 5',
        'for j = p to p + g - 1',
        'sort ⟨A[j], A[j+g], A[j+2g], A[j+3g], A[j+4g]⟩ in place',
        '// all g medians now lie in A[p+2g ‥ p+3g-1]',
        'x = SELECT(A, p+2g, p+3g-1, ⌈g/2⌉)',
        'q = PARTITION-AROUND(A, p, r, x)',
        'k = q - p + 1',
        'if i == k',
        'return x',
        'elseif i < k',
        'return SELECT(A, p, q-1, i)',
        'else return SELECT(A, q+1, r, i-k)',
      ],
    },
    'PARTITION-AROUND': {
      title: 'PARTITION-AROUND(A, p, r, x)',
      indent: [0, 0, 0],
      lines: [
        'find the index t in p‥r with A[t] == x',
        'exchange A[t] with A[r]',
        'return PARTITION(A, p, r)',
      ],
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
    average: 'Θ(n)',
    worst: 'Θ(n)',
    space: 'O(lg n)',
    inPlace: 'Yes',
    extra: [
      ['Recurrence', 'T(n) ≤ T(n/5) + T(7n/10) + Θ(n)'],
      ['Pivot guarantee', 'beats ≥ 3/10, loses to ≥ 3/10'],
      ['Asked for here', 'the lower median, i = ⌈n/2⌉'],
      ['Constant factor', 'much worse than RANDOMIZED-SELECT'],
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
