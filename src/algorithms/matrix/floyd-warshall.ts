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
import { generateWeightedDigraph, parseGraph } from '../graphs/graph-input.ts';

/**
 * THE FLOYD-WARSHALL ALGORITHM — CLRS §23.2.
 *
 * Shortest paths between **every** pair of vertices, in Θ(V³), from a
 * three-line recurrence and a table. It is the shortest useful algorithm in
 * Part VI and one of the shortest in the book.
 *
 * The idea is a different decomposition from chapter 22's. Instead of asking
 * "what is the last edge on the path", ask **"which vertices is the path
 * allowed to pass through"** — and add them one at a time.
 *
 * Write `d^(k)_ij` for the shortest path from i to j whose intermediate
 * vertices all come from `{1, 2, …, k}`. Then adding vertex k to the allowed
 * set gives two possibilities and no others: either the best path still does
 * not use k, or it does, in which case it goes from i to k and then from k to
 * j, and both halves are already known.
 *
 *     d^(k)_ij = min( d^(k−1)_ij ,  d^(k−1)_ik + d^(k−1)_kj )
 *
 * That is the whole algorithm. The outer loop is over k — over the vertices
 * being *allowed*, not over anything positional — which is why it must be
 * outermost and why the algorithm is so easy to get wrong by permuting the
 * loops.
 *
 * The run marks the **pivot row and column** on every step. Watch them: an
 * entry can only improve by combining one cell from row k with one from
 * column k, so everything that happens in a round happens through the cross
 * those two make. Entries in row k and column k themselves never change
 * during round k, which is the small lemma that makes updating the table in
 * place legal.
 *
 * Negative edges are fine, as they were in §22.1. A negative *cycle* shows up
 * as a negative number on the diagonal — a path from a vertex back to itself
 * costing less than nothing — which is the cheapest negative-cycle test in the
 * book.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const n = g.n;

  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === j ? 0 : Infinity)),
  );
  const pi: Array<Array<number | null>> = Array.from({ length: n + 1 }, () =>
    new Array<number | null>(n + 1).fill(null),
  );
  for (const e of g.edges) {
    if ((e.w ?? 1) < d[e.u]![e.v]!) {
      d[e.u]![e.v] = e.w ?? 1;
      pi[e.u]![e.v] = e.u;
    }
  }

  const { steps, stats, emit } = createRecorder();

  const key = (i: number, j: number) => `${i - 1},${j - 1}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const cells: GridCell[] = [];
      for (let j = 1; j <= n; j++) {
        cells.push({
          value: d[i]![j]!,
          ...(pi[i]![j] ? { note: `π${pi[i]![j]}` } : {}),
        });
      }
      rows.push({ label: `${i}`, cells });
    }
    return {
      kind: 'grid',
      corner: 'i\\j',
      colLabels: Array.from({ length: n }, (_, j) => j + 1),
      rows,
    };
  }

  /** Row k and column k — the cross every improvement has to come through. */
  const cross = (k: number): string[] => [
    ...Array.from({ length: n }, (_, j) => key(k, j + 1)),
    ...Array.from({ length: n }, (_, i) => key(i + 1, k)),
  ];

  const chips = (k: number) => auxOf([null, k], 1, [null, 'allowed through 1‥k']);

  emit(
    'FLOYD-WARSHALL',
    1,
    snapshot(),
    { aux: { k: chips(0) } },
    `D⁰ is the weight matrix: only direct edges, no intermediate vertices allowed yet.`,
  );

  for (let k = 1; k <= n; k++) {
    emit(
      'FLOYD-WARSHALL',
      2,
      snapshot(),
      {
        mark: cross(k),
        scope: Array.from({ length: n }, (_, j) => key(k, j + 1)),
        scopeLabel: `k = ${k}: paths may now pass through ${k}`,
        aux: { k: chips(k) },
      },
      `Round ${k}. Every path may now go through vertex ${k}, and only through 1‥${k}.`,
    );

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) {
        const through = d[i]![k]! + d[k]![j]!;
        stats.comparisons++;
        const better = through < d[i]![j]!;
        emit(
          'FLOYD-WARSHALL',
          6,
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
          better
            ? `${i}→${k}→${j} costs ${through}, beating ${d[i]![j] === Infinity ? '∞' : d[i]![j]}.`
            : `Going through ${k} costs ${through === Infinity ? '∞' : through}; ${d[i]![j] === Infinity ? '∞' : d[i]![j]} is no worse.`,
        );
        if (!better) continue;

        d[i]![j] = through;
        pi[i]![j] = pi[k]![j];
        stats.writes += 2;
        emit(
          'FLOYD-WARSHALL',
          6,
          snapshot(),
          {
            mark: cross(k),
            move: key(i, j),
            pointers: { j: key(i, j) },
            aux: { k: chips(k) },
          },
          `d[${i},${j}] = ${through}. The predecessor comes from the second half of the path.`,
        );
      }
    }
  }

  const all: string[] = [];
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) all.push(key(i, j));
  emit(
    'FLOYD-WARSHALL',
    7,
    snapshot(),
    {
      done: all,
      matrix: d.map((row) => [...row]),
      parents: pi.map((row) => [...row]),
      aux: { k: chips(n) },
    },
    `Every vertex has been allowed, so every entry is a true shortest distance.`,
  );

  return { steps, output: { n, rounds: n } };
}

/**
 * Every entry is a shortest distance, checked by the same characterization
 * §22.5 uses — no edge is slack, from any source.
 *
 * Doing that for all n sources is n applications of a property that is not
 * this algorithm: `d[i][j] ≤ d[i][u] + w(u,v)` for every edge, plus the
 * triangle inequality holding with equality along some real path. The
 * predecessor matrix is walked to confirm the second half.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const n = g.n;
  const hi = trace.steps.at(-1)!.hi as {
    matrix?: number[][];
    parents?: Array<Array<number | null>>;
  };
  const d = hi.matrix;
  const pi = hi.parents;
  if (!d || !pi) return 'the run returned no matrix';

  const w = new Map<string, number>();
  for (const e of g.edges) {
    const k = `${e.u},${e.v}`;
    w.set(k, Math.min(w.get(k) ?? Infinity, e.w ?? 1));
  }

  for (let i = 1; i <= n; i++) {
    if (d[i]![i] !== 0) return `d[${i},${i}] is ${d[i]![i]}, not 0`;
    // No edge may be slack from any source, or a shorter path exists.
    for (const e of g.edges) {
      const via = d[i]![e.u]! + (e.w ?? 1);
      if (via < d[i]![e.v]!) {
        return `d[${i},${e.v}] = ${d[i]![e.v]} but going via ${e.u} costs ${via}`;
      }
    }
    // …and every finite entry must be achieved by a path that is really there.
    for (let j = 1; j <= n; j++) {
      if (i === j || !Number.isFinite(d[i]![j]!)) continue;
      let at = j;
      let total = 0;
      const guard = new Set<number>();
      while (at !== i) {
        const parent = pi[i]![at];
        if (!parent) return `d[${i},${j}] is finite but the path back from ${at} stops`;
        if (guard.has(at)) return `the predecessor chain for d[${i},${j}] loops`;
        guard.add(at);
        const edge = w.get(`${parent},${at}`);
        if (edge === undefined)
          return `the path for d[${i},${j}] uses a missing edge ${parent}→${at}`;
        total += edge;
        at = parent;
      }
      if (total !== d[i]![j]) {
        return `d[${i},${j}] = ${d[i]![j]} but its predecessor path costs ${total}`;
      }
    }
  }
  return null;
}

export const floydWarshall: AlgorithmModule = {
  id: 'floyd-warshall',
  name: 'Floyd-Warshall',
  visualizer: 'grid',
  aux: [{ key: 'k', label: 'k', hint: 'how many vertices paths may pass through' }],
  procOrder: ['FLOYD-WARSHALL'],
  procedures: {
    'FLOYD-WARSHALL': {
      title: 'FLOYD-WARSHALL(W, n)',
      indent: [0, 0, 1, 1, 2, 3, 0],
      lines: [
        'D⁰ = W',
        'for k = 1 to n',
        'let Dᵏ be a new n × n matrix',
        'for i = 1 to n',
        'for j = 1 to n',
        'dᵏ_ij = min(dᵏ⁻¹_ij, dᵏ⁻¹_ik + dᵏ⁻¹_kj)',
        'return Dⁿ',
      ],
    },
  },
  complexity: {
    best: 'Θ(V³)',
    average: 'Θ(V³)',
    worst: 'Θ(V³)',
    space: 'Θ(V²)',
    extra: [
      ['Versus running Dijkstra V times', 'Θ(V³) against O(V E lg V) — better when dense'],
      ['Negative weights', 'allowed'],
      ['Negative cycles', 'a negative entry on the diagonal'],
      ['Why k is the outer loop', 'it is the set of allowed intermediate vertices'],
      ['In place', 'legal — row k and column k do not change during round k'],
    ],
  },
  input: {
    // The generator will not build a digraph smaller than four vertices, so
    // the slider does not offer a size it would silently round up.
    minSize: 4,
    maxSize: 5,
    noun: 'graph',
    placeholder: '1-2:3, 2-3:-2, 3-1:4',
    note: 'directed and weighted; negative weights allowed',
    label: 'Weighted directed edges, as 1-2:3, separated by commas',
    generate: (n) => generateWeightedDigraph(Math.min(n, 5)),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: -20, maxWeight: 99, maxN: 5 }),
    size: (value: GraphInput) => value.n,
  },
  defaultSize: 4,
  result: { kind: 'transforms', verify },
  record,
};
