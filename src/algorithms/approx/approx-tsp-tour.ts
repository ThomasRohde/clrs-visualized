import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphData,
  type GraphInput,
  type ParsedInput,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, verticesOf, vid } from '../graphs/graph-input.ts';

/**
 * APPROX-TSP-TOUR — CLRS §35.2.
 *
 * Visit every city once and come back, as cheaply as possible. In general
 * this is not merely NP-hard to solve — §35.2 proves it is NP-hard to
 * *approximate to within any constant factor at all*, because a good enough
 * approximation would decide the Hamiltonian-cycle problem.
 *
 * So the section adds one assumption, and everything changes. If the costs
 * obey the **triangle inequality** — going directly is never worse than going
 * via somewhere else — there is a two-line algorithm within a factor of 2.
 *
 * **Build a minimum spanning tree, and walk it.** A preorder walk lists the
 * cities in the order the tree first reaches them; take them in that order
 * and go home. That is the whole thing.
 *
 * Two inequalities make it work, and both are on screen.
 *
 * **w(T) ≤ OPT.** Delete any edge from an optimal tour and you have a
 * spanning tree, which cannot beat the minimum one. So the tree is a lower
 * bound on an optimum nobody computed.
 *
 * **c(H) ≤ 2·w(T).** A full walk of the tree crosses every edge exactly
 * twice, so it costs 2w(T); the tour is that walk with the repeat visits
 * skipped, and the triangle inequality says skipping never costs more. Watch
 * the tour edges appear: each one that leaps across the picture is a shortcut
 * past cities the walk had already seen, and it is exactly there that the
 * assumption is being spent.
 *
 * Together: c(H) ≤ 2w(T) ≤ 2·OPT.
 *
 * Cities here are points in the plane and costs are distances, rounded **up**
 * — ceiling preserves the triangle inequality where ordinary rounding can
 * break it, which would quietly invalidate the guarantee the player asserts.
 */

/** Cities are points, so the picture's geometry is the cost function. */
const SPAN = 100;

export function record(input: GraphInput): Trace {
  const g = input;
  const { steps, stats, emit } = createRecorder();

  const cost = new Map<string, number>();
  for (const e of g.edges) {
    cost.set(`${e.u}-${e.v}`, e.w ?? 1);
    cost.set(`${e.v}-${e.u}`, e.w ?? 1);
  }
  const c = (u: number, v: number): number => cost.get(`${u}-${v}`) ?? 0;

  type Shown = { u: number; v: number; ghost?: boolean };
  function snapshot(shown: Shown[]): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g),
      edges: shown.map((e) => ({
        from: vid(e.u),
        to: vid(e.v),
        weight: c(e.u, e.v),
        ...(e.ghost ? { ghost: true } : {}),
      })),
    };
  }

  const root = 1;
  /** The tree, as parent pointers and as children in the order Prim added them. */
  const parent = new Array<number>(g.n + 1).fill(0);
  const children: number[][] = Array.from({ length: g.n + 1 }, () => []);
  const tree: Array<{ u: number; v: number }> = [];
  const inTree = new Array<boolean>(g.n + 1).fill(false);

  const tour: number[] = [];
  const tourEdges: Array<{ u: number; v: number }> = [];
  let tourCost = 0;
  let treeWeight = 0;

  const pad = (values: number[], upto: number): Array<number | null> => [
    null,
    ...values,
    ...new Array<null>(Math.max(0, upto - values.length)).fill(null),
  ];

  /** Two rows, and between them the whole proof: c(H) must land under 2·w(T). */
  const chips = (ptr?: number) => ({
    // The row is one wider than the tour, for the hop home that closes it.
    H: auxOf(pad(tourEdges.length === g.n ? [...tour, root] : tour, g.n + 1), ptr),
    c: auxOf([null, treeWeight, tourCost], undefined, [null, 'w(T)', 'c(H)']),
  });

  inTree[root] = true;
  emit(
    'APPROX-TSP-TOUR',
    1,
    snapshot([]),
    { mark: vid(root), aux: chips() },
    `${g.n} cities, and the cost of a hop is the distance. Start the tree at ${root}.`,
  );

  // MST-PRIM, told briefly: chapter 21 has the player that tells it properly.
  while (tree.length < g.n - 1) {
    let best: { u: number; v: number; w: number } | null = null;
    for (let u = 1; u <= g.n; u++) {
      if (!inTree[u]) continue;
      for (let v = 1; v <= g.n; v++) {
        if (inTree[v]) continue;
        const w = c(u, v);
        stats.comparisons++;
        if (!best || w < best.w) best = { u, v, w };
      }
    }
    if (!best) break;

    const shown = tree.map((e) => ({ ...e }));
    emit(
      'APPROX-TSP-TOUR',
      2,
      snapshot([...shown, { u: best.u, v: best.v }]),
      {
        look: [vid(best.v)],
        edges: {
          ...doneEdges(tree),
          [ekey(best.u, best.v)]: 'look' as Role,
        },
        aux: chips(),
      },
      `The cheapest hop out of the tree is ${best.u}–${best.v}, at ${best.w}. Prim takes it.`,
    );

    inTree[best.v] = true;
    parent[best.v] = best.u;
    children[best.u]!.push(best.v);
    tree.push({ u: best.u, v: best.v });
    treeWeight += best.w;
    stats.writes++;

    emit(
      'APPROX-TSP-TOUR',
      2,
      snapshot(tree.map((e) => ({ ...e }))),
      {
        // No vertex takes `done` while the tree is being built: the tree is
        // an object made of edges, and reserving the settled colour for the
        // walk is what lets the second phase visibly fill the picture in.
        move: [vid(best.v)],
        edges: { ...doneEdges(tree), [ekey(best.u, best.v)]: 'move' as Role },
        aux: chips(),
      },
      `T now weighs ${treeWeight}. Any tour, minus one edge, is a spanning tree — so OPT ≥ ${treeWeight}.`,
    );
  }

  // The preorder walk. The tree is kept on screen, dashed, because every
  // shortcut the tour takes is a shortcut past *it*.
  const ghosts = (): Shown[] => tree.map((e) => ({ ...e, ghost: true }));
  const shownEdges = (): Shown[] => {
    const solid = new Set(tourEdges.map((e) => ekey(Math.min(e.u, e.v), Math.max(e.u, e.v))));
    const dashed = ghosts().filter((e) => !solid.has(ekey(Math.min(e.u, e.v), Math.max(e.u, e.v))));
    return [...dashed, ...tourEdges.map((e) => ({ ...e }))];
  };

  const order: number[] = [];
  (function preorder(u: number): void {
    order.push(u);
    for (const v of children[u]!) preorder(v);
  })(root);

  order.forEach((v, i) => {
    const from = i === 0 ? null : tour[tour.length - 1]!;
    tour.push(v);
    if (from !== null) {
      tourEdges.push({ u: from, v });
      tourCost += c(from, v);
      stats.writes++;
    }
    const skipped = from === null ? 0 : distanceInTree(parent, from, v) - 1;
    emit(
      'APPROX-TSP-TOUR',
      3,
      snapshot(shownEdges()),
      {
        mark: vid(v),
        done: tour.slice(0, -1).map(vid),
        edges: {
          ...Object.fromEntries(tourEdges.map((e) => [ekey(e.u, e.v), 'done' as Role] as const)),
          ...(from === null ? {} : { [ekey(from, v)]: 'move' as Role }),
        },
        aux: chips(i + 1),
      },
      from === null
        ? `The walk starts at ${root}. H is the order the tree is first reached in.`
        : skipped > 0
          ? `${v} next — a shortcut past ${skipped} ${skipped === 1 ? 'city' : 'cities'} already visited. Cost ${c(from, v)}.`
          : `Down a tree edge to ${v}, costing ${c(from, v)}. Running total ${tourCost}.`,
    );
  });

  const back = order[order.length - 1]!;
  tourEdges.push({ u: back, v: root });
  tourCost += c(back, root);
  stats.writes++;

  emit(
    'APPROX-TSP-TOUR',
    4,
    snapshot(shownEdges()),
    {
      done: tour.map(vid),
      mark: vid(root),
      edges: Object.fromEntries(tourEdges.map((e) => [ekey(e.u, e.v), 'done' as Role] as const)),
      aux: chips(g.n + 1),
      tour: [...tour],
      tourCost,
      treeWeight,
    },
    `Home to ${root}: the tour costs ${tourCost}, against a tree of ${treeWeight}. Under twice it, as promised.`,
  );

  return { steps, output: { tour: tourCost, tree: treeWeight } };
}

function doneEdges(tree: Array<{ u: number; v: number }>): Record<string, Role> {
  return Object.fromEntries(tree.map((e) => [ekey(e.u, e.v), 'done' as Role] as const));
}

/** How many tree edges lie between two vertices — how far the shortcut leaps. */
function distanceInTree(parent: number[], a: number, b: number): number {
  const up = (from: number): number[] => {
    const path = [from];
    let x = from;
    while (parent[x]) {
      x = parent[x]!;
      path.push(x);
    }
    return path;
  };
  const pa = up(a);
  const pb = up(b);
  const set = new Map(pa.map((v, i) => [v, i]));
  for (let i = 0; i < pb.length; i++) {
    const j = set.get(pb[i]!);
    if (j !== undefined) return i + j;
  }
  return 0;
}

/**
 * Both inequalities of §35.2, and the precondition they rest on.
 *
 * The tour is checked to be a real Hamiltonian cycle and its cost recomputed
 * from the instance rather than trusted. Then the triangle inequality is
 * tested on every triple — without it the factor of 2 is not merely unproved
 * but false, so an instance that violated it would make the run's claim a lie
 * rather than a slip. Finally the optimum itself, by Held-Karp over all
 * subsets, and the tour is required to come in under twice it.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const n = input.n;
  const hi = trace.steps.at(-1)!.hi as {
    tour?: number[];
    tourCost?: number;
    treeWeight?: number;
  };
  if (!hi.tour || hi.tourCost === undefined || hi.treeWeight === undefined) {
    return 'the run returned no tour';
  }

  const c: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
  for (const e of input.edges) {
    c[e.u]![e.v] = e.w ?? 1;
    c[e.v]![e.u] = e.w ?? 1;
  }

  const seen = new Set(hi.tour);
  if (seen.size !== n || hi.tour.length !== n) {
    return `the tour visits ${hi.tour.length} cities (${seen.size} distinct), not all ${n} exactly once`;
  }

  let recomputed = 0;
  for (let i = 0; i < n; i++) recomputed += c[hi.tour[i]!]![hi.tour[(i + 1) % n]!]!;
  if (recomputed !== hi.tourCost) {
    return `the run reported a cost of ${hi.tourCost}, but the tour it returned costs ${recomputed}`;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      for (let k = 1; k <= n; k++) {
        if (c[i]![j]! > c[i]![k]! + c[k]![j]!) {
          return `the triangle inequality fails at ${i}→${j} via ${k}, so the factor of 2 does not hold`;
        }
      }
    }
  }

  // Held-Karp: dp[mask][j] is the cheapest path from city 1 through exactly
  // `mask`, ending at j. Exponential, which is the whole reason §35.2 exists.
  const full = (1 << n) - 1;
  const INF = Infinity;
  const dp: number[][] = Array.from({ length: full + 1 }, () => new Array<number>(n).fill(INF));
  dp[1]![0] = 0;
  for (let mask = 1; mask <= full; mask++) {
    if (!(mask & 1)) continue;
    for (let j = 0; j < n; j++) {
      const here = dp[mask]![j]!;
      if (here === INF || !(mask & (1 << j))) continue;
      for (let k = 1; k < n; k++) {
        if (mask & (1 << k)) continue;
        const next = mask | (1 << k);
        const via = here + c[j + 1]![k + 1]!;
        if (via < dp[next]![k]!) dp[next]![k] = via;
      }
    }
  }
  let optimum = INF;
  for (let j = 1; j < n; j++) {
    const done = dp[full]![j]!;
    if (done < INF) optimum = Math.min(optimum, done + c[j + 1]![1]!);
  }
  if (n === 1) optimum = 0;

  if (hi.treeWeight > optimum) {
    return `the spanning tree weighs ${hi.treeWeight}, more than the optimal tour's ${optimum} — impossible`;
  }
  if (hi.tourCost > 2 * optimum) {
    return `the tour costs ${hi.tourCost} against an optimum of ${optimum} — outside the factor of 2`;
  }
  return null;
}

/**
 * Cities on a jittered grid, so no two crowd into one dot.
 *
 * Costs are Euclidean distances rounded **up**. Ceiling is not fussiness:
 * ⌈a⌉ + ⌈b⌉ ≥ a + b ≥ c, and the left side is an integer, so it is ≥ ⌈c⌉ —
 * the triangle inequality survives. Ordinary rounding can lose it by 1 on
 * three nearly collinear cities, and the guarantee would go with it.
 */
function metricInstance(points: Array<{ x: number; y: number }>): GraphInput {
  const n = points.length;
  const edges: Array<{ u: number; v: number; w: number }> = [];
  for (let u = 1; u <= n; u++) {
    for (let v = u + 1; v <= n; v++) {
      const dx = points[u - 1]!.x - points[v - 1]!.x;
      const dy = points[u - 1]!.y - points[v - 1]!.y;
      edges.push({ u, v, w: Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy))) });
    }
  }
  // Scaled to fill the frame, and **uniformly**: this is the one graph in the
  // book whose drawing has to be metrically honest, because the reader judges
  // a shortcut by looking at it. Scaling the axes separately would fit the box
  // better and make the picture lie about which hop is shorter.
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1);
  const pos = points.map((p) => ({
    x: (p.x - x0) / span + (1 - (x1 - x0) / span) / 2,
    y: (p.y - y0) / span + (1 - (y1 - y0) / span) / 2,
  }));

  return { kind: 'graph', n, edges, directed: false, pos: [null, ...pos] };
}

function generate(n: number): GraphInput {
  const size = Math.max(4, Math.min(n, 10));
  const cols = Math.ceil(Math.sqrt(size));
  const rows = Math.ceil(size / cols);
  const cells: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) cells.push([col, r]);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }

  const w = SPAN / cols;
  const h = SPAN / rows;
  const points = cells.slice(0, size).map(([col, r]) => ({
    x: Math.round((col + 0.5) * w + (Math.random() - 0.5) * w * 0.55),
    y: Math.round((r + 0.5) * h + (Math.random() - 0.5) * h * 0.55),
  }));
  return metricInstance(points);
}

/**
 * The reader types **cities**, not edges.
 *
 * An edge list would be the wrong question here: a human typing 45 pairwise
 * costs would violate the triangle inequality within about four of them, and
 * the guarantee this player asserts would evaporate with no warning. Points
 * in the plane give the metric for free, which is also how the section
 * motivates the assumption.
 */
function parse(text: string): ParsedInput {
  const parts = text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 4) return { error: 'Give at least four cities, like 10,20; 60,15; 80,70.' };
  if (parts.length > 10)
    return { error: 'At most ten cities — the exact optimum is what limits it.' };

  const points: Array<{ x: number; y: number }> = [];
  for (const part of parts) {
    const m = /^(\d{1,3})\s*[, ]\s*(\d{1,3})$/.exec(part);
    if (!m) return { error: `"${part}" is not a city — write it as 40,75.` };
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x > SPAN || y > SPAN) return { error: `Coordinates run from 0 to ${SPAN}.` };
    if (points.some((p) => p.x === x && p.y === y)) {
      return { error: `Two cities at ${x},${y} — give them different places.` };
    }
    points.push({ x, y });
  }
  return { value: metricInstance(points) };
}

export const approxTspTour: AlgorithmModule = {
  id: 'approx-tsp-tour',
  name: 'Approximate TSP Tour',
  visualizer: 'graph',
  aux: [
    { key: 'H', label: 'H', hint: 'the tour, in the order the walk first reaches each city' },
    { key: 'c', label: 'cost', hint: 'the tree is a lower bound on the best tour there is' },
  ],
  procOrder: ['APPROX-TSP-TOUR'],
  procedures: {
    'APPROX-TSP-TOUR': {
      title: 'APPROX-TSP-TOUR(G, c)',
      indent: [0, 0, 0, 0],
      lines: [
        'select a vertex r ∈ G.V to be a "root" vertex',
        'compute a minimum spanning tree T for G from root r using MST-PRIM(G, c, r)',
        'let H be a list of vertices, ordered by when a preorder walk of T first visits them',
        'return the hamiltonian cycle H',
      ],
    },
  },
  complexity: {
    best: 'Θ(V²)',
    average: 'Θ(V²)',
    worst: 'Θ(V²)',
    space: 'Θ(V)',
    extra: [
      ['Approximation ratio', '2 — but only with the triangle inequality'],
      ['Without that assumption', 'no constant-factor approximation exists unless P = NP'],
      ['Where the time goes', 'MST-PRIM on a complete graph'],
      ['Why the tree bounds it', 'an optimal tour minus an edge is a spanning tree'],
      ['Christofides', 'the same idea plus a matching, and a ratio of 3/2'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'map',
    placeholder: '10,20; 60,15; 85,70; 30,80',
    note: 'cities are points; cost is distance, rounded up',
    label: 'City coordinates, as 10,20 separated by semicolons',
    generate,
    parse,
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
