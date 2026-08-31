import { auxOf, createRecorder, fmt, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * MERGE-SORT and MERGE — CLRS §2.3.
 *
 * The L and R buffers, including the ∞ sentinels, are recorded in each step's
 * `hi.aux` so the visualizer can show them filling and draining alongside the
 * main array. That is the part of merge sort that is hard to see on paper.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PM = 'MERGE-SORT';
  const PG = 'MERGE';

  function mergeSort(p: number, r: number): void {
    emit(PM, 1, A, { range: [p, r] }, `MERGE-SORT(A, ${p}, ${r}): is ${p} < ${r}?`);
    if (p < r) {
      const q = Math.floor((p + r) / 2);
      emit(PM, 2, A, { range: [p, r], mid: q }, `q = ⌊(${p}+${r})/2⌋ = ${q}.`);
      emit(PM, 3, A, { range: [p, q] }, `Recurse on the left half A[${p}..${q}].`);
      mergeSort(p, q);
      emit(PM, 4, A, { range: [q + 1, r] }, `Recurse on the right half A[${q + 1}..${r}].`);
      mergeSort(q + 1, r);
      emit(PM, 5, A, { range: [p, r], mid: q }, `Merge the two sorted halves.`);
      merge(p, q, r);
    } else {
      emit(PM, 1, A, { range: [p, r], base: true }, `Base case: A[${p}..${r}] has ≤ 1 element.`);
    }
  }

  function merge(p: number, q: number, r: number): void {
    const n1 = q - p + 1;
    const n2 = r - q;
    emit(PG, 1, A, { range: [p, r], mid: q }, `n1 = ${n1}.`);
    emit(PG, 2, A, { range: [p, r], mid: q }, `n2 = ${n2}.`);

    const L: Array<number> = new Array(n1 + 1);
    const R: Array<number> = new Array(n2 + 1);
    emit(
      PG,
      3,
      A,
      { range: [p, r], mid: q },
      `Create buffers L[1..${n1 + 1}] and R[1..${n2 + 1}].`,
    );

    for (let i = 1; i <= n1; i++) {
      L[i] = A[p + i - 1] as number;
      emit(
        PG,
        5,
        A,
        { range: [p, r], mid: q, source: p + i - 1, aux: { L: auxOf(L), R: auxOf(R) } },
        `L[${i}] = A[${p + i - 1}] = ${L[i]}.`,
      );
    }
    for (let j = 1; j <= n2; j++) {
      R[j] = A[q + j] as number;
      emit(
        PG,
        7,
        A,
        { range: [p, r], mid: q, source: q + j, aux: { L: auxOf(L), R: auxOf(R) } },
        `R[${j}] = A[${q + j}] = ${R[j]}.`,
      );
    }

    L[n1 + 1] = Infinity;
    R[n2 + 1] = Infinity;
    emit(
      PG,
      8,
      A,
      { range: [p, r], mid: q, aux: { L: auxOf(L), R: auxOf(R) } },
      `L[${n1 + 1}] = ∞ (sentinel).`,
    );
    emit(
      PG,
      9,
      A,
      { range: [p, r], mid: q, aux: { L: auxOf(L), R: auxOf(R) } },
      `R[${n2 + 1}] = ∞ (sentinel).`,
    );

    let i = 1;
    let j = 1;
    emit(PG, 10, A, { range: [p, r], mid: q, aux: { L: auxOf(L, i), R: auxOf(R, j) } }, `i = 1.`);
    emit(PG, 11, A, { range: [p, r], mid: q, aux: { L: auxOf(L, i), R: auxOf(R, j) } }, `j = 1.`);

    for (let k = p; k <= r; k++) {
      stats.comparisons++;
      const takeLeft = L[i] <= R[j];
      emit(
        PG,
        13,
        A,
        { range: [p, r], mid: q, aux: { L: auxOf(L, i), R: auxOf(R, j) } },
        `Compare L[${i}] = ${fmt(L[i])} with R[${j}] = ${fmt(R[j])}.`,
      );
      if (takeLeft) {
        A[k] = L[i];
        stats.writes++;
        emit(
          PG,
          14,
          A,
          { range: [p, r], mid: q, writing: k, aux: { L: auxOf(L, i), R: auxOf(R, j) } },
          `A[${k}] = L[${i}] = ${fmt(L[i])}.`,
        );
        i++;
        emit(
          PG,
          15,
          A,
          { range: [p, r], mid: q, aux: { L: auxOf(L, i), R: auxOf(R, j) } },
          `i = ${i}.`,
        );
      } else {
        A[k] = R[j];
        stats.writes++;
        emit(
          PG,
          17,
          A,
          { range: [p, r], mid: q, writing: k, aux: { L: auxOf(L, i), R: auxOf(R, j) } },
          `A[${k}] = R[${j}] = ${fmt(R[j])}.`,
        );
        j++;
        emit(
          PG,
          18,
          A,
          { range: [p, r], mid: q, aux: { L: auxOf(L, i), R: auxOf(R, j) } },
          `j = ${j}.`,
        );
      }
    }

    emit(PM, 5, A, { range: [p, r], merged: true }, `A[${p}..${r}] is now sorted.`);
  }

  mergeSort(1, n);
  emit(PM, 1, A, { range: [1, n], done: true }, `Done — A[1..${n}] is sorted.`);
  return { steps, finalArray: A.slice(1) as number[] };
}

export const mergeSort: AlgorithmModule = {
  id: 'merge-sort',
  name: 'Merge Sort',
  visualizer: 'array-bars',
  aux: [
    { key: 'L', label: 'L' },
    { key: 'R', label: 'R' },
  ],
  procOrder: ['MERGE-SORT', 'MERGE'],
  procedures: {
    'MERGE-SORT': {
      title: 'MERGE-SORT(A, p, r)',
      indent: [0, 1, 1, 1, 1],
      lines: [
        'if p < r',
        'q = ⌊(p+r)/2⌋',
        'MERGE-SORT(A, p, q)',
        'MERGE-SORT(A, q+1, r)',
        'MERGE(A, p, q, r)',
      ],
    },
    MERGE: {
      title: 'MERGE(A, p, q, r)',
      indent: [0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 2, 2, 1, 2, 2],
      lines: [
        'n1 = q - p + 1',
        'n2 = r - q',
        'let L[1‥n1+1] and R[1‥n2+1] be new arrays',
        'for i = 1 to n1',
        'L[i] = A[p+i-1]',
        'for j = 1 to n2',
        'R[j] = A[q+j]',
        'L[n1+1] = ∞',
        'R[n2+1] = ∞',
        'i = 1',
        'j = 1',
        'for k = p to r',
        'if L[i] ≤ R[j]',
        'A[k] = L[i]',
        'i = i + 1',
        'else',
        'A[k] = R[j]',
        'j = j + 1',
      ],
    },
  },
  complexity: {
    best: 'Θ(n log n)',
    average: 'Θ(n log n)',
    worst: 'Θ(n log n)',
    space: 'Θ(n)',
    stable: 'Yes',
    inPlace: 'No',
  },
  record,
};
