import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type CellsData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * BINARY COUNTER — CLRS §16.1: INCREMENT on a k-bit counter, and the first
 * thing aggregate analysis is used on.
 *
 * One INCREMENT can be expensive. Incrementing 0111 has to clear three bits
 * before it can set the fourth, and in the worst case it rewrites the whole
 * counter. The naive conclusion — n increments cost O(nk) — is true and
 * useless, because those worst cases cannot happen often: **A[0] flips every
 * time, A[1] every second time, A[2] every fourth**, and the sum of n/2^i is
 * under 2n. So n increments cost less than 2n flips however they fall, and
 * the average over the sequence is under 2 — with no probability anywhere,
 * which is what makes it amortised rather than average-case.
 *
 * That is what the run shows and what `verify` asserts: the counter's own
 * `writes` counter is the total number of bit flips, and it is checked
 * against 2n on every generated input.
 *
 * The bits are drawn the way the book prints them and the way we write
 * numbers — **A[0] at the right** — so the run of low-order 1s an increment
 * has to clear is the run at the right-hand end, and the bracket over it is
 * the price of that increment before it is paid.
 */

/** Bits in the counter. Five is 0‥31: enough to see the pattern, small enough to read. */
const K = 5;

/** Cell for bit `i`. Ids are by bit, so the highlight never has to know the layout. */
const bitId = (i: number): string => `b${i}`;

/**
 * The counter, high-order bit first.
 *
 * This is the one structure on the site that is 0-indexed, because the book's
 * counter is: `A[0]` is the low-order bit and `A[i]` is worth 2^i, and
 * renumbering it from 1 would break the only arithmetic that matters here.
 */
function snapshot(A: number[]): CellsData {
  const cells = [];
  for (let i = K - 1; i >= 0; i--) cells.push({ id: bitId(i), value: A[i]!, label: i });
  return { kind: 'cells', rows: [{ label: 'A', cells }] };
}

/** The value the counter is showing. */
function valueOf(A: number[]): number {
  return A.reduce((sum, bit, i) => sum + bit * 2 ** i, 0);
}

/**
 * Every bit the next increment will write: the run of low-order 1s it has to
 * clear, and the 0 above them that it sets. Bracketing them is the price of
 * the increment, shown before it is paid, and it is the same run from the
 * first step of the increment to the last.
 */
function willFlip(A: number[]): string[] {
  const ids: string[] = [];
  let i = 0;
  for (; i < K && A[i] === 1; i++) ids.push(bitId(i));
  if (i < K) ids.push(bitId(i));
  return ids;
}

export function record(input: number[]): Trace {
  // The input is the *number of increments* — there is nothing else to vary
  // about a counter that starts at zero. `size` reports it back, so the
  // slider and the readout still say what the reader set.
  const times = Math.max(1, Math.round(input[0] ?? 1));
  const A = Array.from({ length: K }, () => 0);

  const { steps, stats, emit } = createRecorder();
  const cells = () => snapshot(A);
  /** The value on the counter, and what this increment has cost so far. */
  const chips = (cost: number) => ({
    count: auxOf([null, valueOf(A), cost], 2, [null, 'value', 'flips']),
  });

  for (let t = 0; t < times; t++) {
    const run = willFlip(A);
    const ones = run.length - 1;
    // The run is exactly what this increment will flip, so its width is the
    // cost — the overflow case included, where every bit is cleared and none
    // is set. Saying so on the bracket puts the chapter's point on screen:
    // the expensive increments are visibly the rare ones.
    const priced = {
      scope: run,
      scopeLabel: `${run.length} flip${run.length === 1 ? '' : 's'}`,
    };
    let cost = 0;
    let i = 0;

    emit(
      'INCREMENT',
      1,
      cells(),
      { ...priced, pointers: { i: bitId(0) }, aux: chips(0) },
      ones === 0
        ? `INCREMENT number ${t + 1}. A[0] is 0, so this one costs a single flip.`
        : `INCREMENT number ${t + 1}. ${ones} low-order 1${ones === 1 ? '' : 's'} to clear before a 0 can be set.`,
    );

    while (i < K && A[i] === 1) {
      stats.comparisons++;
      emit(
        'INCREMENT',
        2,
        cells(),
        { ...priced, look: bitId(i), pointers: { i: bitId(i) }, aux: chips(cost) },
        `A[${i}] is 1, so the loop body runs: this bit has to be carried out of.`,
      );

      A[i] = 0;
      stats.writes++;
      cost++;
      emit(
        'INCREMENT',
        3,
        cells(),
        { ...priced, move: bitId(i), pointers: { i: bitId(i) }, aux: chips(cost) },
        `A[${i}] = 0. Flip ${cost} of this increment, and ${stats.writes} of the run so far.`,
      );

      i++;
      emit(
        'INCREMENT',
        4,
        cells(),
        { ...priced, ...(i < K ? { pointers: { i: bitId(i) } } : {}), aux: chips(cost) },
        i < K
          ? `i = ${i}. The carry moves up to A[${i}], which is worth ${2 ** i}.`
          : `i = ${i}. That was the top bit — there is nowhere left for the carry to go.`,
      );
    }

    stats.comparisons++;
    emit(
      'INCREMENT',
      5,
      cells(),
      {
        ...priced,
        ...(i < K ? { look: bitId(i), pointers: { i: bitId(i) } } : {}),
        aux: chips(cost),
      },
      i < K
        ? `A[${i}] is 0, so the loop stopped here. One more flip and the increment is done.`
        : `i = ${K}: every bit was 1. The counter overflows, and the high-order carry is dropped.`,
    );

    if (i < K) {
      A[i] = 1;
      stats.writes++;
      cost++;
      emit(
        'INCREMENT',
        6,
        cells(),
        { ...priced, move: bitId(i), pointers: { i: bitId(i) }, aux: chips(cost) },
        `A[${i}] = 1. The counter reads ${valueOf(A)}, and this increment cost ${cost} flip${cost === 1 ? '' : 's'}.`,
      );
    }
  }

  return { steps, output: { increments: times, flips: stats.writes, value: valueOf(A) } };
}

/** The input is one number: how many times to increment. */
function generate(n: number): number[] {
  return [Math.max(1, Math.min(n, 64))];
}

function parse(text: string): ParsedInput {
  const v = Number(text.trim());
  if (!Number.isInteger(v) || v < 1 || v > 64) {
    return { error: 'Give a whole number of increments, from 1 to 64.' };
  }
  return { value: [v] };
}

export const binaryCounter: AlgorithmModule = {
  id: 'binary-counter',
  name: 'Binary Counter (INCREMENT)',
  visualizer: 'cells',
  aux: [
    { key: 'count', label: 'A', hint: 'what the counter reads, and what this increment has cost' },
  ],
  procOrder: ['INCREMENT'],
  procedures: {
    INCREMENT: {
      title: 'INCREMENT(A, k)',
      indent: [0, 0, 1, 1, 0, 1],
      lines: [
        'i = 0',
        'while i < k and A[i] == 1',
        'A[i] = 0',
        'i = i + 1',
        'if i < k',
        'A[i] = 1',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(1)',
    worst: 'Θ(k)',
    space: 'Θ(k)',
    extra: [
      ['Amortised per INCREMENT', 'O(1) — under 2 flips'],
      ['n increments', 'less than 2n flips, always'],
      ['Why', 'A[i] flips ⌊n/2^i⌋ times'],
      ['Worst single call', 'k flips, from 0111…1'],
      ['This counter', 'k = 5, so it wraps at 32'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 40,
    noun: 'run',
    placeholder: '16',
    note: 'how many times to increment',
    label: 'How many times to increment the counter, as a single number',
    generate,
    parse,
    // The size of this input is the number it holds, not the length of the
    // list holding it — the slider sets a count of operations, not a size.
    size: (value: number[]) => Math.max(1, Math.round(value[0] ?? 1)),
  },
  defaultSize: 12,
  result: {
    // There is no array and nothing is sorted. The claim worth checking is
    // the chapter's own: the counter reads what it should, and the whole run
    // of n increments cost fewer than 2n flips — the aggregate bound itself,
    // asserted on every generated input rather than argued in prose.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const times = Math.max(1, Math.round(input[0] ?? 1));
      const flips = trace.output?.flips ?? -1;
      const value = trace.output?.value ?? -1;

      if (value !== times % 2 ** K) {
        return `after ${times} increments the counter reads ${value}, expected ${times % 2 ** K}`;
      }
      if (flips >= 2 * times) {
        return `${times} increments cost ${flips} flips, which is not under the 2n = ${2 * times} the aggregate bound promises`;
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'cells') return 'the last step carries no cells snapshot';
      const bits = last.data.rows[0]!.cells.map((c) => c.value as number);
      // Drawn high-order first, so reading left to right is reading the number.
      const shown = bits.reduce((acc, bit) => acc * 2 + bit, 0);
      if (shown !== value) return `the counter draws ${shown} but reports ${value}`;
      return null;
    },
  },
  record,
};
