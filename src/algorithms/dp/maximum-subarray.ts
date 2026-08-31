import { auxOf, createRecorder, fmt, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * MAX-SUBARRAY — CLRS Problem 4-1, and §4.1 of the third edition.
 *
 * The fourth edition demoted the maximum-subarray problem from a numbered
 * section to a problem, which is why chapter 4 is matrix work on this site and
 * why this is Tier 2. It is still the clearest small divide-and-conquer in the
 * book, and it is the one that makes the *shape* of divide-and-conquer visible:
 * the answer either lies in the left half, or in the right half, or it crosses
 * the midpoint — and only the third case needs any work.
 *
 * **This player runs two algorithms on one input, and that is the point.**
 * The divide-and-conquer answer arrives in Θ(n lg n); the scan that follows it
 * arrives at the same answer in Θ(n). Compare the two halves of the trace tape.
 *
 * **It is also what E8 exists for.** The problem is trivial unless the input
 * has negative numbers in it — with everything positive the answer is always
 * the whole array — and until E8 a negative value drew as a 3px stub
 * indistinguishable from an ∞ sentinel.
 *
 * Two transcription notes. The bounds are `p`, `q`, `r` rather than the book's
 * `low`, `mid`, `high`: every other divide-and-conquer on this site names them
 * that way, and `array-bars` has two marker lanes, which three-letter labels
 * over adjacent bars overflow. And MAX-CROSSING-SUBARRAY pairs the assignments
 * CLRS puts on separate lines, which takes its two symmetric loops from
 * fifteen lines to eleven without losing a step.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const PM = 'MAX-SUBARRAY';
  const PC = 'MAX-CROSSING-SUBARRAY';
  const PL = 'MAX-SUBARRAY-LINEAR';

  /** The two running numbers, shown as chips because neither is in the array. */
  const chips = (sum: number, best: number) => ({
    sum: auxOf([null, sum], 1),
    best: auxOf([null, best], 1),
  });

  /** Every index of a subarray, for `marks` and `doneSet`. */
  const spanOf = (lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (let k = lo; k <= hi; k++) out.push(k);
    return out;
  };

  interface Answer {
    lo: number;
    hi: number;
    sum: number;
  }

  function crossing(p: number, q: number, r: number): Answer {
    let leftSum = -Infinity;
    let sum = 0;
    let maxLeft = q;
    emit(
      PC,
      1,
      A,
      { range: [p, r], q, aux: chips(0, leftSum) },
      `Look for the best subarray ending at ${q}: start with nothing and a sum of −∞.`,
    );

    for (let i = q; i >= p; i--) {
      sum += A[i] as number;
      stats.comparisons++;
      emit(
        PC,
        3,
        A,
        { range: [p, r], q, i, compare: [i], marks: spanOf(i, q), aux: chips(sum, leftSum) },
        `Extend left to ${i}: A[${i}‥${q}] sums to ${sum}.`,
      );
      if (sum > leftSum) {
        leftSum = sum;
        maxLeft = i;
        emit(
          PC,
          5,
          A,
          { range: [p, r], q, i, marks: spanOf(maxLeft, q), aux: chips(sum, leftSum) },
          `${sum} beats the best so far, so the left part is now A[${maxLeft}‥${q}].`,
        );
      } else {
        emit(
          PC,
          4,
          A,
          { range: [p, r], q, i, marks: spanOf(maxLeft, q), aux: chips(sum, leftSum) },
          `${sum} does not beat ${fmt(leftSum)}, so the left part stays A[${maxLeft}‥${q}].`,
        );
      }
    }

    let rightSum = -Infinity;
    sum = 0;
    let maxRight = q + 1;
    emit(
      PC,
      6,
      A,
      { range: [p, r], q, marks: spanOf(maxLeft, q), aux: chips(0, rightSum) },
      `Now the best subarray starting at ${q + 1}, the same way.`,
    );

    for (let j = q + 1; j <= r; j++) {
      sum += A[j] as number;
      stats.comparisons++;
      emit(
        PC,
        8,
        A,
        {
          range: [p, r],
          q,
          j,
          compare: [j],
          marks: spanOf(maxLeft, j),
          aux: chips(sum, rightSum),
        },
        `Extend right to ${j}: A[${q + 1}‥${j}] sums to ${sum}.`,
      );
      if (sum > rightSum) {
        rightSum = sum;
        maxRight = j;
        emit(
          PC,
          10,
          A,
          {
            range: [p, r],
            q,
            j,
            marks: spanOf(maxLeft, maxRight),
            aux: chips(sum, rightSum),
          },
          `${sum} beats the best so far, so the right part is now A[${q + 1}‥${maxRight}].`,
        );
      } else {
        emit(
          PC,
          9,
          A,
          {
            range: [p, r],
            q,
            j,
            marks: spanOf(maxLeft, maxRight),
            aux: chips(sum, rightSum),
          },
          `${sum} does not beat ${fmt(rightSum)}, so the right part stays A[${q + 1}‥${maxRight}].`,
        );
      }
    }

    const total = leftSum + rightSum;
    emit(
      PC,
      11,
      A,
      { range: [p, r], q, marks: spanOf(maxLeft, maxRight), aux: chips(total, total) },
      `The best crossing subarray is A[${maxLeft}‥${maxRight}], summing to ${total}.`,
    );
    return { lo: maxLeft, hi: maxRight, sum: total };
  }

  function maxSubarray(p: number, r: number): Answer {
    emit(PM, 1, A, { range: [p, r] }, `MAX-SUBARRAY(A, ${p}, ${r}): is this one element?`);
    if (p === r) {
      emit(
        PM,
        2,
        A,
        { range: [p, r], marks: [p], aux: chips(A[p] as number, A[p] as number) },
        `One element: the best subarray of A[${p}‥${p}] is itself, summing to ${A[p]}.`,
      );
      return { lo: p, hi: r, sum: A[p] as number };
    }

    const q = Math.floor((p + r) / 2);
    emit(PM, 3, A, { range: [p, r], q }, `q = ⌊(${p}+${r})/2⌋ = ${q}.`);

    emit(PM, 4, A, { range: [p, q] }, `The answer might lie entirely in A[${p}‥${q}].`);
    const left = maxSubarray(p, q);

    emit(PM, 5, A, { range: [q + 1, r] }, `Or entirely in A[${q + 1}‥${r}].`);
    const right = maxSubarray(q + 1, r);

    emit(
      PM,
      6,
      A,
      { range: [p, r], q },
      `Or it crosses ${q} — and that is the only case the two halves cannot have found.`,
    );
    const cross = crossing(p, q, r);

    stats.comparisons++;
    const best =
      left.sum >= right.sum && left.sum >= cross.sum
        ? { answer: left, line: 8, which: 'the left half' }
        : right.sum >= left.sum && right.sum >= cross.sum
          ? { answer: right, line: 10, which: 'the right half' }
          : { answer: cross, line: 11, which: 'the crossing subarray' };

    emit(
      PM,
      7,
      A,
      {
        range: [p, r],
        q,
        marks: spanOf(best.answer.lo, best.answer.hi),
        aux: chips(best.answer.sum, best.answer.sum),
      },
      `Left ${fmt(left.sum)}, right ${fmt(right.sum)}, crossing ${fmt(cross.sum)}.`,
    );
    emit(
      PM,
      best.line,
      A,
      {
        range: [p, r],
        marks: spanOf(best.answer.lo, best.answer.hi),
        aux: chips(best.answer.sum, best.answer.sum),
      },
      `A[${p}‥${r}]'s best is ${best.which}: A[${best.answer.lo}‥${best.answer.hi}], summing to ${best.answer.sum}.`,
    );
    return best.answer;
  }

  const divided = maxSubarray(1, n);
  emit(
    PM,
    8,
    A,
    {
      range: [1, n],
      doneSet: spanOf(divided.lo, divided.hi),
      aux: chips(divided.sum, divided.sum),
    },
    `Divide and conquer says A[${divided.lo}‥${divided.hi}], summing to ${divided.sum}, after ${stats.comparisons} additions. Now the same question in Θ(n).`,
  );

  // ── Problem 4-1(d): the same answer, one pass ────────────────────────────
  let best = -Infinity;
  let sum = 0;
  let s = 1;
  let bestLo = 1;
  let bestHi = 1;

  emit(PL, 1, A, { aux: chips(0, best) }, `best = −∞: nothing has been seen yet.`);
  emit(
    PL,
    2,
    A,
    { aux: chips(0, best) },
    `sum = 0 — the running total of the subarray ending here.`,
  );
  emit(PL, 3, A, { aux: chips(0, best) }, `s = 1 — where that subarray starts.`);

  for (let j = 1; j <= n; j++) {
    stats.comparisons++;
    const restart = sum < 0;
    emit(
      PL,
      5,
      A,
      { j, compare: [j], marks: spanOf(s, j - 1), aux: chips(sum, best) },
      restart
        ? `sum = ${sum} is negative, so any subarray carrying it forward is worse without it.`
        : `sum = ${sum} is not negative, so it is still worth carrying forward.`,
    );
    if (restart) {
      sum = 0;
      s = j;
      emit(
        PL,
        6,
        A,
        { j, marks: [j], aux: chips(sum, best) },
        `Drop it: start again at ${j} with sum = 0.`,
      );
    }

    sum += A[j] as number;
    emit(
      PL,
      7,
      A,
      { j, compare: [j], marks: spanOf(s, j), aux: chips(sum, best) },
      `Add A[${j}] = ${A[j]}: the best subarray ending at ${j} is A[${s}‥${j}], summing to ${sum}.`,
    );

    stats.comparisons++;
    if (sum > best) {
      best = sum;
      bestLo = s;
      bestHi = j;
      emit(
        PL,
        9,
        A,
        { j, marks: spanOf(bestLo, bestHi), aux: chips(sum, best) },
        `${sum} is the best seen anywhere so far: A[${bestLo}‥${bestHi}].`,
      );
    } else {
      emit(
        PL,
        8,
        A,
        { j, marks: spanOf(bestLo, bestHi), aux: chips(sum, best) },
        `${sum} does not beat ${best}, so the answer is still A[${bestLo}‥${bestHi}].`,
      );
    }
  }

  emit(
    PL,
    10,
    A,
    { doneSet: spanOf(bestLo, bestHi), aux: chips(best, best) },
    `One pass gives A[${bestLo}‥${bestHi}], summing to ${best} — the same answer, in Θ(n).`,
  );

  return {
    steps,
    finalArray: input,
    output: { lo: divided.lo, hi: divided.hi, sum: divided.sum, linearSum: best, n },
  };
}

/** Every subarray, summed — the Θ(n²) definition of the answer. */
function bruteForce(values: number[]): number {
  let best = -Infinity;
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let j = i; j < values.length; j++) {
      sum += values[j]!;
      if (sum > best) best = sum;
    }
  }
  return best;
}

export const maximumSubarray: AlgorithmModule = {
  id: 'maximum-subarray',
  name: 'Maximum Subarray',
  visualizer: 'array-bars',
  defaultSize: 10,
  aux: [
    { key: 'sum', label: 'sum', hint: 'the subarray being extended right now' },
    { key: 'best', label: 'best', hint: 'the best sum this call has found' },
  ],
  input: {
    // The problem is trivial without them: with every value positive the
    // answer is always the whole array. This is the range E8 exists to draw.
    min: -35,
    max: 40,
    minSize: 4,
    maxSize: 16,
    note: 'values from −35 to 40 — the problem needs negatives to be interesting',
    placeholder: '13,-3,-25,20,-3,-16,-23,18',
  },
  procOrder: ['MAX-SUBARRAY', 'MAX-CROSSING-SUBARRAY', 'MAX-SUBARRAY-LINEAR'],
  procedures: {
    'MAX-SUBARRAY': {
      title: 'MAX-SUBARRAY(A, p, r)',
      indent: [0, 1, 0, 1, 1, 1, 1, 2, 1, 2, 2],
      lines: [
        'if p == r',
        'return (p, r, A[p])',
        'else q = ⌊(p+r)/2⌋',
        '(l-lo, l-hi, l-sum) = MAX-SUBARRAY(A, p, q)',
        '(r-lo, r-hi, r-sum) = MAX-SUBARRAY(A, q+1, r)',
        '(c-lo, c-hi, c-sum) = MAX-CROSSING-SUBARRAY(A, p, q, r)',
        'if l-sum ≥ r-sum and l-sum ≥ c-sum',
        'return (l-lo, l-hi, l-sum)',
        'elseif r-sum ≥ l-sum and r-sum ≥ c-sum',
        'return (r-lo, r-hi, r-sum)',
        'else return (c-lo, c-hi, c-sum)',
      ],
    },
    'MAX-CROSSING-SUBARRAY': {
      title: 'MAX-CROSSING-SUBARRAY(A, p, q, r)',
      indent: [0, 0, 1, 1, 2, 0, 0, 1, 1, 2, 0],
      lines: [
        'l-sum = -∞;  sum = 0',
        'for i = q downto p',
        'sum = sum + A[i]',
        'if sum > l-sum',
        'l-sum = sum;  max-left = i',
        'r-sum = -∞;  sum = 0',
        'for j = q+1 to r',
        'sum = sum + A[j]',
        'if sum > r-sum',
        'r-sum = sum;  max-right = j',
        'return (max-left, max-right, l-sum + r-sum)',
      ],
    },
    'MAX-SUBARRAY-LINEAR': {
      title: 'MAX-SUBARRAY-LINEAR(A)   ▸ Problem 4-1(d)',
      indent: [0, 0, 0, 0, 1, 2, 1, 1, 2, 0],
      lines: [
        'best = -∞',
        'sum = 0',
        's = 1',
        'for j = 1 to A.length',
        'if sum < 0',
        'sum = 0;  s = j',
        'sum = sum + A[j]',
        'if sum > best',
        'best = sum;  (b-lo, b-hi) = (s, j)',
        'return (b-lo, b-hi, best)',
      ],
    },
  },
  complexity: {
    best: 'Θ(n lg n)',
    average: 'Θ(n lg n)',
    worst: 'Θ(n lg n)',
    space: 'Θ(lg n) — the recursion stack',
    inPlace: 'Yes — it only reads',
    extra: [
      ['Recurrence', 'T(n) = 2T(n/2) + Θ(n), the same one merge sort has'],
      ['Problem 4-1(d)', 'Θ(n) in one pass, which this player runs afterwards'],
      ['Needs', 'negative values — otherwise the answer is the whole array'],
    ],
  },
  result: {
    // Nothing is written, so there is no structural claim to make; the two
    // answers and the value they agree on are the contract.
    kind: 'preserves',
    verify(input: number[], trace: Trace): string | null {
      const expected = bruteForce(input);
      const { sum, linearSum, lo, hi } = (trace.output ?? {}) as Record<string, number>;

      if (sum !== expected) {
        return `divide and conquer returned ${sum}, but the best subarray sums to ${expected}`;
      }
      // Problem 4-1(d) has to agree with 4-1's own algorithm, and that is a
      // real check rather than a formality: the two are unrelated routes to
      // the answer, and the linear one is the easy one to get subtly wrong.
      if (linearSum !== expected) {
        return `the linear scan returned ${linearSum}, but the best subarray sums to ${expected}`;
      }
      // The indices have to name a subarray that actually sums to the answer —
      // a run that merely reports the right total is not a located answer.
      let actual = 0;
      for (let k = lo!; k <= hi!; k++) actual += input[k - 1]!;
      if (actual !== expected) {
        return `reported A[${lo}‥${hi}], which sums to ${actual}, not ${expected}`;
      }
      return null;
    },
  },
  record,
};
