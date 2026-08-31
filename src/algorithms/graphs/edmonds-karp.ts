import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmModule,
  type GraphInput,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, generateFlowNetwork, parseGraph, vid } from './graph-input.ts';
import { fkey } from './graph-check.ts';
import {
  flowSnapshot,
  flowValue,
  reachable,
  residual,
  saturated,
  verifyFlow,
  type Flow,
} from './ford-fulkerson.ts';

/**
 * EDMONDS-KARP — CLRS §24.3.
 *
 * Ford-Fulkerson, with the one thing the method left unspecified filled in:
 * **always take a shortest augmenting path**, counting edges and ignoring
 * capacities. Find it with a breadth-first search, which is chapter 20's
 * algorithm doing exactly what it does best.
 *
 * That single choice changes the running time from O(E · |f\*|) — a bound
 * that depends on the *numbers* in the input, and can be made arbitrarily bad
 * with big capacities — to **O(V E²)**, which depends only on the size of the
 * graph. It is one of the cleanest examples in the book of a specification
 * detail being the whole algorithm.
 *
 * Two facts do the work, and both are visible in the run.
 *
 * **The distance from s to any vertex in the residual network never
 * decreases.** Augmenting along a shortest path can only remove edges from
 * the current level structure or add edges that point backwards, and neither
 * can bring a vertex closer.
 *
 * **Every augmentation saturates at least one edge on its path**, and an edge
 * that is saturated cannot appear on another augmenting path until the
 * distance to one of its ends has strictly increased. Since distances only go
 * up, and up to |V|, each edge can be critical at most |V|/2 times — giving
 * at most V E / 2 augmentations in total.
 *
 * The narration names the length of each path it finds. Watch that number: it
 * never goes down, and that is the lemma the whole bound rests on.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const s = g.source ?? 1;
  const t = g.sink ?? g.n;
  const f: Flow = new Map();
  for (const e of g.edges) f.set(fkey(e.u, e.v), 0);

  const { steps, stats, emit } = createRecorder();
  const lengths: number[] = [];

  function base(path?: number[]): Record<string, unknown> {
    const cut = reachable(g, f, s);
    return {
      edges: saturated(g, f),
      mark: [vid(s), vid(t)],
      // Same rule as Ford-Fulkerson's: ring the residual-reachable set only
      // once it is a proper subset, so the ring means "a cut is forming"
      // rather than "everything is still reachable". The BFS steps below
      // override it with the set the search itself has reached.
      ...(cut.size < g.n
        ? {
            scope: [...cut].map(vid),
            scopeLabel: `reachable in G_f: ${[...cut].sort((a, b) => a - b).join(', ')}`,
          }
        : {}),
      aux: {
        p: path ? auxOf([null, ...path]) : auxOf([null]),
        f: auxOf([null, flowValue(g, f, s)], 1, [null, '|f|']),
      },
    };
  }

  emit(
    'EDMONDS-KARP',
    1,
    flowSnapshot(g, f),
    { ...base() },
    `Every edge starts empty. Each label is flow over capacity, and ${s} is the source.`,
  );

  let augmentations = 0;
  for (;;) {
    // ---- BFS for the shortest augmenting path --------------------------
    const parent = new Map<number, { u: number; forward: boolean }>();
    const dist = new Map<number, number>([[s, 0]]);
    const queue = [s];
    const visited = [s];

    while (queue.length > 0 && !dist.has(t)) {
      const u = queue.shift()!;
      stats.comparisons++;
      const found: number[] = [];
      for (let v = 1; v <= g.n; v++) {
        if (dist.has(v) || residual(g, f, u, v) <= 0) continue;
        dist.set(v, dist.get(u)! + 1);
        parent.set(v, { u, forward: g.edges.some((e) => e.u === u && e.v === v) });
        queue.push(v);
        visited.push(v);
        found.push(v);
      }
      const reachedEdges: Record<string, Role> = { ...saturated(g, f) };
      for (const v of found) reachedEdges[ekey(u, v)] = 'look';
      emit(
        'BFS-PATH',
        3,
        flowSnapshot(g, f),
        {
          ...base(),
          look: [vid(u), ...found.map(vid)],
          edges: reachedEdges,
          scope: visited.map(vid),
          scopeLabel: `BFS has reached: ${[...visited].sort((a, b) => a - b).join(', ')}`,
          pointers: { u: vid(u) },
        },
        found.length === 0
          ? `Nothing new leaves ${u} with room to spare.`
          : `From ${u}, at distance ${dist.get(u)}: ${found.join(', ')} ${found.length === 1 ? 'is' : 'are'} one step further.`,
      );
    }

    if (!dist.has(t)) break;

    const path: Array<{ u: number; v: number; forward: boolean }> = [];
    let at = t;
    while (at !== s) {
      const step = parent.get(at)!;
      path.unshift({ u: step.u, v: at, forward: step.forward });
      at = step.u;
    }
    const bottleneck = Math.min(...path.map((p) => residual(g, f, p.u, p.v)));
    lengths.push(path.length);
    augmentations++;

    const vertices = [s, ...path.map((p) => p.v)];
    const pathEdges: Record<string, Role> = { ...saturated(g, f) };
    for (const p of path) pathEdges[ekey(p.u, p.v)] = 'look';
    emit(
      'EDMONDS-KARP',
      2,
      flowSnapshot(g, f),
      { ...base(vertices), look: vertices.map(vid), edges: pathEdges },
      `Shortest path found, ${path.length} edges: ${vertices.join(' → ')}. It can carry ${bottleneck}.`,
    );

    for (const p of path) {
      const key = p.forward ? fkey(p.u, p.v) : fkey(p.v, p.u);
      f.set(key, (f.get(key) ?? 0) + (p.forward ? bottleneck : -bottleneck));
      stats.writes++;
      const moved: Record<string, Role> = { ...saturated(g, f) };
      moved[ekey(p.u, p.v)] = 'move';
      const full = p.forward && residual(g, f, p.u, p.v) === 0;
      emit(
        'EDMONDS-KARP',
        3,
        flowSnapshot(g, f),
        { ...base(vertices), move: [vid(p.u), vid(p.v)], edges: moved },
        p.forward
          ? full
            ? `(${p.u}, ${p.v}) is now full. A saturated edge is what limits the whole path.`
            : `(${p.u}, ${p.v}) carries ${f.get(key)} of its capacity.`
          : `(${p.v}, ${p.u}) drops to ${f.get(key)} — ${bottleneck} of its flow is cancelled.`,
      );
    }
  }

  const cut = reachable(g, f, s);
  const value = flowValue(g, f, s);
  let cutCapacity = 0;
  for (const e of g.edges) if (cut.has(e.u) && !cut.has(e.v)) cutCapacity += e.w ?? 1;
  emit(
    'EDMONDS-KARP',
    4,
    flowSnapshot(g, f),
    {
      ...base(),
      done: [...cut].map(vid),
      flow: [...f.entries()],
      lengths: lengths.slice(),
      augmentations,
    },
    `The search cannot reach ${t}. |f| = ${value}, and the ring is a cut of capacity ${cutCapacity}.`,
  );

  return { steps, output: { value, augmentations, cut: cutCapacity } };
}

/**
 * The flow is maximum — and the two claims §24.3 actually makes about it.
 *
 * Feasibility and optimality come from the shared checker. What is checked
 * here on top of that is what makes this Edmonds-Karp rather than
 * Ford-Fulkerson: the path lengths never decrease, and the number of
 * augmentations stays under the V E / 2 the analysis promises. Neither claim
 * is true of an arbitrary augmenting-path choice, so this is the test that
 * would notice the BFS being quietly replaced by anything else.
 */
function verify(input: number[] | GraphInput, trace: Trace): string | null {
  const complaint = verifyFlow(input, trace);
  if (complaint) return complaint;
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;

  const hi = trace.steps.at(-1)?.hi as { lengths?: number[]; augmentations?: number };
  const lengths = hi?.lengths;
  if (!lengths) return 'the run recorded no path lengths';
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i]! < lengths[i - 1]!) {
      return `path ${i + 1} has ${lengths[i]} edges, shorter than the ${lengths[i - 1]} before it`;
    }
  }
  const bound = (g.n * g.edges.length) / 2;
  if ((hi.augmentations ?? 0) > bound) {
    return `${hi.augmentations} augmentations, over the V·E/2 = ${bound} the bound allows`;
  }
  return null;
}

export const edmondsKarp: AlgorithmModule = {
  id: 'edmonds-karp',
  name: 'Edmonds-Karp',
  visualizer: 'graph',
  aux: [
    { key: 'p', label: 'p', hint: 'the shortest augmenting path the search found' },
    { key: 'f', label: '|f|', hint: 'the value of the flow so far' },
  ],
  procOrder: ['EDMONDS-KARP', 'BFS-PATH'],
  procedures: {
    'EDMONDS-KARP': {
      title: 'EDMONDS-KARP(G, s, t)',
      indent: [0, 1, 1, 0],
      lines: [
        'initialize f to 0 on every edge',
        'while BFS-PATH(G_f, s, t) returns a path p',
        'augment f along p by c_f(p)',
        'return f',
      ],
    },
    // Chapter 20's BFS, run on G_f rather than on G. The book does not
    // restate it in §24.3; it is here because the highlighted line has to be
    // somewhere the reader can see it.
    'BFS-PATH': {
      title: 'BFS-PATH(G_f, s, t)',
      indent: [0, 0, 1, 2, 3, 0],
      lines: [
        'Q = {s}, every distance ∞ except s.d = 0',
        'while Q ≠ ∅',
        'u = DEQUEUE(Q)',
        'for each v with c_f(u, v) > 0 and v undiscovered',
        'v.d = u.d + 1, v.π = u, ENQUEUE(Q, v)',
        'return the path back from t, or NIL',
      ],
    },
  },
  complexity: {
    best: 'O(V E)',
    average: 'O(V E²)',
    worst: 'O(V E²)',
    space: 'Θ(V + E)',
    extra: [
      ['Augmentations', 'at most V·E/2 — independent of the capacities'],
      ['Each one costs', 'O(E), the breadth-first search'],
      ['Path lengths', 'never decrease — the lemma the bound rests on'],
      ['Versus Ford-Fulkerson', 'the same method, with the path choice pinned down'],
      ['Faster still', 'Dinic and push-relabel, both beyond Tier 1 here'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'network',
    placeholder: '1-2:16, 1-3:13, 2-4:12, 3-4:9',
    note: 'directed capacities; 1 is the source and the last vertex the sink',
    label: 'Edges with capacities, as 1-2:16, separated by commas',
    generate: (n) => generateFlowNetwork(n),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: 1, maxWeight: 99 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
