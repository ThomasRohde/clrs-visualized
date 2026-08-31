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
 * STRONGLY CONNECTED COMPONENTS — CLRS §20.5.
 *
 * Two vertices are in the same strongly connected component when each can
 * reach the other. Finding all of them looks as though it should cost a
 * search from every vertex; it costs **two searches in total**, and the trick
 * is one of the most surprising in the book.
 *
 * Run a depth-first search and note the order the vertices *finish* in.
 * Reverse every edge. Run a second depth-first search, starting from the
 * vertex that finished last and working backwards through that order. Each
 * tree the second search grows is exactly one strongly connected component.
 *
 * Why it works, in one sentence: the component containing the vertex that
 * finished last has no edges *into* it from anywhere else once the edges are
 * reversed, so the second search cannot escape it — and after that component
 * is removed the same argument applies again.
 *
 * The run below transposes the graph in front of you: watch every arrow turn
 * round between the two phases. That single frame is the algorithm.
 */

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export function record(input: GraphInput): Trace {
  const g = input;
  const forward = adjacency(g);
  const back = new Map<number, Array<{ v: number; w: number }>>();
  for (let v = 1; v <= g.n; v++) back.set(v, []);
  for (const e of g.edges) back.get(e.v)!.push({ v: e.u, w: e.w ?? 1 });
  for (const list of back.values()) list.sort((a, b) => a.v - b.v);

  const { steps, stats, emit } = createRecorder();

  const colour = new Array<number>(g.n + 1).fill(WHITE);
  /** Finish order of the first search, latest last. */
  const finished: number[] = [];
  /** Which component each vertex ended up in, 0 while unassigned. */
  const comp = new Array<number>(g.n + 1).fill(0);
  const settled = new Set<string>();
  let transposed = false;
  let current: number[] = [];
  let path: number[] = [];

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      vertices: verticesOf(g, (v): Record<string, number> => (comp[v] ? { c: comp[v]! } : {})),
      // The transpose is the whole idea, so it is drawn rather than described:
      // every arrow reverses in one step, and the second phase runs on what
      // the reader is looking at.
      edges: g.edges.map((e) =>
        transposed ? { from: vid(e.v), to: vid(e.u) } : { from: vid(e.u), to: vid(e.v) },
      ),
    };
  }

  const assigned = (): string[] => {
    const out: string[] = [];
    for (let v = 1; v <= g.n; v++) if (comp[v]) out.push(vid(v));
    return out;
  };

  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    for (const key of settled) edges[key] = 'done';
    const ring = transposed ? current : path;
    const label = transposed
      ? current.length > 0
        ? `component so far: ${current.join(', ')}`
        : ''
      : path.length > 0
        ? `on the stack: ${path.join(' → ')}`
        : '';
    return {
      edges,
      done: assigned(),
      ...(ring.length > 0 ? { scope: ring.map(vid), scopeLabel: label } : {}),
      aux: { order: auxOf([null, ...finished]) },
    };
  }

  /** One depth-first search, unrolled so a step can be emitted inside it. */
  function search(
    root: number,
    adj: Map<number, Array<{ v: number; w: number }>>,
    onFinish: (v: number) => void,
    proc: string,
  ): void {
    colour[root] = GRAY;
    path = [root];
    if (transposed) current.push(root);
    emit(
      proc,
      transposed ? 3 : 1,
      snapshot(),
      { ...base(), move: vid(root), pointers: { u: vid(root) } },
      transposed
        ? `${root} finished latest of what is left, so it starts a component.`
        : `${root} is white, so the first search starts a new tree at it.`,
    );

    const at = new Map<number, number>([[root, 0]]);
    while (path.length > 0) {
      const u = path[path.length - 1]!;
      const list = adj.get(u)!;
      const i = at.get(u)!;

      if (i >= list.length) {
        colour[u] = BLACK;
        path.pop();
        onFinish(u);
        emit(
          proc,
          transposed ? 4 : 1,
          snapshot(),
          { ...base(), pointers: { u: vid(u) } },
          transposed
            ? `${u} is finished, and it belongs to this component.`
            : `${u} finishes. It goes on the end of the order, so it will be considered early.`,
        );
        continue;
      }

      at.set(u, i + 1);
      const v = list[i]!.v;
      stats.comparisons++;
      const white = colour[v] === WHITE;
      emit(
        proc,
        transposed ? 3 : 1,
        snapshot(),
        {
          ...base(),
          mark: vid(u),
          look: vid(v),
          edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        white
          ? transposed
            ? `${v} is reachable backwards from ${u}, so it can reach ${u} — same component.`
            : `${v} is white, so the search goes there and ${u} cannot finish yet.`
          : `${v} has been seen already, so this edge adds nothing.`,
      );
      if (!white) continue;

      colour[v] = GRAY;
      settled.add(ekey(u, v));
      path.push(v);
      at.set(v, 0);
      if (transposed) current.push(v);
      stats.writes++;
      emit(
        proc,
        transposed ? 3 : 1,
        snapshot(),
        { ...base(), move: vid(v), pointers: { u: vid(v) } },
        `Down into ${v}.`,
      );
    }
  }

  // ---- phase 1: finish times on G ---------------------------------------
  emit(
    'STRONGLY-CONNECTED-COMPONENTS',
    1,
    snapshot(),
    { ...base() },
    `First a depth-first search on G, to find out what order the vertices finish in.`,
  );
  for (let u = 1; u <= g.n; u++) {
    if (colour[u] !== WHITE) continue;
    search(u, forward, (v) => finished.push(v), 'STRONGLY-CONNECTED-COMPONENTS');
  }

  // ---- the transpose ----------------------------------------------------
  transposed = true;
  settled.clear();
  path = [];
  emit(
    'STRONGLY-CONNECTED-COMPONENTS',
    2,
    snapshot(),
    { ...base() },
    `Every edge reverses. Reachability inside a component is unchanged; between them it flips.`,
  );

  // ---- phase 2: components on Gᵀ, in decreasing finish order ------------
  colour.fill(WHITE);
  let components = 0;
  for (let i = finished.length - 1; i >= 0; i--) {
    const u = finished[i]!;
    if (colour[u] !== WHITE) continue;
    components++;
    current = [];
    search(
      u,
      back,
      (v) => {
        comp[v] = components;
      },
      'STRONGLY-CONNECTED-COMPONENTS',
    );
    emit(
      'STRONGLY-CONNECTED-COMPONENTS',
      4,
      snapshot(),
      { ...base() },
      `Component ${components} is {${current.join(', ')}} — every one of them reaches all the others.`,
    );
    current = [];
  }

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = { comp: comp.slice(), components };
  return { steps, output: { components, vertices: g.n } };
}

/**
 * Mutual reachability, worked out independently.
 *
 * Two vertices belong together **iff** each reaches the other, which is the
 * definition and not the algorithm: this computes reachability by brute force
 * from every vertex and compares the partition it implies with the one the
 * two searches produced. Kosaraju's argument is nowhere in here, which is
 * what makes it a test of Kosaraju's argument.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const answer = (trace.steps.at(-1)?.hi as { result?: { comp: number[] } })?.result;
  if (!answer) return 'the run recorded no components';
  const comp = answer.comp;

  const adj = adjacency(g);
  const reaches: boolean[][] = Array.from({ length: g.n + 1 }, () =>
    new Array<boolean>(g.n + 1).fill(false),
  );
  for (let s = 1; s <= g.n; s++) {
    const stack = [s];
    reaches[s]![s] = true;
    while (stack.length > 0) {
      const u = stack.pop()!;
      for (const { v } of adj.get(u)!) {
        if (!reaches[s]![v]) {
          reaches[s]![v] = true;
          stack.push(v);
        }
      }
    }
  }

  for (let u = 1; u <= g.n; u++) {
    if (!comp[u]) return `${u} was never put in a component`;
    for (let v = 1; v <= g.n; v++) {
      const mutual = reaches[u]![v]! && reaches[v]![u]!;
      const together = comp[u] === comp[v];
      if (mutual && !together)
        return `${u} and ${v} reach each other but are in different components`;
      if (!mutual && together)
        return `${u} and ${v} are in one component but do not reach each other`;
    }
  }
  return null;
}

export const stronglyConnectedComponents: AlgorithmModule = {
  id: 'strongly-connected-components',
  name: 'Strongly Connected Components',
  visualizer: 'graph',
  aux: [{ key: 'order', label: 'f', hint: 'finish order from the first search, latest last' }],
  procOrder: ['STRONGLY-CONNECTED-COMPONENTS'],
  procedures: {
    'STRONGLY-CONNECTED-COMPONENTS': {
      title: 'STRONGLY-CONNECTED-COMPONENTS(G)',
      indent: [0, 0, 0, 0],
      lines: [
        'call DFS(G) to compute finish times u.f for each u',
        'create Gᵀ',
        'call DFS(Gᵀ), taking vertices in order of decreasing u.f',
        'output the vertices of each tree of the second forest as a component',
      ],
    },
  },
  complexity: {
    best: 'Θ(V + E)',
    average: 'Θ(V + E)',
    worst: 'Θ(V + E)',
    space: 'Θ(V + E)',
    extra: [
      ['Searches needed', 'two — not one per vertex'],
      ['Building Gᵀ', 'Θ(V + E), one pass over the edge list'],
      ['The component graph', 'always a DAG — contract each component to a point'],
      ['Why decreasing f', 'the last to finish is in a component nothing points into, in Gᵀ'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-2, 2-3, 3-1, 3-4',
    note: 'directed; the generated graph always has a cycle',
    label: 'The directed edges, as pairs like 1-2, separated by commas',
    generate: (n) => generateDirected(n, false),
    parse: (text) => parseGraph(text, { directed: true, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
