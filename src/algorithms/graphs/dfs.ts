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

/**
 * DEPTH-FIRST SEARCH — CLRS §20.3.
 *
 * One line different from §20.2 — take the frontier from the *back* instead
 * of the front — and everything about the search changes. Breadth-first
 * spreads in rings and answers "how far"; depth-first dives to the bottom and
 * answers a completely different set of questions, none of which is about
 * distance.
 *
 * What it produces is a pair of **timestamps** per vertex: `d`, when it was
 * first reached, and `f`, when every edge out of it had been explored. Those
 * two numbers are the whole of the chapter. They nest — one vertex's
 * interval is inside another's exactly when it is a descendant in the search
 * tree, which is the **parenthesis theorem** — and that single fact is what
 * makes §20.4's topological sort and §20.5's strongly connected components
 * three lines each.
 *
 * The other thing to watch is the **classification of every edge** the search
 * meets, which is read off the colour at its far end and nothing else:
 *
 *   - white → a **tree** edge, the search goes down it;
 *   - grey  → a **back** edge, pointing at an ancestor still on the stack.
 *     A back edge is a cycle, and this is how you find one;
 *   - black → a **forward** or **cross** edge, depending on whether the far
 *     end is a descendant already finished or somewhere else entirely.
 *
 * The narration names each one as it is met. The ringed vertices are the grey
 * ones: the path the search took to get where it is, and the exact set of
 * vertices a back edge can point at.
 */

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);

  const colour = new Array<number>(g.n + 1).fill(WHITE);
  const d = new Array<number>(g.n + 1).fill(0);
  const f = new Array<number>(g.n + 1).fill(0);
  const pi = new Array<number>(g.n + 1).fill(0);
  const tree = new Set<string>();
  /** The grey vertices, in the order the search entered them. */
  const path: number[] = [];
  let time = 0;

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      // One badge, not two: "3/8" is unambiguous where two bare numbers
      // stacked on a shoulder are not — a reader cannot tell which pill is the
      // discovery time and which is the finish time.
      vertices: verticesOf(g, (v): Record<string, string> =>
        d[v] ? { time: f[v] ? `${d[v]}/${f[v]}` : String(d[v]) } : {},
      ),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  const black = (): string[] => {
    const out: string[] = [];
    for (let v = 1; v <= g.n; v++) if (colour[v] === BLACK) out.push(vid(v));
    return out;
  };

  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const key of tree) edges[key] = 'done';
    return {
      edges,
      done: black(),
      ...(path.length > 0
        ? { scope: path.map(vid), scopeLabel: `on the stack: ${path.join(' → ')}` }
        : {}),
      aux: { path: auxOf([null, ...path], path.length, [null, ...path.map((v) => `d=${d[v]}`)]) },
    };
  }

  emit(
    'DFS',
    2,
    snapshot(),
    { ...base() },
    `Every vertex starts white and unstamped, and the clock is at 0.`,
  );

  /**
   * DFS-VISIT(G, u), written as an explicit stack rather than as recursion.
   *
   * The book's version recurses; here the recursion has to be unrolled so
   * that a step can be emitted in the middle of it and the run can be
   * scrubbed backwards. `path` is that stack, and it is also what the rings
   * on screen show — so the shape the reader sees *is* the call stack.
   */
  function visit(root: number): void {
    time++;
    d[root] = time;
    colour[root] = GRAY;
    path.push(root);
    stats.writes++;
    emit(
      'DFS-VISIT',
      2,
      snapshot(),
      { ...base(), move: vid(root), pointers: { u: vid(root) } },
      `${root} goes grey at time ${time}. Grey means the search is inside it and has not come out.`,
    );

    /** Where each grey vertex has got to in its adjacency list. */
    const at = new Map<number, number>([[root, 0]]);

    while (path.length > 0) {
      const u = path[path.length - 1]!;
      const list = adj.get(u)!;
      const i = at.get(u)!;

      if (i >= list.length) {
        time++;
        f[u] = time;
        colour[u] = BLACK;
        path.pop();
        stats.writes++;
        emit(
          'DFS-VISIT',
          9,
          snapshot(),
          { ...base(), pointers: { u: vid(u) } },
          `${u} is black at time ${time}: its interval [${d[u]}, ${f[u]}] is closed.`,
        );
        continue;
      }

      at.set(u, i + 1);
      const v = list[i]!.v;
      stats.comparisons++;
      const state = colour[v];
      emit(
        'DFS-VISIT',
        5,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          look: vid(v),
          edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        state === WHITE
          ? `${v} is white, so (${u}, ${v}) is a tree edge and the search goes down it.`
          : state === GRAY
            ? `${v} is grey — still on the stack. (${u}, ${v}) is a back edge, so there is a cycle.`
            : d[u]! < d[v]!
              ? `${v} is black and was found after ${u}: (${u}, ${v}) is a forward edge.`
              : `${v} is black and was finished before ${u} started: a cross edge.`,
      );
      if (state !== WHITE) continue;

      pi[v] = u;
      tree.add(ekey(u, v));
      time++;
      d[v] = time;
      colour[v] = GRAY;
      path.push(v);
      at.set(v, 0);
      stats.writes += 2;
      emit(
        'DFS-VISIT',
        7,
        snapshot(),
        { ...base(), move: vid(v), pointers: { u: vid(v) } },
        `Down into ${v}: grey at time ${time}, and ${u} waits on the stack under it.`,
      );
    }
  }

  for (let u = 1; u <= g.n; u++) {
    if (colour[u] !== WHITE) continue;
    emit(
      'DFS',
      6,
      snapshot(),
      { ...base(), mark: vid(u), pointers: { u: vid(u) } },
      `${u} is still white, so the outer loop starts a new tree at it.`,
    );
    visit(u);
  }

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = { d: d.slice(), f: f.slice(), pi: pi.slice() };
  return { steps, output: { vertices: g.n, clock: time } };
}

/**
 * The parenthesis theorem, and nothing weaker.
 *
 * Every interval [d, f] is either disjoint from another or wholly inside it —
 * they can never partly overlap — and a vertex's interval is inside its
 * parent's. That is §20.3's central claim, and checking it is a different
 * exercise from re-running the search.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const answer = (trace.steps.at(-1)?.hi as { result?: { d: number[]; f: number[]; pi: number[] } })
    ?.result;
  if (!answer) return 'the run recorded no timestamps';
  const { d, f, pi } = answer;

  const stamps: number[] = [];
  for (let v = 1; v <= g.n; v++) {
    if (!d[v] || !f[v]) return `${v} was never given both timestamps`;
    if (d[v]! >= f[v]!) return `${v} finished at ${f[v]} before it was discovered at ${d[v]}`;
    stamps.push(d[v]!, f[v]!);
  }
  // The clock ticks once per event, so the 2n stamps are exactly 1‥2n.
  stamps.sort((a, b) => a - b);
  for (let i = 0; i < stamps.length; i++) {
    if (stamps[i] !== i + 1)
      return `the timestamps are not 1‥${2 * g.n}: found ${stamps[i]} at ${i + 1}`;
  }

  for (let u = 1; u <= g.n; u++) {
    for (let v = u + 1; v <= g.n; v++) {
      const disjoint = f[u]! < d[v]! || f[v]! < d[u]!;
      const nested = (d[u]! < d[v]! && f[v]! < f[u]!) || (d[v]! < d[u]! && f[u]! < f[v]!);
      if (!disjoint && !nested) {
        return `[${d[u]}, ${f[u]}] and [${d[v]}, ${f[v]}] overlap without nesting`;
      }
    }
  }

  const adj = adjacency(g);
  for (let v = 1; v <= g.n; v++) {
    const p = pi[v]!;
    if (!p) continue;
    if (!adj.get(p)!.some((e) => e.v === v)) return `${v}'s parent ${p} has no edge to it`;
    if (!(d[p]! < d[v]! && f[v]! < f[p]!)) {
      return `${v} is a child of ${p} but its interval is not inside its parent's`;
    }
  }
  return null;
}

export const dfs: AlgorithmModule = {
  id: 'dfs',
  name: 'Depth-First Search',
  visualizer: 'graph',
  aux: [{ key: 'path', label: 'stack', hint: 'the grey vertices — the path the search took here' }],
  procOrder: ['DFS', 'DFS-VISIT'],
  procedures: {
    DFS: {
      title: 'DFS(G)',
      indent: [0, 1, 1, 0, 0, 1, 2],
      lines: [
        'for each vertex u ∈ G.V',
        'u.color = WHITE',
        'u.π = NIL',
        'time = 0',
        'for each vertex u ∈ G.V',
        'if u.color == WHITE',
        'DFS-VISIT(G, u)',
      ],
    },
    'DFS-VISIT': {
      title: 'DFS-VISIT(G, u)',
      indent: [0, 0, 0, 0, 1, 2, 2, 0, 0, 0],
      lines: [
        'time = time + 1',
        'u.d = time',
        'u.color = GRAY',
        'for each v ∈ G.Adj[u]',
        'if v.color == WHITE',
        'v.π = u',
        'DFS-VISIT(G, v)',
        'time = time + 1',
        'u.f = time',
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
      ['Each vertex', 'discovered once, finished once'],
      ['The clock', 'ticks exactly 2|V| times'],
      ['Parenthesis theorem', 'intervals nest or are disjoint — never overlap'],
      ['A back edge', 'exists iff the graph has a cycle'],
      ['What it enables', 'topological sort (§20.4), SCCs (§20.5)'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2, 2-3, 3-1, 2-4',
    note: 'directed; the outer loop starts at vertex 1',
    label: 'The directed edges, as pairs like 1-2, separated by commas',
    generate: (n) => generateDirected(n, false),
    parse: (text) => parseGraph(text, { directed: true, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
