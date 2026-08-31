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
import { ekey, generateWeightedDigraph, parseGraph, verticesOf, vid } from './graph-input.ts';
import { shortestPathsSound } from './graph-check.ts';

/**
 * THE BELLMAN-FORD ALGORITHM — CLRS §22.1.
 *
 * The most general single-source shortest-path algorithm in the book, and the
 * least clever: relax every edge, |V| − 1 times, and stop. No priority queue,
 * no ordering, no cleverness about which edge to look at next — and in
 * exchange it handles **negative weights**, which neither of the other two
 * can.
 *
 * The argument for |V| − 1 passes is worth having, because it explains the
 * number exactly. A shortest path has at most |V| − 1 edges. After one pass
 * over every edge, every shortest path of one edge is correct; after two,
 * every shortest path of two edges; and so on. Nothing about the *order* the
 * edges are relaxed in matters, which is why this needs no queue.
 *
 * Most of the relaxations do nothing. That is not waste to be optimised away
 * — it is the price of not knowing which ones will, and the reason the bound
 * is Θ(VE) rather than something better.
 *
 * The last loop is not an afterthought: it is what makes the algorithm
 * **return an answer about the question**. If an edge is still slack after
 * |V| − 1 passes then no finite answer exists, because there is a negative
 * cycle you can go round again for less. Detecting that is something Dijkstra
 * cannot do at all.
 *
 * The generated graphs below have negative edges and real cycles, and no
 * negative cycle — the back edges are made heavy enough that none can exist.
 * So the final pass always reports TRUE here, and the reader can see it check.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const s = g.source ?? 1;
  const edges = g.edges.map((e) => ({ u: e.u, v: e.v, w: e.w ?? 1 }));

  const d = new Array<number>(g.n + 1).fill(Infinity);
  const pi = new Array<number>(g.n + 1).fill(0);
  let proved = false;

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      vertices: verticesOf(g, (v) => ({ d: d[v] === Infinity ? '∞' : d[v]! })),
      edges: edges.map((e) => ({ from: vid(e.u), to: vid(e.v), weight: e.w })),
    };
  }

  /** The parent edges — the shortest-path tree as it currently stands. */
  const treeEdges = (): Record<string, Role> => {
    const out: Record<string, Role> = {};
    for (let v = 1; v <= g.n; v++) if (pi[v]) out[ekey(pi[v]!, v)] = proved ? 'done' : 'mark';
    return out;
  };

  const reached = (): number[] => {
    const out: number[] = [];
    for (let v = 1; v <= g.n; v++) if (Number.isFinite(d[v]!) && v !== s) out.push(v);
    return out;
  };

  function base(pass?: number): Record<string, unknown> {
    const ring = reached();
    return {
      edges: treeEdges(),
      ...(proved
        ? { done: verticesOf(g).map((x) => x.id) }
        : { mark: vid(s), ...(ring.length > 0 ? { scope: ring.map(vid) } : {}) }),
      ...(pass !== undefined && !proved ? { scopeLabel: `pass ${pass} of ${g.n - 1}` } : {}),
      aux: {
        d: auxOf([null, ...Array.from({ length: g.n }, (_, i) => d[i + 1]!)], undefined, [
          null,
          ...Array.from({ length: g.n }, (_, i) => `v${i + 1}`),
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
    { ...base() },
    `Every estimate starts at ∞ except the source's, which is 0. All of them are upper bounds.`,
  );

  for (let pass = 1; pass <= g.n - 1; pass++) {
    let changed = 0;
    for (const e of edges) {
      stats.comparisons++;
      const slack = d[e.u]! + e.w < d[e.v]!;
      emit(
        'RELAX',
        1,
        snapshot(),
        {
          ...base(pass),
          look: [vid(e.u), vid(e.v)],
          edges: { ...treeEdges(), [ekey(e.u, e.v)]: 'look' },
          pointers: { u: vid(e.u), v: vid(e.v) },
        },
        !Number.isFinite(d[e.u]!)
          ? `${e.u} is still unreached, so this edge cannot help ${e.v} yet.`
          : slack
            ? `${d[e.u]} + ${e.w} = ${d[e.u]! + e.w} beats ${e.v}'s ${d[e.v] === Infinity ? '∞' : d[e.v]}.`
            : `${d[e.u]} + ${e.w} does not beat ${e.v}'s ${d[e.v]}. Nothing to do.`,
      );
      if (!slack) continue;

      d[e.v] = d[e.u]! + e.w;
      pi[e.v] = e.u;
      changed++;
      stats.writes += 2;
      emit(
        'RELAX',
        2,
        snapshot(),
        {
          ...base(pass),
          move: vid(e.v),
          edges: { ...treeEdges(), [ekey(e.u, e.v)]: 'move' },
          pointers: { v: vid(e.v) },
        },
        `v.d = ${d[e.v]} and v.π = ${e.u}. The estimate came down; it may come down again.`,
      );
    }
    emit(
      'BELLMAN-FORD',
      2,
      snapshot(),
      { ...base(pass) },
      changed === 0
        ? `Pass ${pass} changed nothing. Every later pass will change nothing either.`
        : `Pass ${pass} improved ${changed} estimate${changed === 1 ? '' : 's'}. ${g.n - 1 - pass} pass${g.n - 2 - pass === 0 ? '' : 'es'} left.`,
    );
  }

  let ok = true;
  for (const e of edges) {
    stats.comparisons++;
    if (d[e.u]! + e.w < d[e.v]!) ok = false;
  }
  proved = ok;
  emit(
    'BELLMAN-FORD',
    ok ? 8 : 7,
    snapshot(),
    { ...base() },
    ok
      ? `No edge is left slack, so return TRUE: every d is a true shortest-path distance.`
      : `An edge is still slack after |V| − 1 passes — there is a negative cycle. Return FALSE.`,
  );

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = { d: d.slice(), pi: pi.slice(), s, ok };
  return { steps, output: { source: s, negativeCycle: ok ? 0 : 1 } };
}

function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const answer = (
    trace.steps.at(-1)?.hi as { result?: { d: number[]; pi: number[]; s: number; ok: boolean } }
  )?.result;
  if (!answer) return 'the run recorded no estimates';
  // The generator makes negative cycles impossible, so a FALSE here is a bug
  // in the generator or in the run — either way it is not a passing case.
  if (!answer.ok) return 'the run reported a negative cycle, which this generator cannot produce';
  return shortestPathsSound(input, answer.s, answer.d, answer.pi);
}

export const bellmanFord: AlgorithmModule = {
  id: 'bellman-ford',
  name: 'Bellman-Ford',
  visualizer: 'graph',
  aux: [{ key: 'd', label: 'd', hint: 'the estimate at every vertex — all upper bounds' }],
  procOrder: ['BELLMAN-FORD', 'INITIALIZE-SINGLE-SOURCE', 'RELAX'],
  procedures: {
    'BELLMAN-FORD': {
      title: 'BELLMAN-FORD(G, w, s)',
      indent: [0, 0, 1, 2, 0, 1, 2, 0],
      lines: [
        'INITIALIZE-SINGLE-SOURCE(G, s)',
        'for i = 1 to |G.V| − 1',
        'for each edge (u, v) ∈ G.E',
        'RELAX(u, v, w)',
        'for each edge (u, v) ∈ G.E',
        'if v.d > u.d + w(u, v)',
        'return FALSE',
        'return TRUE',
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
    best: 'Θ(V E)',
    average: 'Θ(V E)',
    worst: 'Θ(V E)',
    space: 'Θ(V)',
    extra: [
      ['Negative weights', 'yes — the only one of the three that allows them'],
      ['Negative cycles', 'detected, and reported as FALSE'],
      ['Why |V| − 1 passes', 'a shortest path has at most |V| − 1 edges'],
      ['Edge order', 'irrelevant — which is why there is no queue'],
      ['Versus Dijkstra', 'no priority queue, and a factor of V slower'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 9,
    noun: 'graph',
    placeholder: '1-2:6, 1-3:7, 2-4:5, 3-2:-3',
    note: 'directed and weighted; negative weights allowed',
    label: 'Weighted directed edges, as 1-2:6, separated by commas',
    generate: (n) => generateWeightedDigraph(n),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: -20, maxWeight: 99 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 6,
  result: { kind: 'transforms', verify },
  record,
};
