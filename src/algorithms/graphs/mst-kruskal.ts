import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphData,
  type GraphInput,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, generateUndirected, parseGraph, verticesOf, vid } from './graph-input.ts';
import { isMinimumSpanningTree } from './graph-check.ts';

/**
 * KRUSKAL'S ALGORITHM — CLRS §21.2.
 *
 * Sort every edge by weight and take them in order, keeping each one unless
 * it would close a cycle. That is the whole algorithm, and it is greedy in
 * the plainest possible sense: it never looks ahead, never reconsiders, and
 * is nonetheless optimal.
 *
 * The reason it is optimal is §21.1's **cut property**. At any moment the
 * chosen edges cut the vertices into components; the cheapest edge crossing
 * between two of them is always safe to add, because any spanning tree
 * without it would have to cross that boundary somewhere more expensive.
 * Kruskal takes edges in increasing order, so the first edge it meets with
 * ends in two different components *is* the cheapest crossing one.
 *
 * "Would it close a cycle" is the question, and answering it fast is the
 * whole implementation. It is exactly chapter 19's: keep a disjoint set per
 * component, and the test is `FIND-SET(u) ≠ FIND-SET(v)`. The rings on screen
 * are those sets — watch them merge, two at a time, until one ring holds
 * every vertex and the tree is complete.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const { steps, stats, emit } = createRecorder();

  const parent = Array.from({ length: g.n + 1 }, (_, i) => i);
  const rank = new Array<number>(g.n + 1).fill(0);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));

  const sorted = [...g.edges]
    .map((e) => ({ u: e.u, v: e.v, w: e.w ?? 1 }))
    .sort((a, b) => a.w - b.w || a.u - b.u || a.v - b.v);
  const chosen: Array<{ u: number; v: number; w: number }> = [];

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v), weight: e.w ?? 1 })),
    };
  }

  /** Every vertex in the same set as `x` — one of the rings on screen. */
  const setOf = (x: number): number[] => {
    const r = find(x);
    const out: number[] = [];
    for (let v = 1; v <= g.n; v++) if (find(v) === r) out.push(v);
    return out;
  };

  function base(i?: number): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const e of chosen) edges[ekey(e.u, e.v)] = 'done';
    return {
      edges,
      aux: {
        E: auxOf([null, ...sorted.map((e) => e.w)], i === undefined ? undefined : i + 1, [
          null,
          ...sorted.map((e) => `${e.u}–${e.v}`),
        ]),
      },
    };
  }

  emit(
    'MST-KRUSKAL',
    5,
    snapshot(),
    { ...base() },
    `Every edge, sorted by weight: ${sorted.map((e) => e.w).join(', ')}. They are taken in that order.`,
  );

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!;
    stats.comparisons++;
    const ru = find(e.u);
    const rv = find(e.v);
    const joins = ru !== rv;
    const ring = joins ? [...setOf(e.u), ...setOf(e.v)] : setOf(e.u);

    emit(
      'MST-KRUSKAL',
      7,
      snapshot(),
      {
        ...base(i),
        look: [vid(e.u), vid(e.v)],
        edges: { ...(base(i).edges as Record<string, Role>), [ekey(e.u, e.v)]: 'look' },
        scope: ring.map(vid),
        scopeLabel: joins ? 'the two sets this edge would join' : 'both ends are in this one set',
      },
      joins
        ? `${e.u}-${e.v} weighs ${e.w} and joins two different sets, so it is safe: take it.`
        : `${e.u}-${e.v} would close a cycle — both ends are already connected. Skip it.`,
    );
    if (!joins) continue;

    chosen.push(e);
    if (rank[ru]! < rank[rv]!) parent[ru] = rv;
    else if (rank[ru]! > rank[rv]!) parent[rv] = ru;
    else {
      parent[rv] = ru;
      rank[ru]!++;
    }
    stats.writes++;
    emit(
      'MST-KRUSKAL',
      9,
      snapshot(),
      {
        ...base(i),
        move: [vid(e.u), vid(e.v)],
        edges: { ...(base(i).edges as Record<string, Role>), [ekey(e.u, e.v)]: 'move' },
        scope: setOf(e.u).map(vid),
        scopeLabel: 'one set now',
      },
      `UNION: the two sets are one. A has ${chosen.length} of the ${g.n - 1} edges it needs.`,
    );
  }

  const weight = chosen.reduce((sum, e) => sum + e.w, 0);
  emit(
    'MST-KRUSKAL',
    10,
    snapshot(),
    { ...base(), tree: chosen.map((e) => ({ ...e })), done: verticesOf(g).map((x) => x.id) },
    `Return A: ${chosen.length} edges of total weight ${weight}, and every vertex is in one set.`,
  );

  return { steps, output: { edges: chosen.length, weight } };
}

function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const tree = (trace.steps.at(-1)?.hi as { tree?: Array<{ u: number; v: number; w: number }> })
    ?.tree;
  if (!tree) return 'the run returned no tree';
  return isMinimumSpanningTree(input, tree);
}

export const mstKruskal: AlgorithmModule = {
  id: 'mst-kruskal',
  name: "Kruskal's Algorithm",
  visualizer: 'graph',
  aux: [{ key: 'E', label: 'E', hint: 'every edge, sorted by weight — taken left to right' }],
  procOrder: ['MST-KRUSKAL'],
  procedures: {
    'MST-KRUSKAL': {
      title: 'MST-KRUSKAL(G, w)',
      indent: [0, 0, 1, 0, 0, 0, 1, 2, 2, 0],
      lines: [
        'A = ∅',
        'for each vertex v ∈ G.V',
        'MAKE-SET(v)',
        'create a single list of the edges in G.E',
        'sort the list into monotonically increasing order by w',
        'for each edge (u, v) taken from the sorted list in order',
        'if FIND-SET(u) ≠ FIND-SET(v)',
        'A = A ∪ {(u, v)}',
        'UNION(u, v)',
        'return A',
      ],
    },
  },
  complexity: {
    best: 'O(E lg V)',
    average: 'O(E lg V)',
    worst: 'O(E lg V)',
    space: 'Θ(V)',
    extra: [
      ['Where the time goes', 'the sort — the union-find part is O(E α(V))'],
      ['Edges chosen', 'exactly |V| − 1'],
      ['Cycle test', 'FIND-SET(u) ≠ FIND-SET(v), from chapter 19'],
      ['Greedy and optimal', 'the cut property makes every choice safe'],
      ['Disconnected input', 'produces a spanning forest, not a tree'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2:4, 1-3:8, 2-3:11',
    note: 'undirected and weighted; weights are distinct',
    label: 'Weighted edges, as 1-2:4, separated by commas',
    generate: (n) => generateUndirected(n, true),
    parse: (text) =>
      parseGraph(text, { directed: false, weighted: true, minWeight: 1, maxWeight: 99 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
