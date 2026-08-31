import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
  type TreeNode,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';

/**
 * P-FIB, AND THE COMPUTATION DAG — CLRS §26.1.
 *
 * Every algorithm so far has had one running time. A parallel one has **two**,
 * and the whole of chapter 26 is about the difference between them.
 *
 * **Work, T₁** — the total number of steps, which is what one processor would
 * take. Erase every `spawn` and `sync` from the program and you get an
 * ordinary serial program, the **serial elision**; its running time is the
 * work. Parallelism does not make work go away.
 *
 * **Span, T∞** — the longest chain of steps that *must* happen in order,
 * which is what infinitely many processors would take. Nothing can go faster
 * than its own dependencies.
 *
 * Their ratio, **T₁/T∞, is the parallelism**: the largest speedup any number
 * of processors could ever give you. And the reason both numbers are
 * well-defined is that a fork-join computation is a **DAG** — vertices are
 * strands of serial execution, edges are "this must finish before that
 * starts". Work is the number of vertices. Span is the longest path.
 *
 * P-FIB is the book's first example, and it is deliberately a bad algorithm:
 * exponential work to compute something a loop does in linear time. That is
 * the point. It generates an enormous DAG out of three lines, which is
 * exactly what is needed to see the shape of one.
 *
 * **The picture is the whole tree, from the first frame.** Watch it light up
 * in the order a single processor would run it — that is the work, one vertex
 * at a time, and there are a lot of them. Then watch the second phase trace a
 * single path from root to leaf: that is the span, and it is all that stands
 * between this computation and being finished instantly. Work is the area;
 * span is the depth. Everything in this chapter is about making the first big
 * and the second small.
 *
 * The numbers here are exact rather than asymptotic. An invocation with n ≤ 1
 * is a single strand; any other is three — the code before the spawn, the
 * continuation that calls P-FIB(n−2), and the code after the sync — and the
 * span is computed by taking the longer of the two routes through them, not
 * by assuming which one wins.
 */

interface Call {
  id: string;
  n: number;
  value: number;
  /** Strands in this invocation's whole subtree — its work. */
  work: number;
  /** Longest dependency chain through it — its span. */
  span: number;
  left?: Call;
  right?: Call;
}

/**
 * The whole recursion tree, built before a single step is emitted.
 *
 * A tree that grew as the trace ran would reflow on every frame, and the
 * reader is being asked to compare the *area* of the picture with a path
 * through it — which is impossible if the picture keeps moving. The shape is
 * a function of n alone, so there is nothing to wait for.
 */
function build(n: number, id: string): Call {
  if (n <= 1) return { id, n, value: n, work: 1, span: 1 };
  const left = build(n - 1, `${id}L`);
  const right = build(n - 2, `${id}R`);
  return {
    id,
    n,
    value: left.value + right.value,
    // Three strands of its own, plus everything underneath.
    work: 3 + left.work + right.work,
    // Two routes to the end: in and out through the spawned child, or through
    // the continuation and the child it calls. The span is the longer one.
    span: Math.max(1 + left.span + 1, 2 + right.span + 1),
    left,
    right,
  };
}

export function record(input: number[]): Trace {
  const n = Math.max(2, Math.min(input[0] ?? 5, 6));
  const root = build(n, 'c');
  const { steps, stats, emit } = createRecorder();

  const all: Call[] = [];
  (function collect(c: Call): void {
    all.push(c);
    if (c.left) collect(c.left);
    if (c.right) collect(c.right);
  })(root);

  /** What each invocation has returned, once it has. */
  const returned = new Map<string, number>();
  let work = 0;

  function snapshot(): TreeData {
    const nodes: TreeNode[] = all.map((c) => {
      const value = returned.get(c.id);
      return {
        id: c.id,
        keys: [c.n],
        ...(c.left ? { children: [c.left.id, c.right!.id] } : {}),
        ...(value === undefined ? {} : { attrs: { F: value } }),
      };
    });
    return { kind: 'tree', root: root.id, nodes };
  }

  const chips = (span: number | null, par: number | null) => ({
    T: auxOf([null, work, span, par], undefined, [null, 'T₁', 'T∞', 'T₁/T∞']),
  });

  const done = () => [...returned.keys()];

  emit(
    'P-FIB',
    1,
    snapshot(),
    { aux: chips(null, null) },
    `The whole computation, before any of it runs: ${all.length} invocations to compute F(${n}).`,
  );

  /** A single processor's order, which is what makes the work visible. */
  (function run(c: Call): void {
    if (!c.left) {
      work += 1;
      returned.set(c.id, c.value);
      stats.comparisons++;
      emit(
        'P-FIB',
        2,
        snapshot(),
        { move: c.id, done: done(), aux: chips(null, null) },
        `P-FIB(${c.n}) returns ${c.value} at once — one strand, and a leaf of the DAG.`,
      );
      return;
    }
    // Both children exist together or not at all; naming them once is what
    // lets the rest of this read like the pseudocode.
    const spawned = c.left;
    const called = c.right!;

    work += 1;
    stats.writes++;
    emit(
      'P-FIB',
      3,
      snapshot(),
      {
        move: c.id,
        done: done(),
        edges: { [`${c.id}>${spawned.id}`]: 'look' as Role },
        aux: chips(null, null),
      },
      `P-FIB(${c.n}) spawns P-FIB(${spawned.n}). The spawn *may* run in parallel — it need not.`,
    );
    run(spawned);

    work += 1;
    stats.writes++;
    emit(
      'P-FIB',
      4,
      snapshot(),
      {
        move: c.id,
        done: done(),
        edges: { [`${c.id}>${called.id}`]: 'look' as Role },
        aux: chips(null, null),
      },
      `Back at P-FIB(${c.n}): the continuation calls P-FIB(${called.n}) itself, without spawning.`,
    );
    run(called);

    work += 1;
    returned.set(c.id, c.value);
    stats.writes++;
    emit(
      'P-FIB',
      6,
      snapshot(),
      { move: c.id, done: done(), aux: chips(null, null) },
      `sync: both children are back, so P-FIB(${c.n}) returns ${spawned.value} + ${called.value} = ${c.value}.`,
    );
  })(root);

  // The span. The same DAG, read for its longest path instead of its size.
  const path: Call[] = [];
  const edgesOnPath: Record<string, Role> = {};
  let walk: Call | undefined = root;
  let counted = 0;
  while (walk) {
    path.push(walk);
    const next: Call | undefined = walk.left
      ? 1 + walk.left.span + 1 >= 2 + walk.right!.span + 1
        ? walk.left
        : walk.right
      : undefined;
    // Strands charged at this level: one before the spawn and one after the
    // sync when the route goes through the spawned child; the continuation
    // costs one more when it goes the other way.
    counted += walk.left ? (next === walk.left ? 2 : 3) : 1;
    if (next) edgesOnPath[`${walk.id}>${next.id}`] = 'mark';
    const at = counted;
    emit(
      'P-FIB',
      next === undefined ? 2 : next === walk.left ? 3 : 4,
      snapshot(),
      {
        mark: path.map((c) => c.id),
        done: done(),
        edges: { ...edgesOnPath },
        aux: chips(at, null),
      },
      next
        ? `The longest chain goes through P-FIB(${next.n}). ${at} strands of the span so far.`
        : `The chain ends at P-FIB(${walk.n}). Nothing can finish before these ${at} strands do.`,
    );
    walk = next;
  }

  const parallelism = Number((root.work / root.span).toFixed(1));
  emit(
    'P-FIB',
    6,
    snapshot(),
    {
      mark: path.map((c) => c.id),
      done: done(),
      edges: { ...edgesOnPath },
      aux: chips(root.span, parallelism),
      work: root.work,
      span: root.span,
      value: root.value,
    },
    `${root.work} strands of work down a span of ${root.span}: parallelism ${parallelism}, and F(${n}) = ${root.value}.`,
  );

  return { steps, output: { work: root.work, span: root.span, value: root.value } };
}

/**
 * Three claims, and none of them is "it recomputed Fibonacci".
 *
 * The value is checked against the sequence, of course. But the two that
 * matter are structural: the work is re-derived by counting the strands of
 * every invocation in the tree, and the span is re-derived by finding the
 * longest path in the DAG with a fresh bottom-up pass. Both are what the
 * chapter's two numbers *mean*, and a recorder that miscounted either would
 * be teaching the wrong lesson while returning the right Fibonacci number.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = Math.max(2, Math.min(input[0] ?? 5, 6));
  const hi = trace.steps.at(-1)!.hi as { work?: number; span?: number; value?: number };
  if (hi.work === undefined || hi.span === undefined || hi.value === undefined) {
    return 'the run reported no work, span or value';
  }

  const fib: number[] = [0, 1];
  for (let i = 2; i <= n; i++) fib.push(fib[i - 1]! + fib[i - 2]!);
  if (hi.value !== fib[n]) return `it returned ${hi.value}, but F(${n}) is ${fib[n]}`;

  // Work: invocations of P-FIB(n) number 2·F(n+1) − 1, and each contributes
  // one strand if it is a base case and three otherwise.
  const calls: number[] = [1, 1];
  for (let i = 2; i <= n; i++) calls.push(1 + calls[i - 1]! + calls[i - 2]!);
  const leaves: number[] = [1, 1];
  for (let i = 2; i <= n; i++) leaves.push(leaves[i - 1]! + leaves[i - 2]!);
  const expectedWork = leaves[n]! + 3 * (calls[n]! - leaves[n]!);
  if (hi.work !== expectedWork) {
    return `the run counted ${hi.work} strands of work, but the DAG has ${expectedWork}`;
  }

  const spans: number[] = [1, 1];
  for (let i = 2; i <= n; i++) {
    spans.push(Math.max(1 + spans[i - 1]! + 1, 2 + spans[i - 2]! + 1));
  }
  if (hi.span !== spans[n]) {
    return `the run reported a span of ${hi.span}, but the longest path is ${spans[n]}`;
  }
  if (hi.span > hi.work) return `the span ${hi.span} exceeds the work ${hi.work} — impossible`;
  return null;
}

export const pFib: AlgorithmModule = {
  id: 'p-fib',
  name: 'P-FIB and the Computation DAG',
  visualizer: 'tree',
  aux: [{ key: 'T', label: 'time', hint: 'work, span, and the speedup their ratio allows' }],
  procOrder: ['P-FIB'],
  procedures: {
    'P-FIB': {
      title: 'P-FIB(n)',
      indent: [0, 1, 0, 1, 1, 1],
      lines: [
        'if n ≤ 1',
        'return n',
        'else x = spawn P-FIB(n − 1)',
        'y = P-FIB(n − 2)',
        'sync',
        'return x + y',
      ],
    },
  },
  complexity: {
    best: 'T₁ = Θ(φⁿ)',
    average: 'T₁ = Θ(φⁿ)',
    worst: 'T₁ = Θ(φⁿ)',
    space: 'Θ(n) stack depth',
    extra: [
      ['Span', 'T∞ = Θ(n) — the longest path down the DAG'],
      ['Parallelism', 'T₁/T∞ = Θ(φⁿ/n), which grows fast'],
      ['Serial elision', 'erase spawn and sync, and you have the serial program'],
      ['On P processors', 'a greedy scheduler needs at most T₁/P + T∞'],
      ['Is it a good algorithm', 'no — a loop computes F(n) in Θ(n) work'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 6,
    noun: 'value of n',
    placeholder: '5',
    note: 'n only; the DAG has 2·F(n+1) − 1 invocations',
    label: 'The n in P-FIB(n), from 2 to 6',
    generate: (n) => [Math.max(2, Math.min(n, 6))],
    parse: (text) => {
      const v = Number(text.trim());
      if (!Number.isInteger(v)) return { error: `"${text.trim()}" is not a whole number.` };
      if (v < 2 || v > 6) {
        return { error: 'n runs from 2 to 6 — P-FIB(7) is 41 invocations and stops fitting.' };
      }
      return { value: [v] } satisfies ParsedInput;
    },
    size: (value: number[]) => value[0]!,
  },
  defaultSize: 5,
  result: { kind: 'transforms', verify },
  record,
};
