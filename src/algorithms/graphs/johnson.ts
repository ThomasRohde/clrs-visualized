import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphData,
  type GraphEdge,
  type GraphInput,
  type GraphVertex,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, generateWeightedDigraph, parseGraph, vid } from './graph-input.ts';

/**
 * JOHNSON'S ALGORITHM — CLRS §23.3.
 *
 * All-pairs shortest paths on a **sparse** graph, in O(V² lg V + V E) — which
 * beats Floyd-Warshall's Θ(V³) whenever the edges are few.
 *
 * The plan is obvious and blocked: run Dijkstra from every vertex. Dijkstra
 * is the fast single-source algorithm, and V of them would give exactly the
 * bound above. But Dijkstra requires non-negative weights, and this chapter's
 * whole reason for existing is graphs that have negative ones.
 *
 * **So change the weights.** Give every vertex a number `h(v)` and reweight
 * every edge:
 *
 *     ŵ(u, v) = w(u, v) + h(u) − h(v)
 *
 * Two things make this exactly the right transformation, and both are worth
 * seeing rather than being told.
 *
 * **It preserves shortest paths.** Along any path from a to b the h terms
 * telescope: every intermediate vertex contributes `+h` once and `−h` once,
 * and everything cancels except `h(a) − h(b)`. So *every* path from a to b
 * changes by the same amount, and the shortest one stays the shortest. That
 * is why the correction at the end is a single subtraction and not a
 * recomputation.
 *
 * **It can be made non-negative.** Take `h(v)` to be the shortest distance
 * from a new source joined to everything with weight 0. Then
 * `h(v) ≤ h(u) + w(u, v)` for every edge — that is just the triangle
 * inequality, and it is what §22.5 proves — which rearranges to `ŵ ≥ 0`
 * exactly.
 *
 * Watch the edge labels change in the run. Every negative weight goes to
 * zero or above, and no path's ranking moves. The extra vertex is drawn for
 * the whole trace, but it does nothing after the reweighting: it exists only
 * to be a source that reaches everything.
 *
 * The V Dijkstra runs afterwards are §22.3's player, so they are summarised
 * here one source at a time rather than stepped through again.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const n = g.n;
  const S = n + 1;

  const w = new Map<string, number>();
  for (const e of g.edges) {
    const k = ekey(e.u, e.v);
    w.set(k, Math.min(w.get(k) ?? Infinity, e.w ?? 1));
  }

  const { steps, stats, emit } = createRecorder();

  /** h from Bellman-Ford; ŵ once reweighted; badges show whichever is current. */
  const h = new Array<number>(n + 2).fill(0);
  const hat = new Map<string, number>();
  let phase: 'h' | 'reweight' | 'dijkstra' = 'h';
  const badge = new Array<number | string>(n + 2).fill('');
  const tree = new Map<string, Role>();
  let ring: number[] = [];
  let ringLabel = '';
  let source = 0;

  /**
   * Positions: the original layout squeezed right, with the new source alone
   * on the left. Fixed for the whole trace, like every graph on the site —
   * the extra vertex stays on screen after it stops mattering rather than
   * moving everything when it goes.
   */
  function vertices(): GraphVertex[] {
    const out: GraphVertex[] = [];
    for (let v = 1; v <= n; v++) {
      const p = g.pos?.[v];
      out.push({
        id: vid(v),
        label: v,
        ...(p ? { x: 0.18 + 0.82 * p.x, y: p.y } : {}),
        ...(badge[v] === '' ? {} : { attrs: { h: badge[v]! } }),
      });
    }
    out.push({ id: vid(S), label: 's', x: 0, y: 0.5 });
    return out;
  }

  function snapshot(): GraphData {
    const edges: GraphEdge[] = [];
    for (const e of g.edges) {
      const key = ekey(e.u, e.v);
      const original = w.get(key)!;
      const reweighted = hat.get(key);
      edges.push({
        from: vid(e.u),
        to: vid(e.v),
        weight: reweighted === undefined ? original : reweighted,
      });
    }
    // The added edges are drawn dashed: they are not part of G, and after the
    // reweighting they are not part of anything.
    for (let v = 1; v <= n; v++) {
      edges.push({ from: vid(S), to: vid(v), weight: 0, ghost: true });
    }
    return { kind: 'graph', directed: true, vertices: vertices(), edges };
  }

  function base(): Record<string, unknown> {
    return {
      edges: Object.fromEntries(tree),
      ...(phase === 'dijkstra' ? { mark: vid(source) } : { mark: vid(S) }),
      ...(ring.length > 0 ? { scope: ring.map(vid), scopeLabel: ringLabel } : {}),
      aux: {
        h: auxOf(
          [
            null,
            ...Array.from({ length: n }, (_, i) =>
              typeof badge[i + 1] === 'number' ? (badge[i + 1] as number) : null,
            ),
          ],
          undefined,
          [null, ...Array.from({ length: n }, (_, i) => `v${i + 1}`)],
        ),
      },
    };
  }

  emit(
    'JOHNSON',
    1,
    snapshot(),
    { ...base() },
    `A new vertex s, joined to every vertex with weight 0. It cannot create a path between others.`,
  );

  // ---- h, by Bellman-Ford from s ---------------------------------------
  const d = new Array<number>(n + 2).fill(Infinity);
  d[S] = 0;
  for (let v = 1; v <= n; v++) d[v] = 0;
  for (let pass = 1; pass <= n; pass++) {
    let changed = 0;
    for (const e of g.edges) {
      stats.comparisons++;
      const via = d[e.u]! + w.get(ekey(e.u, e.v))!;
      if (via < d[e.v]!) {
        d[e.v] = via;
        changed++;
        stats.writes++;
      }
    }
    for (let v = 1; v <= n; v++) badge[v] = d[v]!;
    ring = Array.from({ length: n }, (_, i) => i + 1).filter((v) => d[v]! < 0);
    ringLabel = 'reachable more cheaply than 0';
    emit(
      'JOHNSON',
      5,
      snapshot(),
      {
        ...base(),
        ...(changed > 0 ? { move: Array.from({ length: n }, (_, i) => vid(i + 1)) } : {}),
      },
      changed === 0
        ? `Pass ${pass} changed nothing: h is settled.`
        : `Pass ${pass} of Bellman-Ford: ${changed} estimate${changed === 1 ? '' : 's'} improved.`,
    );
    if (changed === 0) break;
  }
  for (let v = 1; v <= n; v++) h[v] = d[v]!;

  // ---- reweight ---------------------------------------------------------
  phase = 'reweight';
  ring = [];
  ringLabel = '';
  for (const e of g.edges) {
    const key = ekey(e.u, e.v);
    const before = w.get(key)!;
    const after = before + h[e.u]! - h[e.v]!;
    hat.set(key, after);
    stats.writes++;
    emit(
      'JOHNSON',
      7,
      snapshot(),
      {
        ...base(),
        look: [vid(e.u), vid(e.v)],
        edges: { ...Object.fromEntries(tree), [key]: 'move' },
      },
      `ŵ(${e.u},${e.v}) = ${before} + ${h[e.u]} − ${h[e.v]} = ${after}. Never negative — that is the point.`,
    );
  }

  // ---- V runs of Dijkstra ----------------------------------------------
  phase = 'dijkstra';
  const D: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(n + 1).fill(Infinity),
  );
  const hatAdj = new Map<number, Array<{ v: number; w: number }>>();
  for (let v = 1; v <= n; v++) hatAdj.set(v, []);
  for (const e of g.edges) hatAdj.get(e.u)!.push({ v: e.v, w: hat.get(ekey(e.u, e.v))! });

  for (let u = 1; u <= n; u++) {
    source = u;
    const est = new Array<number>(n + 1).fill(Infinity);
    const parent = new Array<number>(n + 1).fill(0);
    est[u] = 0;
    const left = new Set<number>(Array.from({ length: n }, (_, i) => i + 1));
    while (left.size > 0) {
      let best = -1;
      for (const v of left) if (best === -1 || est[v]! < est[best]!) best = v;
      left.delete(best);
      if (!Number.isFinite(est[best]!)) continue;
      for (const edge of hatAdj.get(best)!) {
        stats.comparisons++;
        if (est[best]! + edge.w < est[edge.v]!) {
          est[edge.v] = est[best]! + edge.w;
          parent[edge.v] = best;
          stats.writes++;
        }
      }
    }

    tree.clear();
    for (let v = 1; v <= n; v++) if (parent[v]) tree.set(ekey(parent[v]!, v), 'done');
    for (let v = 1; v <= n; v++) badge[v] = Number.isFinite(est[v]!) ? est[v]! : '∞';
    ring = Array.from({ length: n }, (_, i) => i + 1).filter((v) => Number.isFinite(est[v]!));
    ringLabel = `δ̂ from ${u}, on the reweighted graph`;
    emit(
      'JOHNSON',
      10,
      snapshot(),
      { ...base(), done: ring.map(vid) },
      `Dijkstra from ${u} on ŵ. Every weight is non-negative, so Dijkstra is allowed.`,
    );

    for (let v = 1; v <= n; v++) {
      D[u]![v] = Number.isFinite(est[v]!) ? est[v]! + h[v]! - h[u]! : Infinity;
      badge[v] = Number.isFinite(D[u]![v]!) ? D[u]![v]! : '∞';
    }
    stats.writes += n;
    emit(
      'JOHNSON',
      12,
      snapshot(),
      { ...base(), move: ring.map(vid) },
      `d(${u},v) = δ̂(${u},v) + h(v) − h(${u}). One subtraction each — the h terms telescoped away.`,
    );
  }

  const last = steps.at(-1)!;
  (last.hi as { matrix?: unknown }).matrix = D.map((row) => [...row]);
  return { steps, output: { n, dijkstras: n } };
}

/**
 * The matrix agrees with Bellman-Ford run from every vertex.
 *
 * Bellman-Ford on the **original** weights, so nothing about the reweighting
 * is assumed — if `h` were wrong, or the correction at the end mis-signed,
 * this is what would notice.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const n = g.n;
  const D = (trace.steps.at(-1)!.hi as { matrix?: number[][] }).matrix;
  if (!D) return 'the run returned no matrix';

  for (let s = 1; s <= n; s++) {
    const d = new Array<number>(n + 1).fill(Infinity);
    d[s] = 0;
    for (let pass = 1; pass < n; pass++) {
      for (const e of g.edges) {
        const via = d[e.u]! + (e.w ?? 1);
        if (via < d[e.v]!) d[e.v] = via;
      }
    }
    for (let j = 1; j <= n; j++) {
      if (D[s]![j] !== d[j]) {
        return `d(${s},${j}) is ${D[s]![j]}, but Bellman-Ford from ${s} gives ${d[j]}`;
      }
    }
  }
  return null;
}

export const johnson: AlgorithmModule = {
  id: 'johnson',
  name: "Johnson's Algorithm",
  visualizer: 'graph',
  aux: [{ key: 'h', label: 'h', hint: 'the reweighting potential, then each row of the answer' }],
  procOrder: ['JOHNSON'],
  procedures: {
    JOHNSON: {
      title: 'JOHNSON(G, w)',
      indent: [0, 0, 1, 1, 2, 1, 2, 1, 1, 2, 3, 4, 1],
      lines: [
        'make G′ = G plus a vertex s with a 0-weight edge to every vertex',
        'if BELLMAN-FORD(G′, w, s) == FALSE',
        'report a negative-weight cycle',
        'else for each v ∈ G′.V',
        'h(v) = δ(s, v) from Bellman-Ford',
        'for each edge (u, v) ∈ G′.E',
        'ŵ(u, v) = w(u, v) + h(u) − h(v)',
        'let D be a new n × n matrix',
        'for each u ∈ G.V',
        'run DIJKSTRA(G, ŵ, u) to get δ̂(u, v) for all v',
        'for each v ∈ G.V',
        'd_uv = δ̂(u, v) + h(v) − h(u)',
        'return D',
      ],
    },
  },
  complexity: {
    best: 'O(V² lg V + V E)',
    average: 'O(V² lg V + V E)',
    worst: 'O(V² lg V + V E)',
    space: 'Θ(V²)',
    extra: [
      ['Versus Floyd-Warshall', 'better on sparse graphs, worse on dense ones'],
      ['One Bellman-Ford', 'O(V E), to compute h'],
      ['V runs of Dijkstra', 'O(V² lg V + V E) with a Fibonacci heap'],
      ['Why reweighting is safe', 'the h terms telescope, so every path changes equally'],
      ['Negative cycles', 'detected by the Bellman-Ford pass, before anything else runs'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 7,
    noun: 'graph',
    placeholder: '1-2:3, 2-3:-2, 3-4:4',
    note: 'directed and weighted; negative weights allowed',
    label: 'Weighted directed edges, as 1-2:3, separated by commas',
    generate: (n) => generateWeightedDigraph(Math.min(n, 7)),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: -20, maxWeight: 99, maxN: 7 }),
    size: (value: GraphInput) => value.n,
  },
  defaultSize: 5,
  result: { kind: 'transforms', verify },
  record,
};
