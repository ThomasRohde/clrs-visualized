import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type GraphInput,
  type Trace,
} from '../types.ts';
import { adjacency, generateDirected, parseGraph } from '../graphs/graph-input.ts';

/**
 * TRANSITIVE CLOSURE — CLRS §23.2.
 *
 * "Can i reach j at all?" — for every pair, and with no weights involved.
 *
 * You could run Floyd-Warshall with every edge weighted 1 and read off which
 * entries came out finite. This does the same thing with **booleans**, and
 * the point of putting it beside Floyd-Warshall is how little changes:
 *
 *     shortest paths:  d_ij = min( d_ij ,  d_ik +   d_kj )
 *     reachability:    t_ij =  or( t_ij ,  t_ik and t_kj )
 *
 * Same loops, same order, same Θ(V³). Only the two operations are different —
 * `min` becomes `or`, `+` becomes `and` — and that substitution is a pattern
 * worth recognising, because it turns up again and again. Both pairs form
 * what algebraists call a *semiring*, and the whole family of "Floyd-Warshall
 * over some semiring" solves problems from reachability to widest paths to
 * regular-expression matching with the same three lines.
 *
 * The practical difference is that booleans pack. A row of `t` fits in machine
 * words, so the inner loop becomes a bitwise OR over Θ(V/w) words rather than
 * Θ(V) operations — the same asymptotic bound, and a large constant factor
 * that no version of the shortest-path table can have.
 *
 * The picture is different to watch, too. Distances shrink gradually and
 * ambiguously; reachability only ever turns on, so the table fills in one
 * direction and never goes back. When a round adds nothing, nothing later
 * will either.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const n = g.n;
  const adj = adjacency(g);

  const t: boolean[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === j),
  );
  for (const [u, list] of adj) for (const { v } of list) t[u]![v] = true;

  const { steps, stats, emit } = createRecorder();
  const key = (i: number, j: number) => `${i - 1},${j - 1}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const cells: GridCell[] = [];
      for (let j = 1; j <= n; j++) cells.push({ value: t[i]![j] ? 1 : 0 });
      rows.push({ label: `${i}`, cells });
    }
    return {
      kind: 'grid',
      corner: 'i\\j',
      colLabels: Array.from({ length: n }, (_, j) => j + 1),
      rows,
    };
  }

  const cross = (k: number): string[] => [
    ...Array.from({ length: n }, (_, j) => key(k, j + 1)),
    ...Array.from({ length: n }, (_, i) => key(i + 1, k)),
  ];

  const reached = (): number => {
    let count = 0;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) if (t[i]![j]) count++;
    return count;
  };

  const chips = (k: number) => auxOf([null, k, reached()], undefined, [null, 'k', 'ones']);

  emit(
    'TRANSITIVE-CLOSURE',
    3,
    snapshot(),
    { aux: { k: chips(0) } },
    `T⁰ has a 1 wherever there is an edge, and on the diagonal: every vertex reaches itself.`,
  );

  for (let k = 1; k <= n; k++) {
    let added = 0;
    emit(
      'TRANSITIVE-CLOSURE',
      4,
      snapshot(),
      {
        mark: cross(k),
        scope: Array.from({ length: n }, (_, j) => key(k, j + 1)),
        scopeLabel: `k = ${k}: routes through ${k} now count`,
        aux: { k: chips(k) },
      },
      `Round ${k}. A 1 can now be earned by reaching ${k} and then reaching j from it.`,
    );

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) {
        stats.comparisons++;
        const gained = !t[i]![j] && t[i]![k]! && t[k]![j]!;
        emit(
          'TRANSITIVE-CLOSURE',
          7,
          snapshot(),
          {
            mark: cross(k),
            look: [key(i, k), key(k, j)],
            move: key(i, j),
            arrows: [
              { from: key(i, k), to: key(i, j), role: 'look' as const },
              { from: key(k, j), to: key(i, j), role: 'look' as const },
            ],
            pointers: { j: key(i, j) },
            aux: { k: chips(k) },
          },
          gained
            ? `${i} reaches ${k} and ${k} reaches ${j}, so ${i} reaches ${j}. A new 1.`
            : t[i]![j]
              ? `t[${i},${j}] is already 1 — nothing can turn it off.`
              : `${i} cannot reach ${j} through ${k}: one of the two halves is 0.`,
        );
        if (!gained) continue;

        t[i]![j] = true;
        added++;
        stats.writes++;
        emit(
          'TRANSITIVE-CLOSURE',
          7,
          snapshot(),
          { mark: cross(k), move: key(i, j), pointers: { j: key(i, j) }, aux: { k: chips(k) } },
          `t[${i},${j}] = 1. Reachability only ever turns on — the table never goes back.`,
        );
      }
    }

    if (added === 0) {
      emit(
        'TRANSITIVE-CLOSURE',
        4,
        snapshot(),
        { mark: cross(k), aux: { k: chips(k) } },
        `Round ${k} added nothing. That does not end it — a later k can still connect things.`,
      );
    }
  }

  const all: string[] = [];
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) all.push(key(i, j));
  emit(
    'TRANSITIVE-CLOSURE',
    8,
    snapshot(),
    { done: all, closure: t.map((row) => [...row]), aux: { k: chips(n) } },
    `${reached()} of the ${n * n} pairs are connected. Same loops as Floyd-Warshall, two operations changed.`,
  );

  return { steps, output: { n, pairs: reached() } };
}

/**
 * Reachability, worked out by search rather than by the table.
 *
 * A depth-first search from every vertex is Θ(V(V+E)) and shares nothing with
 * the triple loop, so it is a real second opinion on the answer rather than
 * the same computation twice.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const n = g.n;
  const t = (trace.steps.at(-1)!.hi as { closure?: boolean[][] }).closure;
  if (!t) return 'the run returned no closure';

  const adj = adjacency(g);
  for (let s = 1; s <= n; s++) {
    const seen = new Set<number>([s]);
    const stack = [s];
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const { v } of adj.get(u)!) {
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    for (let j = 1; j <= n; j++) {
      if (seen.has(j) !== !!t[s]![j]) {
        return `t[${s},${j}] says ${t[s]![j] ? 1 : 0}, but a search says ${seen.has(j) ? 1 : 0}`;
      }
    }
  }
  return null;
}

export const transitiveClosure: AlgorithmModule = {
  id: 'transitive-closure',
  name: 'Transitive Closure',
  visualizer: 'grid',
  aux: [{ key: 'k', label: 'k', hint: 'the round, and how many pairs are connected' }],
  procOrder: ['TRANSITIVE-CLOSURE'],
  procedures: {
    'TRANSITIVE-CLOSURE': {
      title: 'TRANSITIVE-CLOSURE(G, n)',
      indent: [0, 1, 2, 2, 0, 1, 2, 0],
      lines: [
        'for i = 1 to n',
        'for j = 1 to n',
        'if i == j or (i, j) ∈ G.E',
        't⁰_ij = 1  else  t⁰_ij = 0',
        'for k = 1 to n',
        'for i = 1 to n',
        'for j = 1 to n',
        'tᵏ_ij = tᵏ⁻¹_ij ∨ (tᵏ⁻¹_ik ∧ tᵏ⁻¹_kj)',
      ],
    },
  },
  complexity: {
    best: 'Θ(V³)',
    average: 'Θ(V³)',
    worst: 'Θ(V³)',
    space: 'Θ(V²)',
    extra: [
      ['Versus Floyd-Warshall', 'the same loops with (∨, ∧) for (min, +)'],
      ['Why bother', 'booleans pack: the inner loop becomes Θ(V/w) word operations'],
      ['Entries', 'only ever turn on — never off'],
      ['Alternative', 'a search from every vertex, Θ(V(V + E)) — better when sparse'],
      ['The pattern', 'Floyd-Warshall over any semiring'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 6,
    noun: 'graph',
    placeholder: '1-2, 2-3, 3-1, 3-4',
    note: 'directed; the generated graph always has a cycle',
    label: 'The directed edges, as pairs like 1-2, separated by commas',
    generate: (n) => generateDirected(Math.min(n, 6), false),
    parse: (text) => parseGraph(text, { directed: true, weighted: false, maxN: 6 }),
    size: (value: GraphInput) => value.n,
  },
  defaultSize: 5,
  result: { kind: 'transforms', verify },
  record,
};
