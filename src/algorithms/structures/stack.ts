import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type CellsData,
  type Trace,
} from '../types.ts';

/**
 * STACK — CLRS §10.1.4: PUSH, POP and STACK-EMPTY on an array.
 *
 * The stack lives in an array S[1‥n], exactly as the book implements it, so
 * the interesting thing to watch is the gap between *the array* and *the
 * stack*: POP does not erase anything. It decrements `S.top`, and the value
 * stays sitting in the array outside the stack until a later PUSH overwrites
 * it. That is what Figure 10.1(c) shows, and it is the reason this is drawn
 * as cells rather than bars — the boundary is the lesson, not the values.
 *
 * The run pushes every input value, then pops them all, which is the shortest
 * demonstration that a stack hands things back in reverse.
 */

/** The array is 1-indexed like the book; index 0 is an unused dummy. */
function snapshot(S: Array<number | null>): CellsData {
  return {
    kind: 'cells',
    rows: [
      {
        label: 'S',
        cells: S.slice(1).map((value, i) => ({ id: `s${i + 1}`, value, label: i + 1 })),
      },
    ],
  };
}

export function record(input: number[]): Trace {
  const n = input.length;
  const S: Array<number | null> = [null, ...Array<number | null>(n).fill(null)];
  let top = 0;

  const { steps, stats, emit } = createRecorder();

  /** Ids of the slots currently inside the stack — S[1‥top]. */
  const inStack = () => Array.from({ length: top }, (_, i) => `s${i + 1}`);
  /** Where `S.top` is pointing, or nothing at all when the stack is empty. */
  const topPointer = () => (top > 0 ? { 'S.top': `s${top}` } : {});
  const base = () => ({ scope: inStack(), pointers: topPointer(), mark: top > 0 ? `s${top}` : '' });

  for (const x of input) {
    stats.comparisons++;
    emit(
      'PUSH',
      1,
      snapshot(S),
      { ...base(), aux: { x: auxOf([null, x], 1) } },
      `PUSH(S, ${x}). S.top = ${top} and the array holds ${n} slots, so there is room.`,
    );

    top = top + 1;
    emit(
      'PUSH',
      3,
      snapshot(S),
      { ...base(), aux: { x: auxOf([null, x], 1) } },
      `S.top = ${top}. The slot is claimed, but nothing has been written into it yet.`,
    );

    S[top] = x;
    stats.writes++;
    emit(
      'PUSH',
      4,
      snapshot(S),
      { ...base(), writing: `s${top}`, pushed: x, aux: { x: auxOf([null, x], 1) } },
      `S[${top}] = ${x}. It is now the top of the stack.`,
    );
  }

  emit(
    'PUSH',
    4,
    snapshot(S),
    base(),
    `All ${n} values are on the stack. Now take them off again.`,
  );

  while (top > 0) {
    stats.comparisons++;
    emit(
      'STACK-EMPTY',
      1,
      snapshot(S),
      base(),
      `POP calls STACK-EMPTY: S.top = ${top}, which is not 0.`,
    );
    emit('STACK-EMPTY', 3, snapshot(S), base(), `Not empty, so POP may go ahead.`);

    const returned = S[top] as number;
    top = top - 1;
    emit(
      'POP',
      3,
      snapshot(S),
      { ...base(), look: `s${top + 1}` },
      `S.top = ${top}. Slot ${top + 1} is outside the stack now — but ${returned} is still sitting in it.`,
    );

    emit(
      'POP',
      4,
      snapshot(S),
      { ...base(), look: `s${top + 1}`, popped: returned },
      `Return S[${top + 1}] = ${returned}. Nothing was erased; only the boundary moved.`,
    );
  }

  stats.comparisons++;
  emit(
    'STACK-EMPTY',
    2,
    snapshot(S),
    base(),
    `S.top = 0, so STACK-EMPTY returns TRUE. Every value is still in the array, and none of them is in the stack.`,
  );

  return { steps, output: { pushes: n, pops: n, top } };
}

export const stack: AlgorithmModule = {
  id: 'stack',
  name: 'Stack (PUSH and POP)',
  visualizer: 'cells',
  aux: [{ key: 'x', label: 'x', hint: 'the value PUSH is holding, not yet in the array' }],
  procOrder: ['PUSH', 'POP', 'STACK-EMPTY'],
  procedures: {
    PUSH: {
      title: 'PUSH(S, x)',
      indent: [0, 1, 0, 1],
      lines: ['if S.top == S.size', 'error "overflow"', 'else S.top = S.top + 1', 'S[S.top] = x'],
    },
    POP: {
      title: 'POP(S)',
      indent: [0, 1, 0, 1],
      lines: [
        'if STACK-EMPTY(S)',
        'error "underflow"',
        'else S.top = S.top - 1',
        'return S[S.top + 1]',
      ],
    },
    'STACK-EMPTY': {
      title: 'STACK-EMPTY(S)',
      indent: [0, 1, 0],
      lines: ['if S.top == 0', 'return TRUE', 'else return FALSE'],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(1)',
    worst: 'Θ(1)',
    space: 'Θ(n)',
    extra: [
      ['PUSH', 'Θ(1)'],
      ['POP', 'Θ(1)'],
      ['STACK-EMPTY', 'Θ(1)'],
      ['Order', 'LIFO — last in, first out'],
    ],
  },
  input: {
    min: 1,
    max: 99,
    maxSize: 16,
    noun: 'stack',
    placeholder: '17, 3, 5',
    note: 'pushed left to right',
    label: 'The values to push, in order, separated by commas',
  },
  defaultSize: 8,
  result: {
    // Nothing is sorted, permuted or preserved here: there is no output array
    // at all, only a sequence of operations. What must hold is LIFO.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const pushed: number[] = [];
      const popped: number[] = [];
      for (const step of trace.steps) {
        const hi = step.hi as { pushed?: unknown; popped?: unknown };
        if (typeof hi.pushed === 'number') pushed.push(hi.pushed);
        if (typeof hi.popped === 'number') popped.push(hi.popped);
      }
      if (JSON.stringify(pushed) !== JSON.stringify(input)) {
        return `pushed ${JSON.stringify(pushed)}, expected the input in order`;
      }
      const expected = [...input].reverse();
      if (JSON.stringify(popped) !== JSON.stringify(expected)) {
        return `popped ${JSON.stringify(popped)}, but a stack must hand them back reversed: ${JSON.stringify(expected)}`;
      }
      return null;
    },
  },
  record,
};
