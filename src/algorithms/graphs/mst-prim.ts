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
import { adjacency, ekey, generateUndirected, parseGraph, verticesOf, vid } from './graph-input.ts';
import { isMinimumSpanningTree } from './graph-check.ts';

/**
 * PRIM'S ALGORITHM — CLRS §21.2.
 *
 * The same theorem as Kruskal's and a completely different shape. Kruskal
 * grows a forest of fragments that eventually merge; Prim grows **one tree**
 * from one root, and at every step adds the cheapest edge that leaves it.
 *
 * That makes the cut property immediate rather than clever. The cut is always
 * the same one — the tree against everything else — and the light edge
 * crossing it is exactly what the algorithm picks. Nothing is ever
 * reconsidered, because an edge inside the tree is no longer crossing
 * anything.
 *
 * The implementation is a priority queue over the vertices *not yet in the
 * tree*, keyed by the cheapest known edge to the tree. So each vertex holds
 * one number, not a list of edges — which is why the whole thing costs
 * O(E lg V) with a binary heap, and O(E + V lg V) with a Fibonacci one.
 *
 * On screen the badge on each vertex is that key, and the ring marks the
 * vertices that have one at all: the **frontier**, which is precisely the set
 * of vertices with an edge into the tree. Watch a key *drop* as the tree
 * grows nearer to it — chapter 6's DECREASE-KEY, in its natural habitat.
 *
 * With distinct weights the minimum spanning tree is unique, so this run and
 * Kruskal's on the same graph end with the same edges chosen in a different
 * order. That is worth doing once with the trace tape open on both.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const r = g.source ?? 1;

  const key = new Array<number>(g.n + 1).fill(Infinity);
  const pi = new Array<number>(g.n + 1).fill(0);
  const inQ = new Array<boolean>(g.n + 1).fill(true);
  const chosen: Array<{ u: number; v: number; w: number }> = [];

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g, (v) => ({ key: key[v] === Infinity ? '∞' : key[v]! })),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v), weight: e.w ?? 1 })),
    };
  }

  /** The vertices out of Q — the tree so far. */
  const tree = (): string[] => {
    const out: string[] = [];
    for (let v = 1; v <= g.n; v++) if (!inQ[v]) out.push(vid(v));
    return out;
  };

  /** Q, in the order EXTRACT-MIN would take it. */
  const queue = (): number[] => {
    const out: number[] = [];
    for (let v = 1; v <= g.n; v++) if (inQ[v]) out.push(v);
    return out.sort((a, b) => key[a]! - key[b]! || a - b);
  };

  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const e of chosen) edges[ekey(e.u, e.v)] = 'done';
    // The ring is the frontier: in Q, and with a finite key, which is the
    // same thing as "has an edge into the tree". Everything else in Q is
    // still at ∞ and the algorithm has no opinion about it yet.
    const frontier = queue().filter((v) => Number.isFinite(key[v]!));
    return {
      edges,
      done: tree(),
      ...(frontier.length > 0
        ? { scope: frontier.map(vid), scopeLabel: 'the frontier — one edge from the tree' }
        : {}),
      aux: {
        Q: auxOf([null, ...queue().map((v) => key[v]!)], undefined, [
          null,
          ...queue().map((v) => `v${v}`),
        ]),
      },
    };
  }

  key[r] = 0;
  stats.writes++;
  emit(
    'MST-PRIM',
    4,
    snapshot(),
    { ...base(), move: vid(r), pointers: { r: vid(r) } },
    `Every key is ∞ except the root's, which is 0 — so the root comes out of Q first.`,
  );

  while (queue().length > 0) {
    const u = queue()[0]!;
    inQ[u] = false;
    if (pi[u]) chosen.push({ u: pi[u]!, v: u, w: key[u]! });
    emit(
      'MST-PRIM',
      7,
      snapshot(),
      { ...base(), mark: vid(u), pointers: { u: vid(u) } },
      pi[u]
        ? `EXTRACT-MIN gives ${u}, at key ${key[u]}. Its edge to ${pi[u]} joins the tree.`
        : `EXTRACT-MIN gives the root ${u}. The tree starts here, with no edge.`,
    );

    for (const { v, w } of adj.get(u)!) {
      stats.comparisons++;
      const better = inQ[v] && w < key[v]!;
      emit(
        'MST-PRIM',
        9,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          look: vid(v),
          edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        !inQ[v]
          ? `${v} is already in the tree, so this edge crosses nothing.`
          : better
            ? `${w} beats ${v}'s key of ${key[v] === Infinity ? '∞' : key[v]} — a cheaper way in.`
            : `${w} is no better than ${v}'s key of ${key[v]}, so nothing changes.`,
      );
      if (!better) continue;

      pi[v] = u;
      key[v] = w;
      stats.writes += 2;
      emit(
        'MST-PRIM',
        11,
        snapshot(),
        { ...base(), mark: vid(u), move: vid(v), pointers: { u: vid(u), v: vid(v) } },
        `v.key = ${w} and v.π = ${u}. ${v}'s cheapest way into the tree is now through ${u}.`,
      );
    }
  }

  const weight = chosen.reduce((sum, e) => sum + e.w, 0);
  const last = steps.at(-1)!;
  (last.hi as { tree?: unknown }).tree = chosen.map((e) => ({ ...e }));
  return { steps, output: { edges: chosen.length, weight } };
}

function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const tree = (trace.steps.at(-1)?.hi as { tree?: Array<{ u: number; v: number; w: number }> })
    ?.tree;
  if (!tree) return 'the run returned no tree';
  return isMinimumSpanningTree(input, tree);
}

export const mstPrim: AlgorithmModule = {
  id: 'mst-prim',
  name: "Prim's Algorithm",
  visualizer: 'graph',
  aux: [{ key: 'Q', label: 'Q', hint: 'the vertices not yet in the tree, by key' }],
  procOrder: ['MST-PRIM'],
  procedures: {
    'MST-PRIM': {
      title: 'MST-PRIM(G, w, r)',
      indent: [0, 1, 1, 0, 0, 0, 1, 1, 2, 3, 3],
      lines: [
        'for each vertex u ∈ G.V',
        'u.key = ∞',
        'u.π = NIL',
        'r.key = 0',
        'Q = G.V',
        'while Q ≠ ∅',
        'u = EXTRACT-MIN(Q)',
        'for each vertex v ∈ G.Adj[u]',
        'if v ∈ Q and w(u, v) < v.key',
        'v.π = u',
        'v.key = w(u, v)',
      ],
    },
  },
  complexity: {
    best: 'O(E lg V)',
    average: 'O(E lg V)',
    worst: 'O(E lg V)',
    space: 'Θ(V)',
    extra: [
      ['With a binary heap', 'O(E lg V) — V extractions, E decrease-keys'],
      ['With a Fibonacci heap', 'O(E + V lg V)'],
      ['The cut', 'always the tree against the rest — the same one every step'],
      ['Versus Kruskal', 'one growing tree, not a merging forest'],
      ['Same answer', 'with distinct weights the MST is unique'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2:4, 1-3:8, 2-3:11',
    note: 'undirected and weighted; the tree grows from vertex 1',
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
