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

/**
 * BREADTH-FIRST SEARCH — CLRS §20.2.
 *
 * The first algorithm in the book that explores rather than computes, and the
 * pattern half of Part VI is built on: keep a set of vertices you have
 * *reached but not yet looked at*, take them in the order you reached them,
 * and every vertex you meet gets its distance and its parent written once and
 * never again.
 *
 * The queue is what makes it breadth-first, and it is the only difference
 * between this and §20.3's depth-first search. Take the frontier from the
 * front and the search spreads in rings; take it from the back and it dives.
 * Watch the ringed vertices in the run below: they are always at one of two
 * distances from the source, never three. That is the invariant the whole
 * shortest-path proof rests on.
 *
 * What comes out is not just "which vertices are reachable" but **the
 * shortest path to every one of them**, in an unweighted graph — the `d`
 * badge is the distance and the coloured edges are the tree of parents. Every
 * one of those paths is found in Θ(V + E) total, because each vertex is
 * enqueued once and each edge is looked at once from each end.
 */

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const s = g.source ?? 1;

  const colour = new Array<number>(g.n + 1).fill(WHITE);
  const d = new Array<number>(g.n + 1).fill(Infinity);
  const pi = new Array<number>(g.n + 1).fill(0);
  /** Edges of the BFS tree, kept coloured for the rest of the run. */
  const tree = new Set<string>();
  const Q: number[] = [];

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g, (v) => ({ d: d[v] === Infinity ? '∞' : d[v]! })),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  /**
   * What is true on every step regardless of what is happening: the tree
   * built so far, the queue as a ring and as a row of chips.
   *
   * The queue is on screen twice on purpose. The ring says *where* the
   * frontier is in the graph; the chips say what **order** it will come off
   * in, which is the thing the picture cannot show and the thing that makes
   * the search breadth-first.
   */
  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const key of tree) edges[key] = 'done';
    return {
      edges,
      ...(Q.length > 0 ? { scope: Q.map(vid), scopeLabel: `Q = ${Q.join(', ')}` } : {}),
      aux: { Q: auxOf([null, ...Q], undefined, [null, ...Q.map((v) => `d=${d[v]}`)]) },
      done: allBlack(),
    };
  }

  const allBlack = (): string[] => {
    const out: string[] = [];
    for (let v = 1; v <= g.n; v++) if (colour[v] === BLACK) out.push(vid(v));
    return out;
  };

  emit(
    'BFS',
    2,
    snapshot(),
    { ...base() },
    `Every vertex starts white, with d = ∞ and no parent: nothing has been reached yet.`,
  );

  colour[s] = GRAY;
  d[s] = 0;
  stats.writes++;
  emit(
    'BFS',
    6,
    snapshot(),
    { ...base(), move: vid(s), pointers: { s: vid(s) } },
    `The source is grey and s.d = 0. Grey means reached but not yet looked at.`,
  );

  Q.push(s);
  emit(
    'BFS',
    9,
    snapshot(),
    { ...base(), mark: vid(s), pointers: { s: vid(s) } },
    `ENQUEUE(Q, s). The queue holds the frontier — the vertices whose neighbours are still unseen.`,
  );

  while (Q.length > 0) {
    const u = Q.shift()!;
    emit(
      'BFS',
      11,
      snapshot(),
      { ...base(), mark: vid(u), pointers: { u: vid(u) } },
      `u = DEQUEUE(Q) = ${u}, at distance ${d[u]}. Everything it reaches is one step further out.`,
    );

    for (const { v } of adj.get(u)!) {
      stats.comparisons++;
      const white = colour[v] === WHITE;
      emit(
        'BFS',
        13,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          look: vid(v),
          edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        white
          ? `${v} is white — never reached. This edge is how the search gets there.`
          : `${v} is already reached, so this edge tells the search nothing new.`,
      );
      if (!white) continue;

      colour[v] = GRAY;
      d[v] = d[u]! + 1;
      pi[v] = u;
      tree.add(ekey(u, v));
      stats.writes += 2;
      emit(
        'BFS',
        15,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          move: vid(v),
          pointers: { u: vid(u), v: vid(v) },
        },
        `v.d = ${d[v]} and v.π = ${u}. Written once — no later edge can reach ${v} any sooner.`,
      );

      Q.push(v);
      emit(
        'BFS',
        17,
        snapshot(),
        { ...base(), mark: vid(u), move: vid(v) },
        `ENQUEUE(Q, ${v}). It goes to the back, behind everything at distance ${d[u]}.`,
      );
    }

    colour[u] = BLACK;
    emit(
      'BFS',
      18,
      snapshot(),
      { ...base(), pointers: { u: vid(u) } },
      `${u} is black: every edge out of it has been looked at, and it is finished.`,
    );
  }

  const reached = d.filter((x) => Number.isFinite(x)).length;
  const last = steps.at(-1)!;
  // The final d and π are the answer, and the last step is the only place a
  // verify can read them from — `Trace.output` holds numbers, not vectors.
  (last.hi as { result?: unknown }).result = { d: d.slice(), pi: pi.slice(), s };
  return { steps, output: { reached, source: s } };
}

/**
 * Three properties that together *are* "d is the shortest distance".
 *
 * This deliberately does not re-run a breadth-first search and compare: that
 * would test the recorder against a second copy of the same idea. What it
 * checks instead is the characterization — no edge is slack, every d is
 * witnessed by its own parent, and everything reachable was reached — which
 * is the proof in §20.2 rather than an echo of the code above it.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const result = trace.steps.at(-1)?.hi as
    { result?: { d: number[]; pi: number[]; s: number } } | undefined;
  const answer = result?.result;
  if (!answer) return 'the run recorded no final d and π';
  const { d, pi, s } = answer;

  if (d[s] !== 0) return `s.d is ${d[s]}, not 0`;

  const adj = adjacency(g);
  for (const [u, list] of adj) {
    for (const { v } of list) {
      if (!Number.isFinite(d[u]!)) continue;
      // No edge may still be slack: if one were, the vertex at its far end
      // could be reached sooner than d says it can.
      if (d[v]! > d[u]! + 1) return `edge ${u}-${v} is slack: d[${v}] = ${d[v]} > ${d[u]} + 1`;
    }
  }

  for (let v = 1; v <= g.n; v++) {
    if (v === s) continue;
    if (!Number.isFinite(d[v]!)) continue;
    const p = pi[v]!;
    if (!p) return `${v} has a finite d but no parent`;
    if (d[p]! + 1 !== d[v]!)
      return `${v}'s parent ${p} has d = ${d[p]}, which does not witness ${d[v]}`;
    if (!adj.get(p)!.some((e) => e.v === v)) return `${v}'s parent ${p} is not adjacent to it`;
  }

  // Everything reachable must have been reached — an unvisited component is
  // the failure the two checks above cannot see.
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
  for (const v of seen) {
    if (!Number.isFinite(d[v]!)) return `${v} is reachable from ${s} but was left at d = ∞`;
  }
  for (let v = 1; v <= g.n; v++) {
    if (!seen.has(v) && Number.isFinite(d[v]!)) return `${v} is not reachable but has d = ${d[v]}`;
  }
  return null;
}

export const bfs: AlgorithmModule = {
  id: 'bfs',
  name: 'Breadth-First Search',
  visualizer: 'graph',
  aux: [{ key: 'Q', label: 'Q', hint: 'the frontier, in the order it will come off' }],
  procOrder: ['BFS'],
  procedures: {
    BFS: {
      title: 'BFS(G, s)',
      indent: [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 3, 3, 1],
      lines: [
        'for each vertex u ∈ G.V − {s}',
        'u.color = WHITE',
        'u.d = ∞',
        'u.π = NIL',
        's.color = GRAY',
        's.d = 0',
        's.π = NIL',
        'Q = ∅',
        'ENQUEUE(Q, s)',
        'while Q ≠ ∅',
        'u = DEQUEUE(Q)',
        'for each v ∈ G.Adj[u]',
        'if v.color == WHITE',
        'v.color = GRAY',
        'v.d = u.d + 1',
        'v.π = u',
        'ENQUEUE(Q, v)',
        'u.color = BLACK',
      ],
    },
  },
  complexity: {
    best: 'Θ(V + E)',
    average: 'Θ(V + E)',
    worst: 'Θ(V + E)',
    space: 'Θ(V)',
    extra: [
      ['Each vertex', 'enqueued and dequeued exactly once'],
      ['Each edge', 'scanned once from each end'],
      ['What d is', 'the true shortest distance, in edges'],
      ['What π is', 'a breadth-first tree of shortest paths'],
      ['Weights', 'none — §22.3 is this idea with a priority queue'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 14,
    noun: 'graph',
    placeholder: '1-2, 1-3, 2-4, 3-4',
    note: 'undirected; the search starts at vertex 1',
    label: 'The edges, as pairs like 1-2, separated by commas',
    generate: (n) => generateUndirected(n, false),
    parse: (text) => parseGraph(text, { directed: false, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 9,
  result: { kind: 'transforms', verify },
  record,
};
