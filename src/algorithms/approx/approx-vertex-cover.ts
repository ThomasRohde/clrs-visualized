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
import { ekey, generateUndirected, parseGraph, verticesOf, vid } from '../graphs/graph-input.ts';

/**
 * APPROX-VERTEX-COVER — CLRS §35.1.
 *
 * A **vertex cover** is a set of vertices touching every edge. Finding the
 * smallest one is NP-hard, so chapter 34 says you will not get it in
 * polynomial time. Chapter 35 asks the follow-up question: **how close can
 * you get, quickly, with a proof of how close?**
 *
 * The answer here is almost insultingly simple. Take any edge still
 * uncovered, put **both** its endpoints in the cover, throw away every edge
 * either of them touches, and repeat. It never compares degrees, never looks
 * ahead, and never reconsiders.
 *
 * Taking both ends looks wasteful — one of them would have covered that edge
 * — and it is exactly the waste that buys the proof. The edges it picks share
 * no endpoints, so they form a **matching**. Every vertex cover must contain
 * at least one endpoint of every matching edge, so the optimum is at least
 * |M|; this cover is exactly 2|M|. Hence **|C| ≤ 2·OPT**, on every graph,
 * with no assumptions at all.
 *
 * That is the shape of the whole chapter: not a better answer, but a *bounded*
 * one, and the bound proved against an optimum nobody can compute.
 *
 * The matching is on screen throughout, in the mark colour, because it is not
 * a by-product — it is the certificate. Count those edges, double it, and you
 * have both what this algorithm returned and a lower bound on what the best
 * possible answer could have been.
 *
 * The obvious "improvement" — repeatedly take the vertex of highest degree —
 * feels smarter and is strictly worse: its ratio grows as Θ(lg V). Being
 * greedy about the *wrong* quantity costs more than not being clever at all.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const { steps, stats, emit } = createRecorder();

  const edges = g.edges.map((e) => ({ u: e.u, v: e.v }));
  /** E′ is the edges *not* yet struck out; the book removes them from a set. */
  const gone = new Array<boolean>(edges.length).fill(false);
  const cover: number[] = [];
  const matching: Array<{ u: number; v: number }> = [];

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g),
      edges: edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  /** Struck out is `done`; the picked edges stay `mark`, because they are the proof. */
  function edgeRoles(): Record<string, Role> {
    const out: Record<string, Role> = {};
    edges.forEach((e, k) => {
      if (gone[k]) out[ekey(e.u, e.v)] = 'done';
    });
    for (const m of matching) out[ekey(m.u, m.v)] = 'mark';
    return out;
  }

  /**
   * Vertices still touching an edge of E′ — what is left of the graph.
   *
   * Drawn as a ring only while it is a *proper* subset: a ring round every
   * vertex says nothing, and one round none of them is not a set.
   */
  function live(): string[] {
    const s = new Set<number>();
    edges.forEach((e, k) => {
      if (!gone[k]) {
        s.add(e.u);
        s.add(e.v);
      }
    });
    if (s.size === 0 || s.size === g.n) return [];
    return [...s].sort((a, b) => a - b).map(vid);
  }

  const remaining = () => gone.filter((x) => !x).length;

  function base(): Record<string, unknown> {
    const ring = live();
    return {
      edges: edgeRoles(),
      done: cover.map(vid),
      ...(ring.length > 0
        ? { scope: ring, scopeLabel: `${remaining()} edges of E′ still uncovered` }
        : {}),
      aux: {
        n: auxOf([null, matching.length, cover.length], undefined, [null, '|M|', '|C|']),
      },
    };
  }

  emit(
    'APPROX-VERTEX-COVER',
    2,
    snapshot(),
    { ...base() },
    `C is empty and E′ is all ${edges.length} edges. Every one of them has to end up covered.`,
  );

  while (true) {
    const i = gone.findIndex((x) => !x);
    if (i < 0) break;
    const e = edges[i]!;
    stats.comparisons++;

    emit(
      'APPROX-VERTEX-COVER',
      4,
      snapshot(),
      {
        ...base(),
        look: [vid(e.u), vid(e.v)],
        edges: { ...edgeRoles(), [ekey(e.u, e.v)]: 'look' },
      },
      `Any uncovered edge will do; take ${e.u}–${e.v}. The algorithm never asks which is better.`,
    );

    cover.push(e.u, e.v);
    matching.push({ u: e.u, v: e.v });
    stats.writes += 2;

    emit(
      'APPROX-VERTEX-COVER',
      5,
      snapshot(),
      {
        ...base(),
        move: [vid(e.u), vid(e.v)],
        edges: { ...edgeRoles(), [ekey(e.u, e.v)]: 'move' },
      },
      `Both ends go into C — one would have done, and taking both is what buys the factor of 2.`,
    );

    const struck: number[] = [];
    edges.forEach((edge, k) => {
      if (gone[k]) return;
      if (edge.u === e.u || edge.v === e.u || edge.u === e.v || edge.v === e.v) {
        gone[k] = true;
        struck.push(k);
      }
    });

    emit(
      'APPROX-VERTEX-COVER',
      6,
      snapshot(),
      {
        ...base(),
        edges: {
          ...edgeRoles(),
          ...Object.fromEntries(
            struck.filter((k) => k !== i).map((k) => [ekey(edges[k]!.u, edges[k]!.v), 'look']),
          ),
        },
      },
      struck.length === 1
        ? `That edge was the only one those two touched. ${remaining()} left in E′.`
        : `${struck.length} edges touch ${e.u} or ${e.v}, so all ${struck.length} are now covered. ${remaining()} left.`,
    );
  }

  emit(
    'APPROX-VERTEX-COVER',
    7,
    snapshot(),
    {
      ...base(),
      cover: [...cover],
      matching: matching.map((m) => ({ ...m })),
    },
    `C has ${cover.length} vertices, from a matching of ${matching.length}. The best possible is at least ${matching.length}.`,
  );

  return { steps, output: { cover: cover.length, matching: matching.length } };
}

/**
 * The chapter's theorem, checked rather than quoted.
 *
 * Three claims. C really is a cover; the picked edges really are a matching,
 * which is the only reason the bound holds; and |C| is within twice the true
 * optimum, computed here by brute force over every subset of the vertices.
 *
 * That last one is the point of the whole chapter and is affordable only
 * because the graphs are small — which is itself the lesson, since brute force
 * is what an approximation algorithm exists to avoid.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const hi = trace.steps.at(-1)!.hi as {
    cover?: number[];
    matching?: Array<{ u: number; v: number }>;
  };
  if (!hi.cover || !hi.matching) return 'the run returned no cover';

  const inC = new Set(hi.cover);
  for (const e of input.edges) {
    if (!inC.has(e.u) && !inC.has(e.v)) return `edge ${e.u}–${e.v} is covered by neither end`;
  }

  const used = new Set<number>();
  for (const m of hi.matching) {
    if (used.has(m.u) || used.has(m.v)) {
      return `${m.u}–${m.v} shares an end with an earlier picked edge, so M is not a matching`;
    }
    used.add(m.u);
    used.add(m.v);
  }
  if (hi.cover.length !== 2 * hi.matching.length) {
    return `|C| is ${hi.cover.length}, which is not twice the ${hi.matching.length} edges picked`;
  }

  // The true optimum, by brute force: a subset of the vertices covers the
  // graph when the union of its incident-edge masks is every edge.
  const m = input.edges.length;
  const incident = new Array<number>(input.n + 1).fill(0);
  input.edges.forEach((e, k) => {
    incident[e.u]! |= 1 << k;
    incident[e.v]! |= 1 << k;
  });
  const all = m === 0 ? 0 : (1 << m) - 1;
  let optimum = input.n;
  for (let mask = 0; mask < 1 << input.n; mask++) {
    let size = 0;
    for (let bits = mask; bits > 0; bits &= bits - 1) size++;
    if (size >= optimum) continue;
    let covered = 0;
    for (let v = 1; v <= input.n; v++) if (mask & (1 << (v - 1))) covered |= incident[v]!;
    if (covered === all) optimum = size;
  }

  if (hi.cover.length > 2 * optimum) {
    return `C has ${hi.cover.length} vertices against an optimum of ${optimum} — outside the factor of 2`;
  }
  return null;
}

export const approxVertexCover: AlgorithmModule = {
  id: 'approx-vertex-cover',
  name: 'Approximate Vertex Cover',
  visualizer: 'graph',
  aux: [{ key: 'n', label: 'size', hint: 'the matching found, and the cover it forces' }],
  procOrder: ['APPROX-VERTEX-COVER'],
  procedures: {
    'APPROX-VERTEX-COVER': {
      title: 'APPROX-VERTEX-COVER(G)',
      indent: [0, 0, 0, 1, 1, 1, 0],
      lines: [
        'C = ∅',
        'E′ = G.E',
        'while E′ ≠ ∅',
        'let (u, v) be an arbitrary edge of E′',
        'C = C ∪ {u, v}',
        'remove from E′ every edge incident on either u or v',
        'return C',
      ],
    },
  },
  complexity: {
    best: 'O(V + E)',
    average: 'O(V + E)',
    worst: 'O(V + E)',
    space: 'Θ(V)',
    extra: [
      ['Approximation ratio', '2 — and tight: a complete bipartite graph reaches it'],
      ['Why 2 holds', 'the picked edges are a matching, so OPT ≥ |M| and |C| = 2|M|'],
      ['What it never looks at', 'degree — which edge it picks is genuinely arbitrary'],
      ['Greedy by highest degree', 'feels smarter, and its ratio is Θ(lg V)'],
      ['Finding the optimum', 'NP-hard; this is linear time'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2, 2-3, 3-4, 4-1',
    note: 'undirected and unweighted',
    label: 'Edges, as 1-2, separated by commas',
    generate: (n) => generateUndirected(Math.min(n, 12), false),
    parse: (text) => parseGraph(text, { directed: false, weighted: false, maxN: 12 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 9,
  result: { kind: 'transforms', verify },
  record,
};
