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
import {
  adjacency,
  ekey,
  generateBipartite,
  parseBipartite,
  verticesOf,
  vid,
} from './graph-input.ts';
import { matchingIsMaximum } from './graph-check.ts';

/**
 * HOPCROFT-KARP — CLRS §25.1, the refinement the section names and leaves.
 *
 * §25.1's own algorithm finds **one** augmenting path per search and so pays
 * O(E) for each of up to V/2 improvements: O(V·E). Hopcroft-Karp finds a
 * **maximal set of vertex-disjoint shortest** augmenting paths in one pass and
 * augments along all of them at once, which is O(E) for a whole *phase*, and
 * needs only O(√V) phases. Same theorem, better bookkeeping, O(E√V).
 *
 * **The claim that makes it work is that the shortest augmenting path gets
 * strictly longer every phase.** Take a maximal set of disjoint shortest paths
 * and augment along all of them: no augmenting path of that length survives,
 * because any that did would have to be disjoint from the set — and then the
 * set was not maximal. After √V phases the shortest path is longer than √V,
 * and a matching short of maximum by k has k disjoint augmenting paths, so at
 * most √V improvements remain. Two halves, √V each.
 *
 * That claim is what this player's `verify` checks, rather than the O(√V)
 * bound itself: at the sizes here the bound is not discriminating — a
 * one-path-per-phase implementation would satisfy it — but it would repeat a
 * length, and strict increase catches that.
 *
 * **NIL is a real vertex in the bookkeeping.** Every free right vertex is
 * treated as an edge into a single sink, so "how far to a free right vertex"
 * is just `level[NIL]`, the BFS stops at the layer that first reaches it, and
 * the depth-first pass follows `level[M[v]] == level[u] + 1` without a special
 * case for the end of the path. It is drawn as a level on the left vertices
 * only, which is where the search actually branches.
 */
export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const left = g.left ?? [];
  const mate = new Array<number>(g.n + 1).fill(0);
  /** Index 0 is NIL — the virtual sink every free right vertex leads to. */
  const level = new Array<number>(g.n + 1).fill(Infinity);

  const { steps, stats, emit } = createRecorder();

  const P = 'HOPCROFT-KARP';
  const PL = 'LAYERS';
  const PD = 'DFS-AUGMENT';

  /** The paths this phase found, and how long they were, in edges. */
  const phases: Array<{ length: number; paths: number }> = [];

  /**
   * An augmenting path in edges, from NIL's level.
   *
   * A level counts **left vertices**, because that is where the search
   * branches: `u → v` is level 1 and one edge, `u → v → w → v'` is level 2 and
   * three edges. So a path of level ℓ has 2ℓ − 1 edges, always odd, as an
   * alternating path between two unmatched ends must be. Everything the reader
   * is told is in edges; the level is bookkeeping.
   */
  const pathEdges = (levels: number): number => 2 * levels - 1;
  /** Edges of the augmenting path currently being walked. */
  let onPath = new Set<string>();

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g, (v): Record<string, string> =>
        left.includes(v) && Number.isFinite(level[v]) ? { level: `ℓ${level[v]}` } : {},
      ),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  /** Which vertices are still unmatched — what a phase is trying to shrink. */
  function free(): number[] {
    const out: number[] = [];
    for (let v = 1; v <= g.n; v++) if (!mate[v]) out.push(v);
    return out;
  }

  function base(): Record<string, unknown> {
    const edges: Record<string, Role> = {};
    const ends: string[] = [];
    for (const u of left) {
      if (!mate[u]) continue;
      edges[ekey(u, mate[u]!)] = 'done';
      ends.push(vid(u), vid(mate[u]!));
    }
    for (const key of onPath) edges[key] = 'mark';

    const unmatched = free();
    return {
      edges,
      done: ends,
      ...(unmatched.length > 0
        ? {
            scope: unmatched.map(vid),
            scopeLabel: `still unmatched: ${unmatched.join(', ')}`,
          }
        : {}),
      aux: {
        M: auxOf([null, ...left.map((u) => mate[u] || null)], undefined, [
          null,
          ...left.map((u) => `v${u}`),
        ]),
      },
    };
  }

  /**
   * The layered breadth-first pass.
   *
   * Levels live on the left vertices; a right vertex is only ever crossed to
   * reach its partner, which is the next left vertex the search can branch
   * from. `level[0]` is NIL's, and setting it is what "a free right vertex was
   * reached, at this distance" means.
   */
  function layers(phase: number): boolean {
    for (const u of left) level[u] = mate[u] ? Infinity : 0;
    level[0] = Infinity;
    const queue = left.filter((u) => !mate[u]);

    emit(
      PL,
      2,
      snapshot(),
      { ...base(), mark: queue.map(vid) },
      queue.length === 0
        ? `Phase ${phase}: every left vertex is matched, so there is nothing to grow from.`
        : `Phase ${phase}: the ${queue.length} unmatched left vertex${
            queue.length === 1 ? '' : 'es'
          } start at level 0. Everything else starts at ∞.`,
    );

    let head = 0;
    while (head < queue.length) {
      const u = queue[head++]!;
      stats.comparisons++;

      if (level[u]! >= level[0]!) {
        emit(
          PL,
          7,
          snapshot(),
          { ...base(), look: [vid(u)], pointers: { u: vid(u) } },
          `${u} is at level ${level[u]}, which is already as far as the shortest augmenting path found this phase. Nothing reached from here can be on a shorter one.`,
        );
        continue;
      }

      for (const { v } of adj.get(u)!) {
        const w = mate[v]!;
        stats.comparisons++;
        if (Number.isFinite(level[w]!)) {
          emit(
            PL,
            9,
            snapshot(),
            {
              ...base(),
              look: [vid(u), vid(v)],
              edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
              pointers: { u: vid(u), v: vid(v) },
            },
            w === 0
              ? `${v} is free, and the search already knows it can reach a free vertex on a path of ${pathEdges(level[0]!)} edges.`
              : `${v} is matched to ${w}, which is already at level ${level[w]}. A second route to it cannot be shorter.`,
          );
          continue;
        }

        level[w] = level[u]! + 1;
        stats.writes++;
        if (w !== 0) queue.push(w);
        emit(
          PL,
          10,
          snapshot(),
          {
            ...base(),
            move: w === 0 ? [vid(v)] : [vid(w)],
            look: [vid(u)],
            edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'move' },
            pointers: { u: vid(u), v: vid(v) },
          },
          w === 0
            ? `${v} is unmatched, so an augmenting path ends here — ${pathEdges(level[0]!)} edges long. That is the shortest this phase, and the search stops layering past it.`
            : `${v} is matched to ${w}, so the search crosses to ${w} and gives it level ${level[w]}.`,
        );
      }
    }

    const reached = Number.isFinite(level[0]!);
    emit(
      PL,
      12,
      snapshot(),
      { ...base() },
      reached
        ? `The layers are built, and the shortest augmenting path this phase is ${pathEdges(level[0]!)} edges long.`
        : `No free right vertex is reachable at all, so no augmenting path exists — by Berge's theorem the matching is already maximum.`,
    );
    return reached;
  }

  /**
   * One depth-first walk, confined to the layers.
   *
   * `level[M[v]] == level[u] + 1` is what keeps a path shortest; setting
   * `level[u] = ∞` on the way out is what keeps the paths **disjoint**, since
   * no later walk in this phase can then go through `u`. Both together are why
   * a whole phase costs O(E) rather than O(E) per path.
   */
  function dfsAugment(u: number, path: string[]): boolean {
    if (u === 0) {
      emit(
        PD,
        2,
        snapshot(),
        { ...base() },
        `The walk has reached a free right vertex, so this is a complete augmenting path.`,
      );
      return true;
    }

    for (const { v } of adj.get(u)!) {
      const w = mate[v]!;
      stats.comparisons++;
      const onLayer = level[w] === level[u]! + 1;
      if (!onLayer) {
        emit(
          PD,
          4,
          snapshot(),
          {
            ...base(),
            look: [vid(u), vid(v)],
            edges: { ...(base().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
            pointers: { u: vid(u), v: vid(v) },
          },
          `Going to ${v} would continue at level ${
            Number.isFinite(level[w]!) ? level[w] : '∞'
          }, not ${level[u]! + 1}. This phase only walks along the layers, so that route is skipped.`,
        );
        continue;
      }

      onPath = new Set([...path, ekey(u, v)]);
      emit(
        PD,
        4,
        snapshot(),
        {
          ...base(),
          look: [vid(v)],
          pointers: { u: vid(u), v: vid(v) },
        },
        `${v} is on the next layer, so the walk goes down (${u}, ${v}).`,
      );

      if (dfsAugment(w, [...path, ekey(u, v)])) {
        mate[u] = v;
        mate[v] = u;
        stats.writes += 2;
        onPath = new Set([...path, ekey(u, v)]);
        emit(
          PD,
          5,
          snapshot(),
          { ...base(), move: [vid(u), vid(v)], pointers: { u: vid(u), v: vid(v) } },
          `Flip (${u}, ${v}) into the matching. Every vertex further up this path keeps a partner — it just changes which one.`,
        );
        return true;
      }
      onPath = new Set(path);
    }

    level[u] = Infinity;
    stats.writes++;
    emit(
      PD,
      7,
      snapshot(),
      { ...base(), look: [vid(u)], pointers: { u: vid(u) } },
      `Nothing reachable from ${u} along the layers leads anywhere free. Its level goes back to ∞, so no other path in this phase will come through it — which is what makes them disjoint.`,
    );
    return false;
  }

  emit(P, 1, snapshot(), { ...base() }, `The matching starts empty; every vertex is unmatched.`);

  let phase = 0;
  while (layers(phase + 1)) {
    phase++;
    const length = pathEdges(level[0]!);
    let found = 0;

    for (const u of left) {
      if (mate[u]) continue;
      emit(
        P,
        4,
        snapshot(),
        { ...base(), mark: [vid(u)], pointers: { u: vid(u) } },
        `${u} is still unmatched, so look for a shortest augmenting path from it — ${length} edges, no vertex shared with a path already found this phase.`,
      );
      onPath = new Set();
      if (dfsAugment(u, [])) found++;
      onPath = new Set();
    }

    phases.push({ length, paths: found });
    emit(
      P,
      2,
      snapshot(),
      { ...base() },
      `Phase ${phase} augmented along ${found} disjoint path${
        found === 1 ? '' : 's'
      } of length ${length}, all at once. The next phase's shortest path must be strictly longer.`,
    );
  }

  const size = left.filter((u) => mate[u]).length;
  emit(
    P,
    5,
    snapshot(),
    { ...base() },
    `Done: a maximum matching of ${size} edge${size === 1 ? '' : 's'}, in ${phase} phase${
      phase === 1 ? '' : 's'
    } rather than ${size} separate searches.`,
  );

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = { mate: mate.slice(), phases };
  return { steps, output: { vertices: g.n, matching: size, phases: phase } };
}

function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const answer = (
    trace.steps.at(-1)?.hi as {
      result?: { mate: number[]; phases: Array<{ length: number; paths: number }> };
    }
  )?.result;
  if (!answer) return 'the run recorded no matching';

  // Berge's theorem, exactly as §25.1's own player checks it.
  const maximal = matchingIsMaximum(input, answer.mate);
  if (maximal) return maximal;

  // And the property this algorithm exists for. The O(E√V) bound is not
  // discriminating at these sizes — a one-path-per-phase implementation would
  // meet it — but it would repeat a path length, and this catches that.
  let previous = 0;
  for (const [i, phase] of answer.phases.entries()) {
    if (phase.length <= previous) {
      return `phase ${i + 1} augmented along paths of length ${phase.length}, not longer than phase ${i}'s ${previous}`;
    }
    if (phase.paths < 1) {
      return `phase ${i + 1} found a layered graph but augmented along no path`;
    }
    previous = phase.length;
  }
  // Every augmenting path adds exactly one edge to the matching, so the
  // per-phase bookkeeping has to add up to the answer. A phase that
  // miscounted its paths — or augmented along one it did not report — shows
  // up here and nowhere else.
  const claimed = answer.phases.reduce((sum, phase) => sum + phase.paths, 0);
  const size = answer.mate.filter((partner, v) => v > 0 && partner > 0).length / 2;
  if (claimed !== size) {
    return `the phases claim ${claimed} augmenting paths but the matching has ${size} edges`;
  }
  return null;
}

export const hopcroftKarp: AlgorithmModule = {
  id: 'hopcroft-karp',
  name: 'Hopcroft-Karp',
  visualizer: 'graph',
  aux: [{ key: 'M', label: 'M', hint: "each left vertex's partner, or nothing" }],
  procOrder: ['HOPCROFT-KARP', 'LAYERS', 'DFS-AUGMENT'],
  procedures: {
    'HOPCROFT-KARP': {
      title: 'HOPCROFT-KARP(G, L, R)',
      indent: [0, 0, 1, 2, 0],
      lines: [
        'M = ∅',
        'while LAYERS(G, M, L) == TRUE',
        'for each unmatched u ∈ L',
        'DFS-AUGMENT(G, M, u)',
        'return M',
      ],
    },
    LAYERS: {
      title: 'LAYERS(G, M, L)',
      indent: [0, 1, 0, 0, 0, 1, 1, 2, 3, 4, 4, 0],
      lines: [
        'for each u ∈ L',
        'level[u] = 0 if u unmatched, else ∞',
        'level[NIL] = ∞',
        'Q = the unmatched vertices of L',
        'while Q is not empty',
        'u = DEQUEUE(Q)',
        'if level[u] < level[NIL]',
        'for each v ∈ G.Adj[u]',
        'if level[M[v]] == ∞',
        'level[M[v]] = level[u] + 1',
        'if M[v] ≠ NIL then ENQUEUE(Q, M[v])',
        'return level[NIL] ≠ ∞',
      ],
    },
    'DFS-AUGMENT': {
      title: 'DFS-AUGMENT(G, M, u)',
      indent: [0, 1, 0, 1, 2, 2, 0, 0],
      lines: [
        'if u == NIL',
        'return TRUE',
        'for each v ∈ G.Adj[u]',
        'if level[M[v]] == level[u] + 1 and DFS-AUGMENT(G, M, M[v])',
        'M[u] = v;  M[v] = u',
        'return TRUE',
        'level[u] = ∞',
        'return FALSE',
      ],
    },
  },
  complexity: {
    best: 'O(E √V)',
    average: 'O(E √V)',
    worst: 'O(E √V)',
    space: 'Θ(V)',
    extra: [
      ['Phases', 'O(√V) — the shortest augmenting path grows every phase'],
      ['Each phase', 'O(E): one BFS, and one DFS that never revisits a vertex'],
      ['§25.1’s version', 'O(V·E) — one path per search instead of a maximal set'],
      ['Why disjoint', 'level[u] = ∞ on the way out, so no later path reuses u'],
      ['Still Berge', 'it stops when no augmenting path exists, exactly as before'],
    ],
  },
  input: {
    minSize: 6,
    maxSize: 14,
    noun: 'graph',
    placeholder: '1-4, 1-5, 2-4, 3-6',
    note: 'bipartite; the two columns are the two sides',
    label: 'The edges, as pairs like 1-4, separated by commas',
    generate: (n) => generateBipartite(n),
    parse: (text) => parseBipartite(text, { directed: false, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 10,
  result: { kind: 'transforms', verify },
  record,
};
