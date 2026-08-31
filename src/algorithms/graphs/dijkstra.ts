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
import { adjacency, ekey, generateDirected, parseGraph, verticesOf, vid } from './graph-input.ts';
import { shortestPathsSound } from './graph-check.ts';

/**
 * DIJKSTRA'S ALGORITHM — CLRS §22.3.
 *
 * Breadth-first search with a priority queue instead of a queue, and that one
 * substitution turns "fewest edges" into "least total weight".
 *
 * The algorithm is greedy, and the greedy step is the interesting part. It
 * repeatedly takes the vertex with the **smallest estimate still outstanding**
 * and declares that estimate final. Why is that safe? Because every path to
 * that vertex has to leave the settled set somewhere, and any other way out
 * already has an estimate at least as large — so no route through it could
 * come back cheaper.
 *
 * That argument uses **non-negative weights** and falls apart without them: a
 * negative edge later on could make a longer-looking route cheaper after all,
 * and a vertex declared final would have been wrong. This is why the book
 * spends §22.1 on Bellman-Ford before it gets here, and why Dijkstra is the
 * faster algorithm rather than the better one.
 *
 * The ringed vertices are the frontier — in the queue with a finite estimate,
 * which is exactly the set of vertices one edge from the settled ones. The
 * square vertices are settled: their badge will not change again.
 *
 * Note what the queue is doing that BFS's did not. A vertex's key can **drop
 * while it is waiting**, which is DECREASE-KEY from chapter 6, and it is why
 * the running time is O(E lg V) rather than O(V lg V): every edge can cause
 * one.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const s = g.source ?? 1;

  const d = new Array<number>(g.n + 1).fill(Infinity);
  const pi = new Array<number>(g.n + 1).fill(0);
  const inQ = new Array<boolean>(g.n + 1).fill(true);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      vertices: verticesOf(g, (v) => ({ d: d[v] === Infinity ? '∞' : d[v]! })),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v), weight: e.w ?? 1 })),
    };
  }

  const settled = (): number[] => {
    const out: number[] = [];
    for (let v = 1; v <= g.n; v++) if (!inQ[v]) out.push(v);
    return out;
  };

  /** Q in the order EXTRACT-MIN would empty it. */
  const queue = (): number[] => {
    const out: number[] = [];
    for (let v = 1; v <= g.n; v++) if (inQ[v]) out.push(v);
    return out.sort((a, b) => d[a]! - d[b]! || a - b);
  };

  /** The parent edge of a settled vertex is settled with it. */
  const treeEdges = (): Record<string, Role> => {
    const out: Record<string, Role> = {};
    for (const v of settled()) if (pi[v]) out[ekey(pi[v]!, v)] = 'done';
    return out;
  };

  function base(): Record<string, unknown> {
    const frontier = queue().filter((v) => Number.isFinite(d[v]!));
    return {
      edges: treeEdges(),
      done: settled().map(vid),
      ...(frontier.length > 0
        ? { scope: frontier.map(vid), scopeLabel: 'the frontier — reachable, not yet settled' }
        : {}),
      aux: {
        Q: auxOf([null, ...queue().map((v) => d[v]!)], undefined, [
          null,
          ...queue().map((v) => `v${v}`),
        ]),
      },
    };
  }

  d[s] = 0;
  stats.writes++;
  emit(
    'INITIALIZE-SINGLE-SOURCE',
    4,
    snapshot(),
    { ...base(), move: vid(s), pointers: { s: vid(s) } },
    `s.d = 0, everything else ∞, and S is empty. Every estimate is an upper bound.`,
  );

  while (queue().length > 0) {
    const u = queue()[0]!;
    if (!Number.isFinite(d[u]!)) {
      // What is left is unreachable: taking it would settle ∞, which is
      // correct but is not what the picture is about.
      inQ[u] = false;
      emit(
        'DIJKSTRA',
        5,
        snapshot(),
        { ...base(), mark: vid(u), pointers: { u: vid(u) } },
        `${u} comes out at ∞: there is no path to it from the source at all.`,
      );
      continue;
    }
    inQ[u] = false;
    emit(
      'DIJKSTRA',
      6,
      snapshot(),
      { ...base(), mark: vid(u), pointers: { u: vid(u) } },
      `EXTRACT-MIN gives ${u} at d = ${d[u]}. Nothing outstanding is closer, so ${d[u]} is final.`,
    );

    for (const { v, w } of adj.get(u)!) {
      stats.comparisons++;
      const slack = inQ[v] && d[u]! + w < d[v]!;
      emit(
        'RELAX',
        1,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          look: vid(v),
          edges: { ...treeEdges(), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        !inQ[v]
          ? `${v} is settled already, so no route through ${u} can improve it.`
          : slack
            ? `${d[u]} + ${w} = ${d[u]! + w} beats ${v}'s ${d[v] === Infinity ? '∞' : d[v]}.`
            : `${d[u]} + ${w} does not beat ${v}'s ${d[v]}, so its key stays.`,
      );
      if (!slack) continue;

      d[v] = d[u]! + w;
      pi[v] = u;
      stats.writes += 2;
      emit(
        'RELAX',
        2,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          move: vid(v),
          edges: { ...treeEdges(), [ekey(u, v)]: 'move' },
          pointers: { v: vid(v) },
        },
        `DECREASE-KEY: ${v}'s estimate drops to ${d[v]}, and it moves up the queue.`,
      );
    }
  }

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = { d: d.slice(), pi: pi.slice(), s };
  const reachable = d.filter((x) => Number.isFinite(x)).length;
  return { steps, output: { source: s, reachable } };
}

function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const answer = (trace.steps.at(-1)?.hi as { result?: { d: number[]; pi: number[]; s: number } })
    ?.result;
  if (!answer) return 'the run recorded no estimates';
  return shortestPathsSound(input, answer.s, answer.d, answer.pi);
}

export const dijkstra: AlgorithmModule = {
  id: 'dijkstra',
  name: "Dijkstra's Algorithm",
  visualizer: 'graph',
  aux: [{ key: 'Q', label: 'Q', hint: 'outstanding estimates, smallest first' }],
  procOrder: ['DIJKSTRA', 'INITIALIZE-SINGLE-SOURCE', 'RELAX'],
  procedures: {
    DIJKSTRA: {
      title: 'DIJKSTRA(G, w, s)',
      indent: [0, 0, 0, 0, 1, 1, 1, 2],
      lines: [
        'INITIALIZE-SINGLE-SOURCE(G, s)',
        'S = ∅',
        'Q = G.V',
        'while Q ≠ ∅',
        'u = EXTRACT-MIN(Q)',
        'S = S ∪ {u}',
        'for each vertex v ∈ G.Adj[u]',
        'RELAX(u, v, w)',
      ],
    },
    'INITIALIZE-SINGLE-SOURCE': {
      title: 'INITIALIZE-SINGLE-SOURCE(G, s)',
      indent: [0, 1, 1, 0],
      lines: ['for each vertex v ∈ G.V', 'v.d = ∞', 'v.π = NIL', 's.d = 0'],
    },
    RELAX: {
      title: 'RELAX(u, v, w)',
      indent: [0, 1, 1],
      lines: ['if v.d > u.d + w(u, v)', 'v.d = u.d + w(u, v)', 'v.π = u'],
    },
  },
  complexity: {
    best: 'O(E lg V)',
    average: 'O(E lg V)',
    worst: 'O(E lg V)',
    space: 'Θ(V)',
    extra: [
      ['With a binary heap', 'O((V + E) lg V)'],
      ['With a Fibonacci heap', 'O(V lg V + E)'],
      ['Requires', 'non-negative weights — the greedy step needs them'],
      ['Each vertex', 'extracted once, and settled for good'],
      ['Unweighted case', 'every weight 1 makes this exactly §20.2'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2:10, 1-3:5, 3-2:3, 2-4:1',
    note: 'directed, weights ≥ 0; paths start at vertex 1',
    label: 'Weighted directed edges, as 1-2:10, separated by commas',
    generate: (n) => generateDirected(n, true),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: 0, maxWeight: 99 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
