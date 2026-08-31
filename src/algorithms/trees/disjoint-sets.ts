import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
} from '../types.ts';

/**
 * DISJOINT-SET FOREST — CLRS §19.1 and §19.3: MAKE-SET, FIND-SET and UNION
 * with **union by rank** and **path compression**, driven by
 * CONNECTED-COMPONENTS.
 *
 * The structure keeps a collection of disjoint sets and answers one question:
 * are these two things in the same set? Each set is a tree, each tree is
 * identified by its root, and `FIND-SET` walks up to that root — so the whole
 * cost of everything here is how tall the trees are allowed to get.
 *
 * Two heuristics keep them short, and neither one is obvious:
 *
 * - **Union by rank.** When two trees are joined, the shorter one is hung off
 *   the taller one's root. A tree only gets taller when two trees of equal
 *   rank are joined, so rank grows about as slowly as a logarithm.
 * - **Path compression.** While `FIND-SET` walks to the root, it points every
 *   node it passed **directly at the root**. The walk was happening anyway;
 *   the second walk over the same nodes is free.
 *
 * Together they give an amortised cost of α(n) per operation — the inverse
 * Ackermann function, which is under 5 for any n that could ever be stored.
 * That is chapter 16's kind of analysis, taken to its extreme, and §19.4 is
 * the proof.
 *
 * The run is CONNECTED-COMPONENTS on a list of edges: make a singleton for
 * every vertex, then walk the edges, joining the two ends when they are in
 * different sets. What is on screen is the forest — one tree per component —
 * and each node's **rank** is drawn as a badge, because a rank is data rather
 * than a visual state (E6 in docs/PROGRESS.md).
 */

interface Node {
  id: string;
  label: number;
  p: string;
  rank: number;
}

/** The input is flat pairs: u₁, v₁, u₂, v₂, … */
export function edgesOf(input: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < input.length; i += 2) {
    const u = Math.max(1, Math.round(input[i]!));
    const v = Math.max(1, Math.round(input[i + 1]!));
    if (u !== v) out.push([u, v]);
  }
  return out;
}

export function record(input: number[]): Trace {
  const edges = edgesOf(input);
  const labels = [...new Set(edges.flat())].sort((a, b) => a - b);
  const nodes = new Map<string, Node>();
  const idOf = (label: number): string => `v${label}`;
  const at = (id: string): Node => nodes.get(id)!;

  const { steps, stats, emit } = createRecorder();

  /**
   * The forest: one tree per set, roots side by side.
   *
   * Children are derived from the parent pointers each frame rather than
   * stored, because path compression rewrites them from underneath — a node
   * changes parent without anyone telling its old parent.
   */
  function snapshot(): TreeData {
    const kids = new Map<string, string[]>();
    const roots: string[] = [];
    for (const node of nodes.values()) {
      if (node.p === node.id) roots.push(node.id);
      else kids.set(node.p, [...(kids.get(node.p) ?? []), node.id]);
    }
    return {
      kind: 'tree',
      root: roots[0] ?? null,
      roots: roots.slice(1),
      nodes: [...nodes.values()].map((n) => ({
        id: n.id,
        keys: [n.label],
        ...(kids.has(n.id) ? { children: kids.get(n.id)! } : {}),
        attrs: { rank: n.rank },
      })),
    };
  }

  const treeOf = (root: string): string[] =>
    [...nodes.values()].filter((n) => findRoot(n.id) === root).map((n) => n.id);
  /** The root of x's tree, without emitting anything or compressing. */
  function findRoot(id: string): string {
    let at2 = id;
    while (nodes.get(at2)!.p !== at2) at2 = nodes.get(at2)!.p;
    return at2;
  }
  const chips = (u: number | null, v: number | null) => ({
    edge: auxOf([null, u, v], 1, [null, 'u', 'v']),
  });

  for (const label of labels) {
    nodes.set(idOf(label), { id: idOf(label), label, p: idOf(label), rank: 0 });
  }
  if (labels.length === 0) {
    emit('CONNECTED-COMPONENTS', 1, { kind: 'tree', root: null, nodes: [] }, {}, `No edges.`);
    return { steps, output: { vertices: 0, components: 0 } };
  }

  emit(
    'CONNECTED-COMPONENTS',
    2,
    snapshot(),
    { aux: chips(null, null) },
    `MAKE-SET for each of the ${labels.length} vertices: ${labels.length} trees of one node, each its own root, all of rank 0.`,
  );

  /** FIND-SET(x) — walk to the root, then point everything on the path at it. */
  function find(id: string, note: string): string {
    const path: string[] = [];
    let x = id;
    while (at(x).p !== x) {
      path.push(x);
      x = at(x).p;
      stats.comparisons++;
    }
    const root = x;

    emit(
      'FIND-SET',
      1,
      snapshot(),
      {
        scope: treeOf(root),
        look: [id, ...path],
        mark: root,
        pointers: { x: id },
        aux: chips(at(id).label, null),
      },
      note,
    );

    if (path.length > 1) {
      for (const node of path) at(node).p = root;
      stats.writes += path.length;
      emit(
        'FIND-SET',
        2,
        snapshot(),
        {
          scope: treeOf(root),
          move: path,
          mark: root,
          pointers: { x: id },
          aux: chips(at(id).label, null),
        },
        `Path compression: all ${path.length} nodes on that walk now point straight at ${at(root).label}. The next find here is one step.`,
      );
    }
    return root;
  }

  /** LINK(x, y) — the shorter tree goes under the taller one. */
  function link(a: string, b: string): void {
    const x = at(a);
    const y = at(b);
    stats.comparisons++;
    if (x.rank > y.rank) {
      y.p = x.id;
      stats.writes++;
      emit(
        'LINK',
        2,
        snapshot(),
        { move: b, mark: a, pointers: { x: a, y: b }, aux: chips(x.label, y.label) },
        `${y.label}'s tree is the shorter, so it hangs off ${x.label}. The taller tree's height does not change.`,
      );
      return;
    }
    x.p = y.id;
    stats.writes++;
    const grew = x.rank === y.rank;
    if (grew) y.rank++;
    emit(
      'LINK',
      grew ? 5 : 3,
      snapshot(),
      { move: a, mark: b, pointers: { x: a, y: b }, aux: chips(x.label, y.label) },
      grew
        ? `Equal ranks, so ${x.label} goes under ${y.label} and ${y.label}'s rank becomes ${y.rank}. This is the only way a tree gets taller.`
        : `${x.label}'s tree is the shorter, so it hangs off ${y.label}, whose rank is unchanged.`,
    );
  }

  for (const [u, v] of edges) {
    const uid = idOf(u);
    const vid = idOf(v);
    const ru = find(uid, `Edge (${u}, ${v}). FIND-SET(${u}) walks up to the root of its set.`);
    const rv = find(vid, `FIND-SET(${v}) — the other end of the same edge.`);

    stats.comparisons++;
    if (ru === rv) {
      emit(
        'CONNECTED-COMPONENTS',
        4,
        snapshot(),
        {
          scope: treeOf(ru),
          mark: ru,
          look: [uid, vid],
          aux: chips(u, v),
        },
        `Both ends have the same root, so ${u} and ${v} are already connected. The edge adds nothing.`,
      );
      continue;
    }

    emit(
      'CONNECTED-COMPONENTS',
      5,
      snapshot(),
      {
        scope: [...treeOf(ru), ...treeOf(rv)],
        scopeLabel: 'two sets, about to be one',
        mark: [ru, rv],
        look: [uid, vid],
        aux: chips(u, v),
      },
      `Different roots, so ${u} and ${v} are in different components. UNION joins them.`,
    );
    link(ru, rv);
  }

  const roots = [...nodes.values()].filter((n) => n.p === n.id);
  emit(
    'CONNECTED-COMPONENTS',
    5,
    snapshot(),
    { done: [...nodes.keys()], components: roots.length, aux: chips(null, null) },
    `Every edge has been processed: ${labels.length} vertices in ${roots.length} component${roots.length === 1 ? '' : 's'}, one tree each.`,
  );

  return { steps, output: { vertices: labels.length, components: roots.length } };
}

/**
 * An edge list over a handful of vertices, with at least one edge whose ends
 * are already connected — that branch is half of what CONNECTED-COMPONENTS
 * does, and a generator that only sometimes produces it makes a flaky test.
 */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 10));
  const vertices = Math.min(9, Math.max(4, Math.ceil(count * 0.9)));
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const u = 1 + Math.floor(Math.random() * vertices);
    let v = 1 + Math.floor(Math.random() * vertices);
    if (v === u) v = 1 + ((u % vertices) as number);
    edges.push([u, v]);
  }
  if (count >= 3) edges[count - 1] = [...edges[0]!];
  return edges.flat();
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one edge, as u-v.' };
  if (parts.length > 12) return { error: 'At most 12 edges.' };

  const out: number[] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
    if (!m) return { error: `"${part}" is not an edge. Write each one as u-v, e.g. 2-5.` };
    const u = Number(m[1]);
    const v = Number(m[2]);
    if (u === v) return { error: `"${part}" is a self-loop, which joins nothing.` };
    if (u < 1 || v < 1 || u > 9 || v > 9) return { error: `Vertices run from 1 to 9.` };
    out.push(u, v);
  }
  return { value: out };
}

export const disjointSets: AlgorithmModule = {
  id: 'disjoint-sets',
  name: 'Disjoint-Set Forest',
  visualizer: 'tree',
  aux: [{ key: 'edge', label: 'edge', hint: 'the two ends of the edge being processed' }],
  procOrder: ['CONNECTED-COMPONENTS', 'FIND-SET', 'LINK', 'MAKE-SET', 'UNION'],
  procedures: {
    'CONNECTED-COMPONENTS': {
      title: 'CONNECTED-COMPONENTS(G)',
      indent: [0, 1, 0, 1, 2],
      lines: [
        'for each vertex v ∈ G.V',
        'MAKE-SET(v)',
        'for each edge (u, v) ∈ G.E',
        'if FIND-SET(u) ≠ FIND-SET(v)',
        'UNION(u, v)',
      ],
    },
    'FIND-SET': {
      title: 'FIND-SET(x)',
      indent: [0, 1, 0],
      lines: ['if x ≠ x.p', 'x.p = FIND-SET(x.p)', 'return x.p'],
    },
    LINK: {
      title: 'LINK(x, y)',
      indent: [0, 1, 0, 1, 2],
      lines: [
        'if x.rank > y.rank',
        'y.p = x',
        'else x.p = y',
        'if x.rank == y.rank',
        'y.rank = y.rank + 1',
      ],
    },
    'MAKE-SET': {
      title: 'MAKE-SET(x)',
      indent: [0, 0],
      lines: ['x.p = x', 'x.rank = 0'],
    },
    UNION: {
      title: 'UNION(x, y)',
      indent: [0],
      lines: ['LINK(FIND-SET(x), FIND-SET(y))'],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(α(n))',
    worst: 'Θ(lg n)',
    space: 'Θ(n)',
    extra: [
      ['m operations on n elements', 'O(m α(n)) — §19.4'],
      ['α(n)', 'under 5 for any n that fits in the universe'],
      ['Union by rank alone', 'O(lg n) per operation'],
      ['Path compression alone', 'O(lg n) amortised'],
      ['Both together', 'effectively constant'],
      ['Rank', 'an upper bound on height, not the height'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'graph',
    placeholder: '1-2, 3-4, 2-3, 5-6',
    note: 'each edge as u-v, vertices 1–9',
    label: 'The edges, each written u-v, separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.floor(value.length / 2),
  },
  defaultSize: 8,
  result: {
    // The forest is only right if it partitions the vertices the way the edges
    // do — checked against a plain flood fill over the edge list, which knows
    // nothing about ranks or compression.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const edges = edgesOf(input);
      if (edges.length === 0) return null;
      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';

      // What the forest says.
      const parent = new Map<string, string>();
      for (const node of last.data.nodes) {
        for (const child of node.children ?? []) if (child) parent.set(child, node.id);
      }
      const rootOf = (id: string): string => {
        let x = id;
        const seen = new Set<string>();
        while (parent.has(x)) {
          if (seen.has(x)) return 'cycle';
          seen.add(x);
          x = parent.get(x)!;
        }
        return x;
      };
      const labelOf = new Map(last.data.nodes.map((n) => [n.id, Number(n.keys[0])]));

      // What the edges say, worked out without the structure under test.
      const truth = new Map<number, number>();
      for (const label of new Set(edges.flat())) truth.set(label, label);
      const find = (a: number): number => {
        let x = a;
        while (truth.get(x) !== x) x = truth.get(x)!;
        return x;
      };
      for (const [u, v] of edges) truth.set(find(u), find(v));

      for (const [idA, a] of labelOf) {
        for (const [idB, b] of labelOf) {
          const together = rootOf(idA) === rootOf(idB);
          if (rootOf(idA) === 'cycle') return 'the forest contains a cycle';
          if (together !== (find(a) === find(b))) {
            return together
              ? `${a} and ${b} are in the same tree, but no path of edges connects them`
              : `${a} and ${b} are connected by edges, but ended up in different trees`;
          }
        }
      }

      // Union by rank's invariant: a parent's rank is strictly bigger.
      const rankOf = new Map(last.data.nodes.map((n) => [n.id, Number(n.attrs?.rank ?? 0)]));
      for (const [child, p] of parent) {
        if (!(rankOf.get(p)! > rankOf.get(child)!)) {
          return `a node of rank ${rankOf.get(child)} hangs off a parent of rank ${rankOf.get(p)}`;
        }
      }
      return null;
    },
  },
  record,
};
