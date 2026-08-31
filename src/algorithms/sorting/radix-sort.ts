import { auxOf, createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * RADIX-SORT — CLRS §8.3.
 *
 * Counting sort, run once per digit, least significant digit first. The
 * counter-intuitive part is the direction: sorting on the *last* digit first
 * looks like it throws away the work, and it does not, because every pass is
 * stable and so preserves the order the earlier passes established.
 *
 * The chart follows the same convention as counting sort: it shows A while
 * the digit counts are taken, then the output array B as it fills, and the
 * pass ends by declaring that array to be the new A.
 */
export function record(input: number[]): Trace {
  let A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PR = 'RADIX-SORT';
  const PC = 'COUNTING-SORT-BY-DIGIT';

  const d = String(Math.max(...input)).length;
  const digitOf = (v: number, place: number) => Math.floor(v / Math.pow(10, place - 1)) % 10;
  const ordinal = (i: number) => ['ones', 'tens', 'hundreds', 'thousands'][i - 1] ?? `place ${i}`;

  /** The ten digit counters, captioned with the digit each one belongs to. */
  const counts = (C: number[], digit?: number) =>
    auxOf([null, ...C], digit === undefined ? undefined : digit + 1, [null, ...C.map((_, i) => i)]);

  function countingSortOnDigit(place: number): void {
    const C: number[] = new Array(10).fill(0);
    const B: Array<number | null> = new Array(n + 1).fill(null);
    const filled: number[] = [];
    const source = (j?: number) => auxOf(A, j);

    emit(PC, 1, A, { place, aux: { C: counts(C) } }, `C[0‥9] = 0 — one counter per digit value.`);

    for (let j = 1; j <= n; j++) {
      const v = A[j] as number;
      const digit = digitOf(v, place);
      emit(
        PC,
        2,
        A,
        { reading: j, j, place, aux: { C: counts(C, digit) } },
        `A[${j}] = ${v}; its ${ordinal(place)} digit is ${digit}.`,
      );
      C[digit] = C[digit]! + 1;
      stats.writes++;
      emit(
        PC,
        3,
        A,
        { reading: j, j, place, aux: { C: counts(C, digit) } },
        `C[${digit}] = ${C[digit]}.`,
      );
    }

    for (let i = 1; i <= 9; i++) {
      C[i] = C[i]! + C[i - 1]!;
      stats.writes++;
      emit(
        PC,
        5,
        A,
        { place, aux: { C: counts(C, i) } },
        `C[${i}] = C[${i}] + C[${i - 1}] = ${C[i]} — elements with ${ordinal(place)} digit ≤ ${i}.`,
      );
    }

    emit(
      PC,
      6,
      B,
      { place, doneSet: [], aux: { C: counts(C), A: source() } },
      `The chart moves to B, which starts empty. A rides above as chips.`,
    );

    for (let j = n; j >= 1; j--) {
      const v = A[j] as number;
      const digit = digitOf(v, place);
      emit(
        PC,
        6,
        B,
        { place, doneSet: filled.slice(), aux: { C: counts(C, digit), A: source(j) } },
        `for j = ${n} downto 1: A[${j}] = ${v}, ${ordinal(place)} digit ${digit}.`,
      );
      const dest = C[digit]!;
      B[dest] = v;
      stats.writes++;
      emit(
        PC,
        7,
        B,
        {
          writing: dest,
          dest,
          place,
          doneSet: filled.slice(),
          aux: { C: counts(C, digit), A: source(j) },
        },
        `B[${dest}] = ${v}.`,
      );
      filled.push(dest);
      C[digit] = dest - 1;
      stats.writes++;
      emit(
        PC,
        8,
        B,
        { dest, place, doneSet: filled.slice(), aux: { C: counts(C, digit), A: source(j) } },
        `C[${digit}] = ${C[digit]}. Going right to left is what makes this pass stable.`,
      );
    }

    A = B;
    emit(
      PC,
      9,
      A,
      { place, doneSet: filled.slice() },
      `A = B. The array is now sorted on its ${ordinal(place)} digit, and ties kept their old order.`,
    );
  }

  emit(PR, 1, A, {}, `${d} digits, so ${d} passes — least significant digit first.`);
  for (let i = 1; i <= d; i++) {
    emit(PR, 2, A, { place: i }, `Pass ${i} of ${d}: stable-sort A on the ${ordinal(i)} digit.`);
    countingSortOnDigit(i);
  }

  emit(
    PR,
    2,
    A,
    { done: true },
    `Done — after the ${ordinal(d)} pass, A[1‥${n}] is sorted, and no two elements were ever compared.`,
  );
  return { steps, finalArray: A.slice(1) as number[] };
}

export const radixSort: AlgorithmModule = {
  id: 'radix-sort',
  name: 'Radix Sort',
  visualizer: 'array-bars',
  defaultSize: 8,
  aux: [
    { key: 'C', label: 'C', hint: 'one counter per digit value' },
    { key: 'A', label: 'A', hint: 'this pass’s input, read right to left' },
  ],
  input: {
    min: 100,
    max: 999,
    placeholder: '329, 457, 657, 839, 436, 720, 355',
    note: 'three-digit keys, so d = 3',
  },
  procOrder: ['RADIX-SORT', 'COUNTING-SORT-BY-DIGIT'],
  procedures: {
    'RADIX-SORT': {
      title: 'RADIX-SORT(A, n, d)',
      indent: [0, 1],
      lines: ['for i = 1 to d', 'use a stable sort to sort array A on digit i'],
    },
    'COUNTING-SORT-BY-DIGIT': {
      title: 'the stable sort: COUNTING-SORT on digit i',
      indent: [0, 0, 1, 0, 1, 0, 1, 1, 0],
      lines: [
        'C[0‥9] = 0',
        'for j = 1 to n',
        'C[digit(A[j], i)] = C[digit(A[j], i)] + 1',
        'for v = 1 to 9',
        'C[v] = C[v] + C[v-1]',
        'for j = n downto 1',
        'B[C[digit(A[j], i)]] = A[j]',
        'C[digit(A[j], i)] = C[digit(A[j], i)] - 1',
        'A = B',
      ],
    },
  },
  complexity: {
    best: 'Θ(d(n + b))',
    average: 'Θ(d(n + b))',
    worst: 'Θ(d(n + b))',
    space: 'Θ(n + b)',
    stable: 'Yes',
    inPlace: 'No',
    extra: [
      ['Here', 'b = 10 digits, d = 3 passes'],
      ['Comparisons', 'none — ever'],
      ['Requires', 'a stable sort per pass'],
    ],
  },
  record,
};
