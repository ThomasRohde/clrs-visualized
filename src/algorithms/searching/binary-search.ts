import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * BINARY-SEARCH — CLRS Exercise 2.3-6.
 *
 * Tier 2 by this site's rule (an exercise, not a numbered section), and the
 * first row promoted out of the backlog because three chapters that *are* Tier
 * 1 lean on it and none of them has a picture of one: chapter 12 opens by
 * comparing a BST against it, chapter 26's P-MERGE binary-searches for the
 * split point, and chapter 32's suffix array ends on two of them.
 *
 * **The bounds are `p` and `r` and the midpoint is `q`**, which is what
 * MERGE-SORT calls them on the same page — its line `q = ⌊(p+r)/2⌋` is
 * character-for-character line 4 below. That is the chapter's point made in
 * the notation: same split, one half instead of two. It is also the practical
 * choice, since `array-bars` has exactly two label lanes and `low`/`mid`/`high`
 * over three adjacent bars overprint at the narrow breakpoint.
 *
 * **The input packs the target in front of the array**, `[v, A[1], ‥, A[n]]`,
 * which is the idiom chapter 35's set cover and chapter 16's binary counter
 * already use for a parameter that is not a list element. The alternative was
 * deriving the target from the array the way RANDOMIZED-SELECT derives its
 * order statistic — but every target derived from the array is *in* the array,
 * and a binary search that always succeeds never draws the interval closing on
 * nothing, which is half of what the exercise is about.
 *
 * **Do not put the bounds in `hi` under their own names.** `rolesForStep`
 * already reads `r` as merge's right-hand index and paints it `look`, so
 * emitting the search's right bound as `hi.r` quietly painted the last bar of
 * the interval as though it were being read. The bracket and the markers both
 * take the bounds from `hi.range`; only `q` needs a key of its own.
 */
export function record(input: number[]): Trace {
  const target = input[0] ?? 0;
  const values = input.slice(1);
  const A: Array<number | null> = [null, ...values];
  const n = values.length;
  const { steps, stats, emit } = createRecorder();
  const P = 'BINARY-SEARCH';

  /**
   * The aux row, refilled on every step.
   *
   * `v` is not in the array — it is the thing being looked for — so it gets
   * the chip treatment insertion sort's `key` gets. Every step fills it: a row
   * that came and went would shift the transport under it as the reader steps.
   */
  const held = () => ({ v: auxOf([null, target], 1) });

  /** Everything outside `p‥r` has been ruled out, and is painted `done`. */
  const ruledOut = (p: number, r: number) => ({ sortedUpTo: p - 1, sortedFrom: r + 1 });

  let p = 1;
  emit(P, 1, A, { ...ruledOut(1, n), range: n >= 1 ? [1, n] : undefined, aux: held() }, `p = 1.`);

  let r = n;
  emit(
    P,
    2,
    A,
    { ...ruledOut(p, r), range: n >= 1 ? [p, r] : undefined, aux: held() },
    `r = ${n} — the whole array is still in play, and v = ${target} is what we are looking for.`,
  );

  let answer = 0;
  let iterations = 0;

  while (true) {
    const live = p <= r;
    emit(
      P,
      3,
      A,
      { ...ruledOut(p, r), range: live ? [p, r] : undefined, aux: held() },
      live
        ? `p = ${p} ≤ r = ${r}: ${r - p + 1} element${r - p === 0 ? '' : 's'} left to search.`
        : `p = ${p} > r = ${r}: the interval is empty, so v = ${target} is not in the array.`,
    );
    if (!live) break;

    iterations++;
    const q = Math.floor((p + r) / 2);
    const frame = { ...ruledOut(p, r), range: [p, r], aux: held(), q };

    emit(
      P,
      4,
      A,
      { ...frame, compare: [q] },
      `q = ⌊(${p} + ${r}) / 2⌋ = ${q}. Look at A[${q}] = ${A[q]}.`,
    );

    stats.comparisons++;
    const hit = A[q] === target;
    emit(
      P,
      5,
      A,
      { ...frame, compare: [q] },
      hit ? `v = ${target} equals A[${q}] — found it.` : `v = ${target} is not A[${q}] = ${A[q]}.`,
    );

    if (hit) {
      answer = q;
      emit(
        P,
        6,
        A,
        { ...frame, pivot: q },
        `Return ${q}: A[${q}] = ${target}, found in ${iterations} iteration${
          iterations === 1 ? '' : 's'
        }.`,
      );
      break;
    }

    stats.comparisons++;
    const goRight = target > (A[q] as number);
    emit(
      P,
      7,
      A,
      { ...frame, compare: [q] },
      goRight
        ? `v = ${target} > A[${q}] = ${A[q]}, so v can only be to the right of ${q}.`
        : `v = ${target} < A[${q}] = ${A[q]}, so v can only be to the left of ${q}.`,
    );

    if (goRight) {
      p = q + 1;
      emit(
        P,
        8,
        A,
        { ...ruledOut(p, r), range: p <= r ? [p, r] : undefined, aux: held() },
        `p = ${q} + 1 = ${p}. A[1‥${q}] is ruled out — half the remaining interval, gone on one comparison.`,
      );
    } else {
      r = q - 1;
      emit(
        P,
        9,
        A,
        { ...ruledOut(p, r), range: p <= r ? [p, r] : undefined, aux: held() },
        `r = ${q} − 1 = ${r}. A[${q}‥${n}] is ruled out — half the remaining interval, gone on one comparison.`,
      );
    }
  }

  if (answer === 0) {
    emit(
      P,
      10,
      A,
      { ...ruledOut(p, r), aux: held() },
      `Return NIL. v = ${target} is not in the array, and ${iterations} comparison${
        iterations === 1 ? '' : 's'
      } proved it about all ${n}.`,
    );
  }

  return { steps, finalArray: values, output: { answer, iterations, n, target } };
}

/** Sorted, distinct, and spaced so that a value strictly between two exists. */
function sortedValues(n: number): number[] {
  const out: number[] = [];
  let v = 2 + Math.floor(Math.random() * 6);
  for (let i = 0; i < n; i++) {
    out.push(v);
    v += 2 + Math.floor(Math.random() * 5);
  }
  return out;
}

export const binarySearch: AlgorithmModule = {
  id: 'binary-search',
  name: 'Binary Search',
  visualizer: 'array-bars',
  defaultSize: 15,
  aux: [{ key: 'v', label: 'v', hint: 'the value being searched for — not in the array' }],
  input: {
    minSize: 4,
    maxSize: 31,
    noun: 'array',
    note: 'sorted, distinct keys · the target v is drawn separately',
    placeholder: '23 : 4,9,15,23,31,40',
    label: 'A target, a colon, then the sorted values to search for it in.',
    /**
     * Half the generated targets are absent, by an honest coin rather than a
     * rule tied to `n`: the reader should be able to press Randomize and see
     * both endings, and the unsuccessful search is the one that shows the
     * interval closing to nothing.
     */
    generate(n: number): number[] {
      const values = sortedValues(Math.max(1, n));
      const at = Math.floor(Math.random() * values.length);
      // `+ 1` lands strictly between two neighbours, since the values are
      // spaced by at least two — an absent target genuinely inside the array's
      // range, rather than one the first comparison disposes of.
      const target = Math.random() < 0.5 ? values[at]! : values[at]! + 1;
      return [target, ...values];
    },
    parse(text: string): ParsedInput {
      const [head, tail] = text.includes(':') ? text.split(':') : [null, text];
      const values = (tail ?? '')
        .split(/[\s,]+/)
        .filter((s) => s.length > 0)
        .map(Number);
      if (values.length === 0) return { error: 'Give at least one value to search.' };
      if (values.some((v) => !Number.isFinite(v))) {
        return { error: 'Every value has to be a number.' };
      }
      if (values.some((v) => v <= 0)) {
        return { error: 'Values have to be positive to be drawn as bars.' };
      }
      // Binary search is only correct on a sorted array, so the values are
      // sorted rather than refused: the ordering is the algorithm's
      // precondition, not a chore to hand to the reader.
      values.sort((a, b) => a - b);
      const target = head === null ? values[Math.floor(values.length / 2)]! : Number(head.trim());
      if (!Number.isFinite(target) || target <= 0) {
        return { error: 'The target before the colon has to be a positive number.' };
      }
      return { value: [target, ...values] };
    },
    size: (input: number[]) => Math.max(0, input.length - 1),
  },
  procOrder: ['BINARY-SEARCH'],
  procedures: {
    'BINARY-SEARCH': {
      title: 'BINARY-SEARCH(A, v)',
      indent: [0, 0, 0, 1, 1, 2, 1, 2, 1, 0],
      lines: [
        'p = 1',
        'r = A.length',
        'while p ≤ r',
        'q = ⌊(p+r)/2⌋',
        'if v == A[q]',
        'return q',
        'elseif v > A[q]',
        'p = q + 1',
        'else r = q - 1',
        'return NIL',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(lg n)',
    worst: 'Θ(lg n)',
    space: 'O(1)',
    extra: [
      ['Requires', 'A sorted in non-decreasing order'],
      ['Iterations', 'at most ⌊lg n⌋ + 1 — the interval halves every time'],
    ],
  },
  result: {
    // The array is a read-only input here, so there is nothing structural to
    // claim: `transforms` plus a verify that checks both halves of the
    // contract — the answer, and the bound the exercise exists to teach.
    kind: 'transforms',
    verify(input: number[], trace: Trace): string | null {
      const target = input[0] ?? 0;
      const values = input.slice(1);
      const answer = trace.output?.answer ?? 0;
      const iterations = trace.output?.iterations ?? 0;

      const expected = values.indexOf(target) + 1;
      if (answer !== expected) {
        return expected === 0
          ? `returned ${answer} for ${target}, which is not in the array`
          : `returned ${answer} for ${target}, expected ${expected}`;
      }
      if (answer !== 0 && values[answer - 1] !== target) {
        return `returned index ${answer}, which holds ${values[answer - 1]}, not ${target}`;
      }
      if (trace.finalArray?.join() !== values.join()) {
        return 'the array was modified — binary search only reads it';
      }

      // The claim the exercise is actually about. An implementation that
      // halved less than perfectly would still find the key, and would still
      // pass every check above.
      const bound = values.length === 0 ? 0 : Math.floor(Math.log2(values.length)) + 1;
      if (iterations > bound) {
        return `took ${iterations} iterations on ${values.length} elements, above the ⌊lg n⌋ + 1 = ${bound} bound`;
      }
      return null;
    },
  },
  record,
};
