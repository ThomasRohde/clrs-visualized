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
import { adjacency, ekey, generateDag, parseDag, verticesOf, vid } from './graph-input.ts';
import { shortestPathsSound } from './graph-check.ts';

/**
 * SHORTEST PATHS IN A DAG — CLRS §22.2.
 *
 * The fastest of the three, and the only one that is linear. It costs
 * Θ(V + E): one relaxation of every edge, in the right order, and nothing
 * else. No priority queue, no repeated passes.
 *
 * The right order is the topological one, and that is the entire idea. Take
 * the vertices in topological order and relax every edge out of each. When
 * you arrive at a vertex, every edge that could possibly reach it has already
 * been relaxed — because every such edge comes from a vertex earlier in the
 * order — so its estimate is already final. One look per edge is enough.
 *
 * Negative weights are fine, and the run below has some. Nothing here assumes
 * that adding an edge makes a path longer, which is exactly the assumption
 * Dijkstra depends on and Bellman-Ford pays for. A DAG cannot have a cycle at
 * all, so it certainly cannot have a negative one.
 *
 * What this buys, and it is more than it sounds: **any** problem shaped like
 * "a sequence of stages, each depending on earlier ones" is a DAG shortest
 * (or longest) path. Critical paths through a schedule, PERT charts, the
 * longest chain of dependencies in a build — all of them are this algorithm
 * with the sign flipped.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const s = g.source ?? 1;

  const d = new Array<number>(g.n + 1).fill(Infinity);
  const pi = new Array<number>(g.n + 1).fill(0);
  const settled = new Set<number>();

  const { steps, stats, emit } = createRecorder();

  // The topological order, computed the way §20.4 does it: finish times from
  // a depth-first search, reversed.
  const order: number[] = [];
  const seen = new Array<boolean>(g.n + 1).fill(false);
  const walk = (u: number): void => {
    seen[u] = true;
    for (const { v } of adj.get(u)!) if (!seen[v]) walk(v);
    order.unshift(u);
  };
  for (let v = 1; v <= g.n; v++) if (!seen[v]) walk(v);

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      vertices: verticesOf(g, (v) => ({ d: d[v] === Infinity ? '∞' : d[v]! })),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v), weight: e.w ?? 1 })),
    };
  }

  /**
   * A parent edge is drawn as settled only once its child has been passed in
   * the order — before that the estimate can still improve, and a colour that
   * said otherwise would be claiming the answer early.
   */
  const treeEdges = (): Record<string, Role> => {
    const out: Record<string, Role> = {};
    for (const v of settled) if (pi[v]) out[ekey(pi[v]!, v)] = 'done';
    return out;
  };

  function base(i?: number): Record<string, unknown> {
    const ring: string[] = [];
    for (let v = 1; v <= g.n; v++) {
      if (!settled.has(v) && Number.isFinite(d[v]!)) ring.push(vid(v));
    }
    return {
      edges: treeEdges(),
      done: [...settled].map(vid),
      ...(ring.length > 0 ? { scope: ring, scopeLabel: 'reached, but not yet final' } : {}),
      aux: {
        order: auxOf([null, ...order], i === undefined ? undefined : i + 1, [
          null,
          ...order.map((v) => (d[v] === Infinity ? '∞' : String(d[v]))),
        ]),
      },
    };
  }

  emit(
    'DAG-SHORTEST-PATHS',
    1,
    snapshot(),
    { ...base() },
    `Topological order: ${order.join(', ')}. Every edge in the picture points later in it.`,
  );

  d[s] = 0;
  stats.writes++;
  emit(
    'INITIALIZE-SINGLE-SOURCE',
    4,
    snapshot(),
    { ...base(), move: vid(s), pointers: { s: vid(s) } },
    `s.d = 0 and every other estimate is ∞.`,
  );

  for (let i = 0; i < order.length; i++) {
    const u = order[i]!;
    settled.add(u);
    emit(
      'DAG-SHORTEST-PATHS',
      3,
      snapshot(),
      { ...base(i), mark: vid(u), pointers: { u: vid(u) } },
      Number.isFinite(d[u]!)
        ? `u = ${u}. Every edge into it has already been relaxed, so d = ${d[u]} is final.`
        : `u = ${u}, unreachable from the source. Its edges still get relaxed, and change nothing.`,
    );

    for (const { v, w } of adj.get(u)!) {
      stats.comparisons++;
      const slack = d[u]! + w < d[v]!;
      emit(
        'RELAX',
        1,
        snapshot(),
        {
          ...base(i),
          mark: vid(u),
          look: vid(v),
          edges: { ...treeEdges(), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        !Number.isFinite(d[u]!)
          ? `${u} has no path from the source, so it can offer ${v} nothing.`
          : slack
            ? `${d[u]} + ${w} = ${d[u]! + w} beats ${v}'s ${d[v] === Infinity ? '∞' : d[v]}.`
            : `${d[u]} + ${w} does not beat ${v}'s ${d[v]}, so ${v} keeps what it has.`,
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
          ...base(i),
          mark: vid(u),
          move: vid(v),
          edges: { ...treeEdges(), [ekey(u, v)]: 'move' },
          pointers: { v: vid(v) },
        },
        `v.d = ${d[v]}, through ${u}. This is the last time ${v} can be improved from ${u}.`,
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

export const dagShortestPaths: AlgorithmModule = {
  id: 'dag-shortest-paths',
  name: 'DAG Shortest Paths',
  visualizer: 'graph',
  aux: [{ key: 'order', label: 'order', hint: 'the topological order, captioned with each d' }],
  procOrder: ['DAG-SHORTEST-PATHS', 'INITIALIZE-SINGLE-SOURCE', 'RELAX'],
  procedures: {
    'DAG-SHORTEST-PATHS': {
      title: 'DAG-SHORTEST-PATHS(G, w, s)',
      indent: [0, 0, 0, 1, 2],
      lines: [
        'topologically sort the vertices of G',
        'INITIALIZE-SINGLE-SOURCE(G, s)',
        'for each vertex u, taken in topologically sorted order',
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
    best: 'Θ(V + E)',
    average: 'Θ(V + E)',
    worst: 'Θ(V + E)',
    space: 'Θ(V)',
    extra: [
      ['Relaxations per edge', 'exactly one'],
      ['Negative weights', 'yes — a DAG has no cycle to make negative'],
      ['Why it is linear', 'the topological order makes each estimate final on arrival'],
      ['Longest paths too', 'negate every weight and run it unchanged'],
      ['Requires', 'a directed acyclic graph'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'DAG',
    placeholder: '1-2:5, 1-3:3, 2-4:6, 3-4:-2',
    note: 'acyclic and weighted; negative weights allowed',
    label: 'Weighted directed edges, as 1-2:5, separated by commas',
    generate: (n) => generateDag(n, true, true),
    parse: (text) =>
      parseDag(text, { directed: true, weighted: true, minWeight: -20, maxWeight: 99 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
