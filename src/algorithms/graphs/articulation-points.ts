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
 * ARTICULATION-POINTS — CLRS Problem 20-2.
 *
 * A **cut vertex** is one whose removal disconnects the graph; a **bridge** is
 * an edge with the same property. Both are questions about how fragile a
 * network is, and the obvious way to answer either — take the thing out and
 * see what falls apart — costs a whole traversal per vertex or per edge.
 *
 * The problem's answer is that **one** depth-first search finds all of them,
 * and it turns on a single extra number per vertex. Alongside `d`, the
 * discovery time §20.3 already computes, keep `low`: the earliest discovery
 * time reachable from anywhere in v's subtree using tree edges downward and
 * **at most one back edge**. Then
 *
 *   - a tree edge (u, v) is a **bridge** exactly when `v.low > u.d` — nothing
 *     under v can reach u or anything above it except through that edge;
 *   - a non-root u is a **cut vertex** exactly when some child v has
 *     `v.low ≥ u.d` — the ≥ rather than > is the whole difference, because
 *     reaching u itself is not the same as getting past it;
 *   - the root is a cut vertex exactly when it has **two or more** children in
 *     the search tree, since the tree is then the only thing joining them.
 *
 * `low` is computed on the way *back up* the recursion, which is why the
 * narration has so much to say at line 8: that is the moment a subtree reports
 * what it could reach, and the moment both tests can be made.
 *
 * The badge on each vertex is `d/low`, one pill rather than two, for the
 * reason §20.3's player gives: two bare numbers on a shoulder cannot be told
 * apart, and a reader has no way to know which is which.
 */
export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const { steps, stats, emit } = createRecorder();

  const d = new Array<number>(g.n + 1).fill(0);
  const low = new Array<number>(g.n + 1).fill(0);
  const tree = new Set<string>();
  const bridges = new Set<string>();
  const cut = new Set<number>();
  /** The vertices the recursion is currently inside, deepest last. */
  const path: number[] = [];
  let time = 0;

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g, (v): Record<string, string> =>
        d[v] ? { dlow: `${d[v]}/${low[v]}` } : {},
      ),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  /** Everything true of the picture on every step, whatever the step is doing. */
  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const key of tree) edges[key] = 'done';
    // A bridge is an answer, so it outranks being a tree edge — and every
    // bridge is a tree edge, so without this it would never be seen.
    for (const key of bridges) edges[key] = 'mark';

    const finished: string[] = [];
    for (let v = 1; v <= g.n; v++) {
      if (d[v] && !path.includes(v)) finished.push(vid(v));
    }

    return {
      edges,
      done: finished,
      mark: [...cut].map(vid),
      ...(path.length > 0
        ? { scope: path.map(vid), scopeLabel: `the search is inside: ${path.join(' → ')}` }
        : {}),
      aux: {
        path: auxOf([null, ...path], path.length, [null, ...path.map((v) => `low=${low[v]}`)]),
      },
    };
  }

  function visit(u: number, parent: number): void {
    time++;
    d[u] = time;
    low[u] = time;
    path.push(u);
    stats.writes += 2;
    emit(
      'DFS-AP',
      2,
      snapshot(),
      { ...base(), move: vid(u), pointers: { u: vid(u) } },
      `${u} is discovered at time ${time}. Its low starts equal to its d: on its own, ${u} can reach nothing earlier than itself.`,
    );

    let children = 0;

    for (const { v } of adj.get(u)!) {
      stats.comparisons++;

      if (d[v] === 0) {
        children++;
        tree.add(ekey(u, v));
        emit(
          'DFS-AP',
          6,
          snapshot(),
          {
            ...base(),
            look: vid(v),
            edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
            pointers: { u: vid(u), v: vid(v) },
          },
          `${v} has not been seen, so (${u}, ${v}) is a tree edge and the search goes down it. That is ${u}'s ${
            children === 1 ? 'first' : children === 2 ? 'second' : `${children}th`
          } child.`,
        );

        visit(v, u);

        const before = low[u]!;
        if (low[v]! < low[u]!) low[u] = low[v]!;
        stats.writes++;
        emit(
          'DFS-AP',
          8,
          snapshot(),
          {
            ...base(),
            look: vid(v),
            edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
            pointers: { u: vid(u), v: vid(v) },
          },
          low[u]! < before
            ? `Back up from ${v}, which reported low = ${low[v]}. That is earlier than ${u}'s ${before}, so ${u}.low drops to ${low[u]}.`
            : `Back up from ${v}, which reported low = ${low[v]}. That is no earlier than ${u}'s ${low[u]}, so ${u}.low is unchanged.`,
        );

        const isBridge = low[v]! > d[u]!;
        if (isBridge) bridges.add(ekey(u, v));
        emit(
          'DFS-AP',
          isBridge ? 10 : 9,
          snapshot(),
          {
            ...base(),
            edges: {
              ...(base().edges as Record<string, Role>),
              [ekey(u, v)]: isBridge ? 'mark' : 'look',
            },
            pointers: { u: vid(u), v: vid(v) },
          },
          isBridge
            ? `${v}.low = ${low[v]} is later than ${u}.d = ${d[u]}: nothing under ${v} can reach ${u} or above except through this edge, so (${u}, ${v}) is a bridge.`
            : `${v}.low = ${low[v]} is not later than ${u}.d = ${d[u]}: something under ${v} reaches back past ${u}, so (${u}, ${v}) is on a cycle and is not a bridge.`,
        );

        if (parent !== 0) {
          const isCut = low[v]! >= d[u]!;
          if (isCut) cut.add(u);
          emit(
            'DFS-AP',
            isCut ? 12 : 11,
            snapshot(),
            { ...base(), pointers: { u: vid(u), v: vid(v) } },
            isCut
              ? `${v}.low = ${low[v]} is not earlier than ${u}.d = ${d[u]}: nothing under ${v} gets past ${u}, so removing ${u} strands that subtree. ${u} is a cut vertex.`
              : `${v}.low = ${low[v]} is earlier than ${u}.d = ${d[u]}: the subtree under ${v} reaches past ${u} without it, so this child does not make ${u} a cut vertex.`,
          );
        }
        continue;
      }

      if (v === parent) {
        emit(
          'DFS-AP',
          13,
          snapshot(),
          {
            ...base(),
            look: vid(v),
            edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
            pointers: { u: vid(u), v: vid(v) },
          },
          `(${u}, ${v}) is the edge the search came down. Every undirected edge is met from both ends, and going back up the one you arrived on is not a back edge.`,
        );
        continue;
      }

      const before = low[u]!;
      if (d[v]! < low[u]!) low[u] = d[v]!;
      stats.writes++;
      emit(
        'DFS-AP',
        14,
        snapshot(),
        {
          ...base(),
          look: vid(v),
          edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        low[u]! < before
          ? `${v} was already discovered at time ${d[v]}, so (${u}, ${v}) is a back edge to an ancestor — and it reaches earlier than ${before}, so ${u}.low drops to ${low[u]}.`
          : `${v} was already discovered at time ${d[v]}, so (${u}, ${v}) is a back edge — but ${u} could already reach time ${low[u]}, so nothing changes.`,
      );
    }

    path.pop();

    if (parent === 0) {
      const isCut = children >= 2;
      if (isCut) cut.add(u);
      emit(
        'DFS-AP',
        16,
        snapshot(),
        { ...base(), pointers: { u: vid(u) } },
        isCut
          ? `${u} is the root of this search tree and has ${children} children. The only thing joining those subtrees is ${u} itself, so it is a cut vertex.`
          : `${u} is the root of this search tree and has ${children} child${
              children === 1 ? '' : 'ren'
            }. A root with fewer than two children holds nothing together, so it is not a cut vertex.`,
      );
    }
  }

  emit('ARTICULATION-POINTS', 1, snapshot(), { ...base() }, `Nothing is discovered yet.`);

  for (let u = 1; u <= g.n; u++) {
    if (d[u] !== 0) continue;
    emit(
      'ARTICULATION-POINTS',
      5,
      snapshot(),
      { ...base(), mark: [vid(u), ...[...cut].map(vid)], pointers: { u: vid(u) } },
      `${u} has not been reached, so the search starts a new tree at it.`,
    );
    visit(u, 0);
  }

  emit(
    'ARTICULATION-POINTS',
    6,
    snapshot(),
    { ...base() },
    cut.size === 0 && bridges.size === 0
      ? `Done in one pass: no cut vertices and no bridges. Every vertex and every edge lies on a cycle, so nothing here is load-bearing.`
      : `Done in one pass: ${cut.size} cut vertex${cut.size === 1 ? '' : 'es'} and ${
          bridges.size
        } bridge${bridges.size === 1 ? '' : 's'}. Removing any one of them breaks the graph in two.`,
  );

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = {
    cut: [...cut].sort((a, b) => a - b),
    bridges: [...bridges].sort(),
    low: low.slice(),
    d: d.slice(),
  };
  return { steps, output: { vertices: g.n, cut: cut.size, bridges: bridges.size } };
}

// ── The definitions, brute-forced ──────────────────────────────────────────
//
// Shared by `generate` and `verify` and by nothing else. `record` computes its
// answer from the low-link recurrence; these take the thing out and count what
// falls apart, which is what Problem 20-2 actually defines a cut vertex and a
// bridge to be.

/** How many connected components a vertex set and edge list have. */
function components(vertices: number[], edges: Array<{ u: number; v: number }>): number {
  const present = new Set(vertices);
  const seen = new Set<number>();
  let count = 0;
  for (const start of vertices) {
    if (seen.has(start)) continue;
    count++;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const x = stack.pop()!;
      for (const e of edges) {
        const y = e.u === x ? e.v : e.v === x ? e.u : 0;
        if (y && present.has(y) && !seen.has(y)) {
          seen.add(y);
          stack.push(y);
        }
      }
    }
  }
  return count;
}

/** The vertices whose removal breaks the graph into more pieces. */
function cutVerticesOf(g: GraphInput): number[] {
  const all = Array.from({ length: g.n }, (_, i) => i + 1);
  const whole = components(all, g.edges);
  const out: number[] = [];
  for (const v of all) {
    const rest = all.filter((x) => x !== v);
    const kept = g.edges.filter((e) => e.u !== v && e.v !== v);
    // Removing a vertex removes one component's worth of nothing when it was
    // isolated, so compare against the graph minus that vertex, not against
    // the whole graph's count plus one.
    if (components(rest, kept) > whole) out.push(v);
  }
  return out;
}

/** The edges whose removal breaks the graph into more pieces. */
function bridgesOf(g: GraphInput): string[] {
  const all = Array.from({ length: g.n }, (_, i) => i + 1);
  const whole = components(all, g.edges);
  const out: string[] = [];
  for (let i = 0; i < g.edges.length; i++) {
    const kept = g.edges.filter((_, j) => j !== i);
    if (components(all, kept) > whole) {
      const e = g.edges[i]!;
      out.push(ekey(Math.min(e.u, e.v), Math.max(e.u, e.v)));
    }
  }
  return out;
}

/** Normalize an edge key so either orientation compares equal. */
function canonical(key: string): string {
  const [a, b] = key.split('>').map((s) => Number(s.replace('v', '')));
  return ekey(Math.min(a!, b!), Math.max(a!, b!));
}

export const articulationPoints: AlgorithmModule = {
  id: 'articulation-points',
  name: 'Articulation Points',
  visualizer: 'graph',
  aux: [
    {
      key: 'path',
      label: 'stack',
      hint: 'the vertices the search is inside, with their low values',
    },
  ],
  procOrder: ['ARTICULATION-POINTS', 'DFS-AP'],
  procedures: {
    'ARTICULATION-POINTS': {
      title: 'ARTICULATION-POINTS(G)',
      indent: [0, 0, 1, 0, 1, 0],
      lines: [
        'time = 0',
        'for each vertex u ∈ G.V',
        'u.d = NIL',
        'for each vertex u ∈ G.V',
        'if u.d == NIL',
        'DFS-AP(G, u, NIL)',
      ],
    },
    'DFS-AP': {
      title: 'DFS-AP(G, u, parent)',
      indent: [0, 0, 0, 0, 1, 2, 2, 2, 2, 3, 2, 3, 1, 2, 0, 1],
      lines: [
        'time = time + 1',
        'u.d = u.low = time',
        'children = 0',
        'for each v ∈ G.Adj[u]',
        'if v.d == NIL',
        'children = children + 1',
        'DFS-AP(G, v, u)',
        'u.low = min(u.low, v.low)',
        'if v.low > u.d',
        '(u, v) is a bridge',
        'if parent ≠ NIL and v.low ≥ u.d',
        'u is a cut vertex',
        'elseif v ≠ parent',
        'u.low = min(u.low, v.d)',
        'if parent == NIL and children ≥ 2',
        'u is a cut vertex',
      ],
    },
  },
  complexity: {
    best: 'Θ(V + E)',
    average: 'Θ(V + E)',
    worst: 'Θ(V + E)',
    space: 'Θ(V)',
    extra: [
      ['The obvious way', 'Θ(V · (V+E)) — remove each vertex and re-traverse'],
      ['low[v]', 'earliest d reachable from v’s subtree using one back edge'],
      ['Bridge', 'a tree edge (u, v) with v.low > u.d'],
      ['Cut vertex', 'a non-root u with a child v where v.low ≥ u.d'],
      ['The root', 'a cut vertex iff it has two or more children'],
    ],
  },
  input: {
    minSize: 5,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2, 2-3, 3-1, 3-4, 4-5',
    note: 'undirected and connected — sparse enough to have something to break',
    label: 'The undirected edges, as pairs like 1-2, separated by commas',
    /**
     * Sparse, and retried until it has something to find.
     *
     * The default 0.45 of the spare grid edges leaves a graph so
     * well-connected that it usually has no cut vertex at all, and a player
     * whose answer is routinely "nothing" teaches nothing. 0.18 keeps it close
     * to a spanning tree, where cut vertices and bridges are everywhere.
     */
    generate(n: number): GraphInput {
      let best = generateUndirected(n, false, 0.18);
      for (let attempt = 0; attempt < 40; attempt++) {
        const g = generateUndirected(n, false, 0.18);
        // Both kinds on screen at once, and at least one edge that is *not* a
        // bridge — otherwise the graph is a tree and every test says yes.
        if (
          cutVerticesOf(g).length > 0 &&
          bridgesOf(g).length > 0 &&
          bridgesOf(g).length < g.edges.length
        ) {
          return g;
        }
        best = g;
      }
      return best;
    },
    parse: (text) => parseGraph(text, { directed: false, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 9,
  result: {
    kind: 'transforms',
    /**
     * Problem 20-2's own definitions, not its recurrence.
     *
     * A cut vertex is one whose removal leaves more components than before,
     * and a bridge is an edge with the same property. That is what is checked
     * here — by removing each in turn and counting — so the low-link argument
     * the recorder implements is being tested against the thing it claims to
     * compute rather than against a second copy of itself.
     */
    verify(input: AlgorithmInput, trace: Trace): string | null {
      if (!isGraphInput(input)) return 'not a graph input';
      const answer = (trace.steps.at(-1)?.hi as { result?: { cut: number[]; bridges: string[] } })
        ?.result;
      if (!answer) return 'the run recorded no answer';

      const expectedCut = cutVerticesOf(input).join(',');
      const gotCut = [...answer.cut].sort((a, b) => a - b).join(',');
      if (gotCut !== expectedCut) {
        return `reported cut vertices [${gotCut}], but removing each vertex gives [${expectedCut}]`;
      }

      const expectedBridges = bridgesOf(input).sort().join(' ');
      const gotBridges = answer.bridges.map(canonical).sort().join(' ');
      if (gotBridges !== expectedBridges) {
        return `reported bridges [${gotBridges}], but removing each edge gives [${expectedBridges}]`;
      }
      return null;
    },
  },
  record,
};
