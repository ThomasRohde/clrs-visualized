/**
 * Building, parsing and reading the graphs Part VI runs on.
 *
 * Twelve recorders share this file, and it exists for one reason above the
 * others: **the layout is part of the input**. A graph has no canonical
 * drawing, and the renderer deliberately refuses to invent one per frame — so
 * whoever builds the network decides where its vertices sit, once, for the
 * whole trace. A flow network is laid out source-left and sink-right because
 * that is what makes a cut visible; a DAG is laid out in topological layers
 * because that is what makes "every edge points right" a thing you can see
 * rather than a thing you are told. Neither of those is something the
 * renderer could work out.
 *
 * Vertices are `1‥n` throughout, matching the 1-indexing every array on the
 * site uses, and meaning a vertex can be a chip in the aux strip without a
 * second naming scheme.
 *
 * The generators all produce **connected** graphs where the algorithm needs
 * one, deterministically rather than usually. A generator that only usually
 * produces the interesting case makes a test that only usually passes.
 */
import type { AlgorithmInput, GraphInput, GraphVertex, ParsedInput } from '../types.ts';

export type Pos = { x: number; y: number };
export type Edge = { u: number; v: number; w?: number };

/** The renderer's id for a vertex. */
export const vid = (v: number): string => `v${v}`;

/** The renderer's key for an edge, in the orientation it is stored. */
export const ekey = (u: number, v: number): string => `${vid(u)}>${vid(v)}`;

const rnd = (n: number): number => Math.floor(Math.random() * n);

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Union-find, used to build spanning trees for the generators. */
function forest(n: number) {
  const p = Array.from({ length: n + 1 }, (_, i) => i);
  const find = (x: number): number => (p[x] === x ? x : (p[x] = find(p[x]!)));
  return {
    union(a: number, b: number): boolean {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return false;
      p[ra] = rb;
      return true;
    },
  };
}

// ---------- layouts ----------

/**
 * Vertices on a jittered grid, roughly square.
 *
 * The default for a graph with no other structure to show — searches, both
 * spanning trees, Dijkstra. A grid keeps the edges short and mostly
 * non-crossing, which is the whole difference between a graph you can follow
 * a search through and a ball of wool.
 */
export function gridPositions(n: number): Array<Pos | null> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const pos: Array<Pos | null> = [null];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    pos.push({
      x: cols === 1 ? 0.5 : c / (cols - 1),
      y: rows === 1 ? 0.5 : r / (rows - 1),
    });
  }
  return pos;
}

/** Grid neighbours — the candidate edges every grid-laid-out graph draws from. */
function gridNeighbours(n: number): Edge[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const out: Edge[] = [];
  for (let i = 1; i <= n; i++) {
    const c = (i - 1) % cols;
    if (c + 1 < cols && i + 1 <= n) out.push({ u: i, v: i + 1 });
    if (i + cols <= n) out.push({ u: i, v: i + cols });
  }
  return out;
}

/**
 * Vertices in left-to-right columns, one column per layer.
 *
 * For anything whose point is that the edges all run one way: a DAG, a
 * topological order, a flow network from source to sink.
 */
export function layeredPositions(layers: number[][]): Array<Pos | null> {
  const pos: Array<Pos | null> = [];
  const L = Math.max(1, layers.length);
  layers.forEach((layer, i) => {
    const h = layer.length;
    layer.forEach((v, j) => {
      pos[v] = {
        x: L === 1 ? 0.5 : i / (L - 1),
        y: h === 1 ? 0.5 : j / (h - 1),
      };
    });
  });
  for (let i = 0; i < pos.length; i++) if (!pos[i]) pos[i] = null;
  return pos;
}

/** Split `1‥n` into layers of roughly `width` vertices, in order. */
export function layersOf(n: number, width: number): number[][] {
  const layers: number[][] = [];
  for (let v = 1; v <= n; v++) {
    const i = Math.floor((v - 1) / width);
    (layers[i] ??= []).push(v);
  }
  return layers;
}

// ---------- generators ----------

/**
 * A connected undirected graph on a grid.
 *
 * A random spanning tree first — so connectivity is guaranteed rather than
 * likely — then a share of the remaining grid edges on top of it, which is
 * what gives a search something to rule out and an MST something to reject.
 */
export function generateUndirected(n: number, weighted: boolean, extra = 0.45): GraphInput {
  const size = Math.max(2, Math.min(n, 14));
  const candidates = shuffle(gridNeighbours(size));
  const uf = forest(size);
  const edges: Edge[] = [];
  const rest: Edge[] = [];
  for (const e of candidates) {
    if (uf.union(e.u, e.v)) edges.push(e);
    else rest.push(e);
  }
  for (const e of rest) if (Math.random() < extra) edges.push(e);

  if (weighted) assignDistinctWeights(edges);
  return {
    kind: 'graph',
    n: size,
    edges: edges.sort((a, b) => a.u - b.u || a.v - b.v),
    directed: false,
    source: 1,
    pos: gridPositions(size),
  };
}

/**
 * Distinct weights, drawn without replacement.
 *
 * Distinctness is not cosmetic: with all weights distinct the minimum
 * spanning tree is unique, so "Kruskal and Prim build the same tree" is a
 * claim the reader can check by looking rather than a coincidence.
 */
function assignDistinctWeights(edges: Edge[]): void {
  const pool = shuffle(Array.from({ length: 40 }, (_, i) => i + 1));
  edges.forEach((e, i) => {
    e.w = pool[i % pool.length];
  });
}

/**
 * A directed graph with cycles — what DFS classifies edges on.
 *
 * Built as a grid spanning tree oriented low-to-high, which gives tree and
 * forward edges, plus a handful of high-to-low edges, which is where the back
 * edges and therefore the cycles come from. Both are needed: an acyclic
 * digraph has no back edge to find, and the classification is half the
 * section.
 */
export function generateDirected(n: number, weighted: boolean): GraphInput {
  const size = Math.max(3, Math.min(n, 12));
  const base = generateUndirected(size, false, 0.3);
  const edges: Edge[] = base.edges.map((e) => ({ u: Math.min(e.u, e.v), v: Math.max(e.u, e.v) }));

  // At least one back edge, always: this is the only thing that makes the
  // graph cyclic, and a "usually" here is a test that usually passes.
  const backs = Math.max(1, Math.round(size / 5));
  const pool = shuffle(base.edges.map((e) => ({ u: Math.max(e.u, e.v), v: Math.min(e.u, e.v) })));
  for (const e of pool.slice(0, backs)) {
    if (!edges.some((x) => x.u === e.u && x.v === e.v)) edges.push(e);
  }

  if (weighted) assignDistinctWeights(edges);
  return {
    kind: 'graph',
    n: size,
    edges,
    directed: true,
    source: 1,
    pos: base.pos,
  };
}

/**
 * A directed acyclic graph, laid out in topological layers.
 *
 * Every edge runs from an earlier layer to a later one, so the drawing itself
 * is a topological order — which is the point of §20.4 and of §22.4, and is
 * also why the answer is checkable by eye.
 */
export function generateDag(n: number, weighted: boolean, negatives = false): GraphInput {
  const size = Math.max(4, Math.min(n, 12));
  const width = size <= 6 ? 2 : 3;
  const layers = layersOf(size, width);
  const edges: Edge[] = [];

  for (let i = 0; i + 1 < layers.length; i++) {
    for (const u of layers[i]!) {
      const next = layers[i + 1]!;
      // Every vertex gets at least one edge forward, so nothing is stranded
      // and the ordering has something to say about it.
      const picked = new Set<number>([next[rnd(next.length)]!]);
      for (const v of next) if (Math.random() < 0.4) picked.add(v);
      for (const v of picked) edges.push({ u, v });
    }
    // One edge that skips a layer, so "the layers are the answer" is visibly
    // not quite the rule — the order is a linear one, not a levelled one.
    const skip = layers[i + 2];
    if (skip && Math.random() < 0.6) {
      edges.push({ u: layers[i]![rnd(layers[i]!.length)]!, v: skip[rnd(skip.length)]! });
    }
  }

  if (weighted) {
    for (const e of edges) {
      e.w = negatives && Math.random() < 0.3 ? -(1 + rnd(4)) : 1 + rnd(9);
    }
  }
  return {
    kind: 'graph',
    n: size,
    edges,
    directed: true,
    source: 1,
    pos: layeredPositions(layers),
  };
}

/**
 * A directed weighted graph with no negative cycle, for Bellman-Ford.
 *
 * A DAG's edges plus a few backward ones, and the backward edges are given
 * positive weights large enough that no cycle can come out negative. That is
 * the honest version of "assume no negative cycles": the run has real cycles
 * in it, and they are safe by construction rather than by absence.
 */
export function generateWeightedDigraph(n: number): GraphInput {
  const dag = generateDag(Math.min(n, 9), true, true);
  const edges = [...dag.edges];
  const back = Math.max(1, Math.round(dag.n / 4));
  for (let k = 0; k < back; k++) {
    const u = 2 + rnd(dag.n - 1);
    const v = 1 + rnd(u - 1);
    if (u === v) continue;
    if (edges.some((e) => e.u === u && e.v === v)) continue;
    // 20 dominates any path of negative edges the generator can produce
    // (at most 8 of them, each ≥ −4), so every cycle through this edge is
    // positive. No negative-cycle case can slip into a generated input.
    edges.push({ u, v, w: 20 + rnd(6) });
  }
  return { ...dag, edges };
}

/**
 * A flow network: one source, one sink, capacities on every edge.
 *
 * Laid out in layers with the source alone on the left and the sink alone on
 * the right, which is what makes a cut something you can point at.
 */
export function generateFlowNetwork(n: number): GraphInput {
  const size = Math.max(4, Math.min(n, 10));
  const middle = size - 2;
  const width = middle <= 2 ? 1 : 2;
  const inner = layersOf(middle, width).map((layer) => layer.map((v) => v + 1));
  const layers = [[1], ...inner, [size]];
  const edges: Edge[] = [];

  for (let i = 0; i + 1 < layers.length; i++) {
    for (const u of layers[i]!) {
      const next = layers[i + 1]!;
      const picked = new Set<number>([next[rnd(next.length)]!]);
      for (const v of next) if (Math.random() < 0.55) picked.add(v);
      for (const v of picked) edges.push({ u, v, w: 1 + rnd(9) });
    }
  }
  // A cross edge inside a layer, which is what gives the residual network
  // something to cancel and the augmenting paths something to disagree about.
  for (const layer of layers) {
    if (layer.length > 1 && Math.random() < 0.7) {
      edges.push({ u: layer[0]!, v: layer[1]!, w: 1 + rnd(6) });
    }
  }
  return {
    kind: 'graph',
    n: size,
    edges,
    directed: true,
    source: 1,
    sink: size,
    pos: layeredPositions(layers),
  };
}

/** A bipartite graph in two columns, with every vertex holding at least one edge. */
export function generateBipartite(n: number): GraphInput {
  const size = Math.max(4, Math.min(n, 12));
  const k = Math.max(2, Math.floor(size / 2));
  const left = Array.from({ length: k }, (_, i) => i + 1);
  const right = Array.from({ length: size - k }, (_, i) => k + i + 1);
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const add = (u: number, v: number) => {
    const key = `${u}-${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ u, v });
  };

  for (const u of left) add(u, right[rnd(right.length)]!);
  for (const v of right) add(left[rnd(left.length)]!, v);
  for (const u of left) for (const v of right) if (Math.random() < 0.22) add(u, v);

  const pos: Array<Pos | null> = [null];
  for (let v = 1; v <= size; v++) {
    const column = v <= k ? left : right;
    const i = column.indexOf(v);
    pos[v] = {
      x: v <= k ? 0.08 : 0.92,
      y: column.length === 1 ? 0.5 : i / (column.length - 1),
    };
  }
  return { kind: 'graph', n: size, edges, directed: false, left, pos };
}

// ---------- reading ----------

export interface ParseOptions {
  directed: boolean;
  /** Weights are required when true, refused when false. */
  weighted: boolean;
  maxN?: number;
  /** Reject weights outside this range; used to keep capacities positive. */
  minWeight?: number;
  maxWeight?: number;
}

/**
 * Read an edge list the reader typed: `1-2:7, 2-3:4`.
 *
 * A graph the reader supplies carries **no positions**, so the renderer lays
 * it out on a circle. That is deliberate and is the honest thing to draw:
 * there is nothing in a typed edge list to infer a layout from, and a guessed
 * one would look like it meant something.
 */
export function parseGraph(text: string, opts: ParseOptions): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one edge, like 1-2:7.' };
  if (parts.length > 30) return { error: 'At most 30 edges — more than that stops being legible.' };

  const maxN = opts.maxN ?? 14;
  const edges: Edge[] = [];
  let n = 0;
  for (const part of parts) {
    const m = /^(\d+)\s*(?:-|->|—)\s*(\d+)(?::\s*(-?\d+))?$/.exec(part);
    if (!m) {
      return {
        error: `"${part}" is not an edge — write ${opts.weighted ? '2-5:7' : '2-5'}.`,
      };
    }
    const u = Number(m[1]);
    const v = Number(m[2]);
    if (u === v) return { error: `${part}: a self-loop has nothing to teach here.` };
    if (u < 1 || v < 1 || u > maxN || v > maxN) {
      return { error: `Vertices are numbered 1 to ${maxN}.` };
    }
    if (opts.weighted && m[3] === undefined) {
      return { error: `"${part}" has no weight — write ${u}-${v}:7.` };
    }
    const w = m[3] === undefined ? undefined : Number(m[3]);
    if (w !== undefined) {
      const lo = opts.minWeight ?? -99;
      const hi = opts.maxWeight ?? 99;
      if (w < lo || w > hi) return { error: `Weights run from ${lo} to ${hi}.` };
    }
    const dup = edges.some(
      (e) => (e.u === u && e.v === v) || (!opts.directed && e.u === v && e.v === u),
    );
    if (dup) return { error: `${u}-${v} is given twice.` };
    edges.push({ u, v, ...(w === undefined ? {} : { w }) });
    n = Math.max(n, u, v);
  }
  if (n < 2) return { error: 'A graph needs at least two vertices.' };
  return { value: { kind: 'graph', n, edges, directed: opts.directed, source: 1, sink: n } };
}

/**
 * Does this directed graph have a cycle?
 *
 * Used by the two modules whose *precondition* is acyclicity. A reader who
 * types a cycle into a topological sort should be told so, rather than handed
 * an order that quietly is not one — the generator can guarantee a DAG, and
 * the input box has to as well.
 */
export function hasCycle(g: GraphInput): boolean {
  const adj = adjacency(g);
  const state = new Array<number>(g.n + 1).fill(0);
  const walk = (u: number): boolean => {
    state[u] = 1;
    for (const { v } of adj.get(u)!) {
      if (state[v] === 1) return true;
      if (state[v] === 0 && walk(v)) return true;
    }
    state[u] = 2;
    return false;
  };
  for (let v = 1; v <= g.n; v++) if (state[v] === 0 && walk(v)) return true;
  return false;
}

/** `parseGraph`, refusing anything with a cycle in it. */
export function parseDag(text: string, opts: ParseOptions): ParsedInput {
  const parsed = parseGraph(text, opts);
  if ('error' in parsed) return parsed;
  const g = parsed.value;
  if (isGraph(g) && hasCycle(g)) {
    return { error: 'That graph has a cycle, and a cycle has no topological order.' };
  }
  return parsed;
}

const isGraph = (input: AlgorithmInput): input is GraphInput =>
  !Array.isArray(input) && input.kind === 'graph';

/**
 * `parseGraph`, then two-colour it to find the sides.
 *
 * A typed bipartite graph does not say which vertices are on the left, and
 * asking the reader to would be asking them to do the interesting part. So
 * the sides are found by two-colouring, and a graph that cannot be coloured
 * is refused with the reason — an odd cycle is exactly what makes a graph
 * non-bipartite, and the refusal is a small piece of the chapter.
 */
export function parseBipartite(text: string, opts: ParseOptions): ParsedInput {
  const parsed = parseGraph(text, opts);
  if ('error' in parsed) return parsed;
  const g = parsed.value;
  if (!isGraph(g)) return parsed;

  const adj = adjacency(g);
  const side = new Array<number>(g.n + 1).fill(0);
  for (let start = 1; start <= g.n; start++) {
    if (side[start]) continue;
    side[start] = 1;
    const queue = [start];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const { v } of adj.get(u)!) {
        if (side[v] === side[u]) {
          return {
            error: `${u} and ${v} are joined but must be on the same side — not bipartite.`,
          };
        }
        if (!side[v]) {
          side[v] = -side[u]!;
          queue.push(v);
        }
      }
    }
  }
  const left: number[] = [];
  for (let v = 1; v <= g.n; v++) if (side[v] === 1) left.push(v);
  // Positions follow the sides rather than the circle: two columns is what
  // makes a matching legible at all.
  const right = Array.from({ length: g.n }, (_, i) => i + 1).filter((v) => !left.includes(v));
  const pos: Array<Pos | null> = [null];
  for (let v = 1; v <= g.n; v++) {
    const column = left.includes(v) ? left : right;
    const i = column.indexOf(v);
    pos[v] = {
      x: left.includes(v) ? 0.08 : 0.92,
      y: column.length === 1 ? 0.5 : i / (column.length - 1),
    };
  }
  return { value: { ...g, left, pos } };
}

/** Adjacency lists, in vertex order — the `G.Adj[u]` of the pseudocode. */
export function adjacency(g: GraphInput): Map<number, Array<{ v: number; w: number }>> {
  const adj = new Map<number, Array<{ v: number; w: number }>>();
  for (let v = 1; v <= g.n; v++) adj.set(v, []);
  for (const e of g.edges) {
    adj.get(e.u)!.push({ v: e.v, w: e.w ?? 1 });
    if (!g.directed) adj.get(e.v)!.push({ v: e.u, w: e.w ?? 1 });
  }
  // Sorted, so the trace a reader steps through matches the order the picture
  // suggests and does not change between two runs on the same graph.
  for (const list of adj.values()) list.sort((a, b) => a.v - b.v);
  return adj;
}

/**
 * The vertices as the renderer wants them, with each one's attributes asked
 * for by the caller.
 *
 * Positions are copied straight through from the input, which is what keeps a
 * vertex in the same place for the whole trace.
 */
export function verticesOf(
  g: GraphInput,
  attrs?: (v: number) => Record<string, string | number | boolean> | undefined,
): GraphVertex[] {
  const out: GraphVertex[] = [];
  for (let v = 1; v <= g.n; v++) {
    const p = g.pos?.[v];
    const a = attrs?.(v);
    out.push({
      id: vid(v),
      label: v,
      ...(p ? { x: p.x, y: p.y } : {}),
      ...(a && Object.keys(a).length > 0 ? { attrs: a } : {}),
    });
  }
  return out;
}
