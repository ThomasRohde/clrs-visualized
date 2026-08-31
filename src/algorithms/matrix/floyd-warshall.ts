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
import {
  generateWeightedDigraph,
  negativeCycleVertices,
  parseGraph,
} from '../graphs/graph-input.ts';

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
 * book. The run reads that diagonal before it says anything about the answer:
 * a graph with such a cycle has no shortest paths at all between the pairs
 * that can reach it, so those entries end as −∞ and the last step reports the
 * cycle instead of calling the table a distance matrix.
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

  /**
   * The diagonal is the negative-cycle test, so it has to be read before the
   * success narration rather than left for the reader to notice.
   *
   * `d[v][v] < 0` says there is a walk from v back to itself costing less than
   * nothing, and going round it again is cheaper still. Every pair that can
   * reach that cycle and leave it again therefore has **no** shortest path —
   * the infimum is −∞ — so those entries are set to −∞ and their predecessors
   * dropped, because leaving a finite number in a cell the reader will read as
   * a distance is the whole of the bug.
   */
  const onCycle: number[] = [];
  for (let v = 1; v <= n; v++) if (d[v]![v]! < 0) onCycle.push(v);

  if (onCycle.length > 0) {
    const witness = onCycle[0]!;
    const cost = d[witness]![witness]!;
    // Read against a copy: "i can reach c" is a fact about the finished
    // matrix, and testing it on cells the loop has already blanked would let
    // a pair through on the strength of an entry it just erased.
    const reaches = d.map((row) => row.map((v) => Number.isFinite(v)));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) {
        const through = onCycle.some((c) => reaches[i]![c] && reaches[c]![j]);
        if (!through) continue;
        d[i]![j] = -Infinity;
        pi[i]![j] = null;
      }
    }
    emit(
      'FLOYD-WARSHALL',
      7,
      snapshot(),
      {
        mark: onCycle.map((v) => key(v, v)),
        negativeCycle: [...onCycle],
        matrix: d.map((row) => [...row]),
        parents: pi.map((row) => [...row]),
        aux: { k: chips(n) },
      },
      `d[${witness},${witness}] came out at ${cost}: a walk from ${witness} back to itself costing less than nothing. That is a negative-weight cycle, so every pair that can reach it has no shortest path — those entries are −∞, not distances.`,
    );
    return { steps, output: { n, rounds: n, negativeCycle: onCycle.length } };
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
    `Every vertex has been allowed, and no diagonal entry went negative, so every entry is a true shortest distance.`,
  );

  return { steps, output: { n, rounds: n, negativeCycle: 0 } };
}

/**
 * Which vertices each vertex can reach, walked off the edge list.
 *
 * A vertex reaches itself, so `reaches[i]` includes `i` — which is what makes
 * "i reaches a cycle vertex c and c reaches j" the right test even when i or j
 * is the cycle vertex.
 */
function reachability(g: GraphInput): Array<Set<number>> {
  const adj = new Map<number, number[]>();
  for (let v = 1; v <= g.n; v++) adj.set(v, []);
  for (const e of g.edges) adj.get(e.u)!.push(e.v);

  const out: Array<Set<number>> = [new Set()];
  for (let s = 1; s <= g.n; s++) {
    const seen = new Set<number>([s]);
    const queue = [s];
    while (queue.length > 0) {
      for (const v of adj.get(queue.pop()!)!) {
        if (seen.has(v)) continue;
        seen.add(v);
        queue.push(v);
      }
    }
    out.push(seen);
  }
  return out;
}

/**
 * Every entry is a shortest distance, checked by the same characterization
 * §22.5 uses — no edge is slack, from any source.
 *
 * Doing that for all n sources is n applications of a property that is not
 * this algorithm: `d[i][j] ≤ d[i][u] + w(u,v)` for every edge, plus the
 * triangle inequality holding with equality along some real path. The
 * predecessor matrix is walked to confirm the second half.
 *
 * A negative-weight cycle is checked separately and independently, against
 * `negativeCycleVertices` — per-source Bellman-Ford, which shares no code with
 * this algorithm — so "the diagonal went negative" is never taken on trust.
 * The slack property above survives the −∞ entries unchanged: `−∞ ≤ anything`,
 * and any pair that can reach an entry with no shortest path has none itself.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const n = g.n;
  const hi = trace.steps.at(-1)!.hi as {
    matrix?: number[][];
    parents?: Array<Array<number | null>>;
    negativeCycle?: number[];
  };
  const d = hi.matrix;
  const pi = hi.parents;
  if (!d || !pi) return 'the run returned no matrix';

  const reported = hi.negativeCycle ?? [];
  const real = negativeCycleVertices(g);
  if (JSON.stringify(reported) !== JSON.stringify(real)) {
    return real.length === 0
      ? `the run reported a negative-weight cycle through ${reported.join(', ')}, but there is none`
      : `vertices ${real.join(', ')} lie on a negative-weight cycle, but the run reported ` +
          `${reported.length === 0 ? 'none' : reported.join(', ')}`;
  }
  // A pair with no shortest path is the one thing the matrix must not show as
  // a number, so which entries are −∞ is checked rather than assumed — and
  // against reachability walked off the edge list, not off the matrix being
  // checked.
  const reaches = reachability(g);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      const void_ = real.some((c) => reaches[i]!.has(c) && reaches[c]!.has(j));
      if (void_ && d[i]![j] !== -Infinity) {
        return `d[${i},${j}] is ${d[i]![j]}, but a negative-weight cycle lies on the way`;
      }
      if (!void_ && d[i]![j] === -Infinity) {
        return `d[${i},${j}] is −∞, but no negative-weight cycle lies between them`;
      }
    }
  }

  const w = new Map<string, number>();
  for (const e of g.edges) {
    const k = `${e.u},${e.v}`;
    w.set(k, Math.min(w.get(k) ?? Infinity, e.w ?? 1));
  }

  for (let i = 1; i <= n; i++) {
    if (d[i]![i] !== 0 && d[i]![i] !== -Infinity) return `d[${i},${i}] is ${d[i]![i]}, not 0`;
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
      [
        'Negative cycles',
        'a negative diagonal entry — reported, rather than a matrix of distances',
      ],
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
