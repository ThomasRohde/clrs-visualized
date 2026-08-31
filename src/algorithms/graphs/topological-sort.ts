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

/**
 * TOPOLOGICAL SORT — CLRS §20.4.
 *
 * Three lines of pseudocode, and they are three lines because §20.3 did all
 * the work. Run a depth-first search; every time a vertex finishes, push it
 * on the front of a list. The list is a topological order.
 *
 * Why that works is worth having straight, because it is not obvious and it
 * is one line of argument. When the search finishes a vertex `u`, everything
 * reachable from `u` has already finished — that is what finishing *means*.
 * So every vertex `u` points at is already on the list, and putting `u` at
 * the front puts it before all of them. Do that for every vertex and every
 * edge points forwards.
 *
 * The picture is laid out in layers with all the edges running left to right,
 * so a correct answer is one you can check by eye: read the list off and no
 * arrow ever points back at something already named. The layers are **not**
 * the answer, though — watch for the edge that skips one, and for the fact
 * that two vertices in the same column still come out in some order.
 *
 * The precondition is the whole story: **this needs a DAG.** A back edge is a
 * cycle, a cycle has no topological order at all, and §20.3's classification
 * is exactly the test for one.
 */

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);

  const colour = new Array<number>(g.n + 1).fill(WHITE);
  const finish = new Array<number>(g.n + 1).fill(0);
  const tree = new Set<string>();
  const path: number[] = [];
  /** The answer, built by pushing on the front. */
  const list: number[] = [];
  let time = 0;

  const { steps, stats, emit } = createRecorder();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      vertices: verticesOf(g, (v): Record<string, number> => (finish[v] ? { f: finish[v]! } : {})),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const key of tree) edges[key] = 'done';
    return {
      edges,
      done: list.map(vid),
      ...(path.length > 0
        ? { scope: path.map(vid), scopeLabel: `on the stack: ${path.join(' → ')}` }
        : {}),
      aux: { L: auxOf([null, ...list], list.length > 0 ? 1 : undefined) },
    };
  }

  emit(
    'TOPOLOGICAL-SORT',
    1,
    snapshot(),
    { ...base() },
    `The list starts empty. Every edge in the picture runs left to right — this graph is a DAG.`,
  );

  function visit(root: number): void {
    time++;
    colour[root] = GRAY;
    path.push(root);
    emit(
      'DFS-VISIT',
      3,
      snapshot(),
      { ...base(), move: vid(root), pointers: { u: vid(root) } },
      `${root} goes grey. Nothing can be placed until everything below it is placed.`,
    );

    const at = new Map<number, number>([[root, 0]]);
    while (path.length > 0) {
      const u = path[path.length - 1]!;
      const adjacent = adj.get(u)!;
      const i = at.get(u)!;

      if (i >= adjacent.length) {
        time++;
        finish[u] = time;
        colour[u] = BLACK;
        path.pop();
        list.unshift(u);
        stats.writes++;
        emit(
          'TOPOLOGICAL-SORT',
          2,
          snapshot(),
          { ...base(), move: vid(u), pointers: { u: vid(u) } },
          `${u} finishes, so it goes on the front — ahead of everything it can reach.`,
        );
        continue;
      }

      at.set(u, i + 1);
      const v = adjacent[i]!.v;
      stats.comparisons++;
      const white = colour[v] === WHITE;
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
        white
          ? `${v} is white. ${u} cannot be placed until ${v} is, so the search goes there first.`
          : colour[v] === GRAY
            ? `${v} is grey — a back edge, and a cycle. A cyclic graph has no topological order.`
            : `${v} is already on the list, so ${u} will land in front of it whatever happens.`,
      );
      if (!white) continue;

      tree.add(ekey(u, v));
      time++;
      colour[v] = GRAY;
      path.push(v);
      at.set(v, 0);
      emit(
        'DFS-VISIT',
        7,
        snapshot(),
        { ...base(), move: vid(v), pointers: { u: vid(v) } },
        `Down into ${v}, with ${u} waiting underneath it on the stack.`,
      );
    }
  }

  for (let u = 1; u <= g.n; u++) {
    if (colour[u] !== WHITE) continue;
    visit(u);
  }

  emit(
    'TOPOLOGICAL-SORT',
    3,
    snapshot(),
    { ...base(), order: list.slice() },
    `Return the list: ${list.join(', ')}. Every edge in the picture points later in it.`,
  );

  return { steps, output: { vertices: g.n, placed: list.length } };
}

/**
 * The definition, checked directly: every edge points forwards in the order.
 *
 * Nothing here re-sorts anything. A topological order is *defined* by that
 * one property plus being a permutation of the vertices, so the definition is
 * the strongest available test and also the simplest.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const order = (trace.steps.at(-1)?.hi as { order?: number[] })?.order;
  if (!order) return 'the run returned no order';

  if (order.length !== g.n) return `the order has ${order.length} vertices, not ${g.n}`;
  const seen = new Set(order);
  if (seen.size !== g.n) return 'a vertex appears twice in the order';
  for (let v = 1; v <= g.n; v++) if (!seen.has(v)) return `${v} is missing from the order`;

  const rank = new Map<number, number>(order.map((v, i) => [v, i]));
  for (const e of g.edges) {
    if (rank.get(e.u)! > rank.get(e.v)!) {
      return `edge ${e.u}→${e.v} points backwards: ${e.u} is at ${rank.get(e.u)}, ${e.v} at ${rank.get(e.v)}`;
    }
  }
  return null;
}

export const topologicalSort: AlgorithmModule = {
  id: 'topological-sort',
  name: 'Topological Sort',
  visualizer: 'graph',
  aux: [{ key: 'L', label: 'L', hint: 'the answer, built by pushing on the front' }],
  procOrder: ['TOPOLOGICAL-SORT', 'DFS-VISIT'],
  procedures: {
    'TOPOLOGICAL-SORT': {
      title: 'TOPOLOGICAL-SORT(G)',
      indent: [0, 0, 0],
      lines: [
        'call DFS(G) to compute finish times v.f',
        'as each vertex finishes, insert it onto the front of a list',
        'return the list of vertices',
      ],
    },
    // The book gives DFS-VISIT in §20.3 and does not repeat it here. It is
    // repeated here because the highlighted line has to be somewhere the
    // reader can see, and lines 1–2 above are where all the time goes.
    'DFS-VISIT': {
      title: 'DFS-VISIT(G, u)',
      indent: [0, 0, 0, 1, 2, 2, 0, 0],
      lines: [
        'u.d = time = time + 1',
        'u.color = GRAY',
        'for each v ∈ G.Adj[u]',
        'if v.color == WHITE',
        'v.π = u',
        'DFS-VISIT(G, v)',
        'u.f = time = time + 1',
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
      ['Cost over DFS', 'Θ(1) per vertex — one list insertion'],
      ['Requires', 'a directed acyclic graph'],
      ['A cycle', 'shows up as a back edge, and means no order exists'],
      ['How many orders', 'usually several; this finds one'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'DAG',
    placeholder: '1-3, 1-4, 3-5, 4-5',
    note: 'directed and acyclic; drawn in layers',
    label: 'The directed edges, as pairs like 1-3, separated by commas',
    generate: (n) => generateDag(n, false),
    parse: (text) => parseDag(text, { directed: true, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
