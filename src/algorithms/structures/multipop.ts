import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type Cell,
  type CellsData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * MULTIPOP — CLRS §16.1–16.3: a stack with one extra operation, and the
 * example all three analysis methods are demonstrated on.
 *
 * `MULTIPOP(S, k)` pops the top k objects, or empties the stack if it holds
 * fewer. A single call can cost Θ(n), so the worst-case-per-operation
 * argument gives O(n²) for a sequence of n operations — and that is wrong by
 * a factor of n. **An object can only be popped once, and it has to be pushed
 * before it can be popped**, so the pops over the whole sequence cannot
 * outnumber the pushes. n operations cost at most 2n.
 *
 * The other two methods say the same thing in the two ways the chapter
 * introduces, and both are on screen here:
 *
 * - **Accounting:** charge 2 for a push — one for the push itself, one left
 *   on that object as credit — and 0 for a pop, which spends the credit its
 *   own object is carrying. Credit is never negative, so the charges are an
 *   upper bound.
 * - **Potential:** Φ is the number of objects on the stack, which is exactly
 *   the width of the bracket. A push raises it by one and costs 2 amortised;
 *   a MULTIPOP of k' objects lowers it by k' and costs 0.
 *
 * The strip above the stack carries the accounting: what this operation
 * actually cost, what Φ is now, and the amortised cost ĉ = c + ΔΦ that the
 * two agree on.
 *
 * The input is a sequence of operations rather than a list of values: a
 * positive number pushes it, and −k is MULTIPOP(S, k).
 */

const slotId = (i: number): string => `s${i}`;

/** The array is 1-indexed like the book; index 0 is an unused dummy. */
function snapshot(S: Array<number | null>): CellsData {
  const cells: Cell[] = S.slice(1).map((value, i) => ({ id: slotId(i + 1), value, label: i + 1 }));
  return { kind: 'cells', rows: [{ label: 'S', cells }] };
}

/** How tall the stack ever gets, so the array can be drawn at that size from the start. */
export function tallest(ops: number[]): number {
  let top = 0;
  let peak = 1;
  for (const op of ops) {
    if (op > 0) top++;
    else top = Math.max(0, top + op);
    peak = Math.max(peak, top);
  }
  return peak;
}

export function record(input: number[]): Trace {
  const size = tallest(input);
  const S: Array<number | null> = [null, ...Array<number | null>(size).fill(null)];
  let top = 0;

  const { steps, stats, emit } = createRecorder();
  const cells = () => snapshot(S);
  /**
   * The cost the chapter counts: one per push and one per pop, which is not
   * what any of the three `stats` counters tracks — `comparisons` also counts
   * the loop test that ends a MULTIPOP, and the bound being checked is about
   * pushes and pops alone.
   */
  let charged = 0;

  /** S[1‥top] — the objects actually in the stack, and so also the potential. */
  const inStack = () => Array.from({ length: top }, (_, i) => slotId(i + 1));
  const base = () => ({
    scope: inStack(),
    scopeLabel: `Φ = ${top}`,
    ...(top > 0 ? { mark: slotId(top), pointers: { 'S.top': slotId(top) } } : {}),
  });
  /**
   * What this operation has cost so far, the potential now, and the amortised
   * cost — which is only known once the operation is over, so it stays empty
   * until the step that finishes it.
   */
  const chips = (cost: number, amortized: number | null) => ({
    ledger: auxOf([null, cost, top, amortized, charged], 1, [null, 'cost', 'Φ', 'ĉ', 'total']),
  });

  for (const op of input) {
    if (op > 0) {
      const before = top;
      stats.comparisons++;
      emit(
        'PUSH',
        1,
        cells(),
        { ...base(), aux: chips(0, null) },
        `PUSH(S, ${op}). The stack holds ${top}, so there is room.`,
      );

      top++;
      charged++;
      emit(
        'PUSH',
        3,
        cells(),
        { ...base(), aux: chips(1, null) },
        `S.top = ${top}. The slot is claimed; Φ has gone up by one.`,
      );

      S[top] = op;
      stats.writes++;
      emit(
        'PUSH',
        4,
        cells(),
        { ...base(), move: slotId(top), pushed: op, aux: chips(1, 1 + (top - before)) },
        `S[${top}] = ${op}. Cost 1, ΔΦ = +1, so ĉ = 2 — the object is carrying a credit to pay for its own pop.`,
      );
      continue;
    }

    // MULTIPOP(S, k): pop the top k objects, or all of them if there are fewer.
    const asked = -op;
    const before = top;
    let k = asked;
    let cost = 0;

    for (;;) {
      stats.comparisons++;
      if (top === 0 || k === 0) {
        emit(
          'MULTIPOP',
          1,
          cells(),
          { ...base(), aux: chips(cost, cost + (top - before)) },
          top === 0
            ? `The stack is empty, so MULTIPOP stops. It popped ${cost} of the ${asked} it was asked for.`
            : `k is 0: all ${asked} objects are off. Cost ${cost}, ΔΦ = −${cost}, so ĉ = 0.`,
        );
        break;
      }

      emit(
        'MULTIPOP',
        1,
        cells(),
        { ...base(), look: slotId(top), aux: chips(cost, null) },
        `MULTIPOP(S, ${asked}): the stack is not empty and k = ${k}, so pop again.`,
      );

      const returned = S[top] as number;
      top--;
      cost++;
      charged++;
      emit(
        'POP',
        3,
        cells(),
        { ...base(), look: slotId(top + 1), popped: returned, aux: chips(cost, null) },
        `POP hands back ${returned}. Nothing is erased — S.top moved, and Φ is down to ${top}.`,
      );

      k--;
      emit(
        'MULTIPOP',
        3,
        cells(),
        { ...base(), aux: chips(cost, null) },
        `k = ${k}. This pop was paid for when ${returned} was pushed, so it charges nothing now.`,
      );
    }
  }

  return {
    steps,
    output: { operations: input.length, cost: charged, top, pushes: stats.writes },
  };
}

/**
 * A sequence of operations: three pushes to start, then mostly pushes with
 * the occasional MULTIPOP of whatever happens to be there. Deep enough that
 * at least one MULTIPOP is visibly expensive, which is the whole point.
 */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 24));
  const ops: number[] = [];
  let height = 0;
  for (let i = 0; i < count; i++) {
    // The last operation is forced to be a MULTIPOP if nothing else has been
    // one. A run of pure pushes demonstrates nothing this chapter is about,
    // and a generator that only *usually* produces the interesting case makes
    // a test that only usually passes.
    const owed = i === count - 1 && height >= 2 && !ops.some((op) => op < 0);
    const forcePush = i < 3 || height < 2;
    if (!owed && (forcePush || Math.random() < 0.68)) {
      ops.push(10 + Math.floor(Math.random() * 90));
      height++;
    } else {
      const k = 1 + Math.floor(Math.random() * height);
      ops.push(-k);
      height -= k;
    }
  }
  return ops;
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one operation.' };
  if (parts.length > 24) return { error: 'At most 24 operations.' };

  const ops: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v === 0 || v > 99 || v < -20) {
      return {
        error: `"${part}" is not an operation: a number from 1 to 99 pushes it, and −k multipops k.`,
      };
    }
    ops.push(v);
  }
  return { value: ops };
}

export const multipop: AlgorithmModule = {
  id: 'multipop',
  name: 'Stack with MULTIPOP',
  visualizer: 'cells',
  aux: [
    {
      key: 'ledger',
      label: 'cost',
      hint: 'cost, Φ, the amortised ĉ = c + ΔΦ, and the total so far',
    },
  ],
  procOrder: ['MULTIPOP', 'PUSH', 'POP'],
  procedures: {
    MULTIPOP: {
      title: 'MULTIPOP(S, k)',
      indent: [0, 1, 1],
      lines: ['while not STACK-EMPTY(S) and k > 0', 'POP(S)', 'k = k - 1'],
    },
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
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(1)',
    worst: 'Θ(n)',
    space: 'Θ(n)',
    extra: [
      ['Amortised per operation', 'O(1) — at most 2'],
      ['n operations', 'O(n) total, never O(n²)'],
      ['Worst single MULTIPOP', 'Θ(n), after n pushes'],
      ['Accounting', 'PUSH is charged 2, POP and MULTIPOP 0'],
      ['Potential', 'Φ = objects on the stack'],
      ['Why it works', 'an object is popped at most once'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 20,
    noun: 'sequence',
    placeholder: '17, 3, 5, -2, 8',
    note: 'a number pushes it, −k multipops k',
    label: 'The operations: a positive number pushes it, a negative −k is MULTIPOP(k)',
    generate,
    parse,
  },
  defaultSize: 12,
  result: {
    // Nothing sorts and there is no output array. The claims are the
    // chapter's: the stack ends where a straight simulation says it should,
    // and the whole sequence of n operations cost at most 2n — the aggregate
    // bound, checked rather than argued.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const stack: number[] = [];
      let cost = 0;
      for (const op of input) {
        if (op > 0) {
          stack.push(op);
          cost++;
        } else {
          const popped = Math.min(-op, stack.length);
          stack.length -= popped;
          cost += popped;
        }
      }

      const reported = trace.output?.cost ?? -1;
      if (reported !== cost) return `counted ${reported} pushes and pops, expected ${cost}`;
      if (cost > 2 * input.length) {
        return `${input.length} operations cost ${cost}, which breaks the 2n bound the aggregate argument gives`;
      }
      if ((trace.output?.top ?? -1) !== stack.length) {
        return `the stack ends ${trace.output?.top} deep, expected ${stack.length}`;
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'cells') return 'the last step carries no cells snapshot';
      const held = last.data.rows[0]!.cells.slice(0, stack.length).map((c) => c.value);
      if (JSON.stringify(held) !== JSON.stringify(stack)) {
        return `the stack holds ${JSON.stringify(held)}, expected ${JSON.stringify(stack)}`;
      }
      return null;
    },
  },
  record,
};
