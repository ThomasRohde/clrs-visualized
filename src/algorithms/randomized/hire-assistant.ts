import { createRecorder, type AlgorithmModule, type Trace } from '../types.ts';

/**
 * HIRE-ASSISTANT — CLRS §5.1.
 *
 * The chapter opens with a procedure that does almost nothing: interview each
 * candidate in turn, and hire whoever is the best so far. Interviewing is
 * cheap; hiring is expensive. The question the chapter is really asking is how
 * many times line 6 runs.
 *
 * Every input costs exactly n interviews, so the running time is not what
 * varies — the number of hires is. In the worst case (candidates arriving in
 * increasing order of quality) it is n; on a random order it is only about
 * ln n. The array is read and never written, so the bars never move: the whole
 * story is in the counters and in which bar is currently marked.
 */
export function record(input: number[]): Trace {
  const A: Array<number | null> = [null, ...input];
  const n = input.length;
  const { steps, stats, emit } = createRecorder();
  const P = 'HIRE-ASSISTANT';

  let best = 0;
  let hires = 0;
  emit(
    P,
    1,
    A,
    {},
    `best = 0 — a fictional candidate 0 who is worse than everyone, so the first real one is always hired.`,
  );

  for (let i = 1; i <= n; i++) {
    emit(
      P,
      2,
      A,
      { i, reading: i, marks: best >= 1 ? [best] : [], best: best >= 1 ? best : undefined },
      `for i = 1 to ${n}`,
    );
    emit(
      P,
      3,
      A,
      { i, reading: i, marks: best >= 1 ? [best] : [], best: best >= 1 ? best : undefined },
      `Interview candidate ${i}, quality ${A[i]}. Interviewing is the cheap part.`,
    );

    stats.comparisons++;
    const better = best === 0 || (A[i] as number) > (A[best] as number);
    emit(
      P,
      4,
      A,
      {
        i,
        compare: best >= 1 ? [i, best] : [i],
        marks: best >= 1 ? [best] : [],
        best: best >= 1 ? best : undefined,
      },
      best === 0
        ? `Candidate ${i} beats the fictional candidate 0 by definition.`
        : `Is candidate ${i} (${A[i]}) better than the current assistant, candidate ${best} (${A[best]})? ${better ? 'Yes.' : 'No.'}`,
    );

    if (better) {
      best = i;
      emit(P, 5, A, { i, marks: [best], best }, `best = ${i}.`);
      hires++;
      stats.writes++;
      emit(
        P,
        6,
        A,
        { i, marks: [best], best },
        `Hire candidate ${i}. That is hire number ${hires} — the expensive line.`,
      );
    }
  }

  emit(
    P,
    6,
    A,
    { marks: [best], best },
    `${n} interviews and ${hires} hire${hires === 1 ? '' : 's'}. The final assistant is candidate ${best}, the best of the lot — that part never varies. Only the cost does.`,
  );

  return { steps, finalArray: A.slice(1) as number[], output: { hires, best } };
}

export const hireAssistant: AlgorithmModule = {
  id: 'hire-assistant',
  name: 'Hire Assistant',
  visualizer: 'array-bars',
  procOrder: ['HIRE-ASSISTANT'],
  procedures: {
    'HIRE-ASSISTANT': {
      title: 'HIRE-ASSISTANT(n)',
      indent: [0, 0, 1, 1, 2, 2],
      lines: [
        'best = 0    // least-qualified fictional candidate',
        'for i = 1 to n',
        'interview candidate i',
        'if candidate i is better than candidate best',
        'best = i',
        'hire candidate i',
      ],
    },
  },
  complexity: {
    best: 'Θ(n) interviews, 1 hire',
    average: 'Θ(n) interviews, Θ(ln n) hires',
    worst: 'Θ(n) interviews, n hires',
    space: 'Θ(1)',
    extra: [
      ['Worst case is', 'candidates in increasing quality'],
      ['Expected hires', 'Hₙ ≈ ln n + 0.577'],
      ['Probability candidate i is hired', '1 / i'],
    ],
  },
  result: {
    // Nothing is written to the array — the answer is a count, not an order.
    kind: 'preserves',
    verify: (input: number[], trace) => {
      const hires = trace.output?.hires ?? 0;
      const best = trace.output?.best ?? 0;
      const expected = input.indexOf(Math.max(...input)) + 1;
      if (input[best - 1] !== Math.max(...input)) {
        return `ended with candidate ${best} (quality ${input[best - 1]}), but the best is candidate ${expected}`;
      }
      if (hires < 1 || hires > input.length) {
        return `made ${hires} hires, which is outside 1‥${input.length}`;
      }
      return null;
    },
  },
  record,
};
