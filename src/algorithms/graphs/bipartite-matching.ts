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
 * MAXIMUM BIPARTITE MATCHING — CLRS §25.1.
 *
 * A **matching** is a set of edges no two of which share a vertex: an
 * assignment of jobs to workers, of students to projects, of ports to plugs,
 * where nothing is used twice. The question is how big one can be.
 *
 * The obvious greedy answer — take any edge you can, repeat — is wrong, and
 * wrong in an instructive way: it can paint itself into a corner by matching
 * a pair that blocks two other pairs. What rescues it is the same idea that
 * rescued chapter 24's flow, because it is in fact the same idea.
 *
 * **An augmenting path** starts at an unmatched vertex, alternates unmatched
 * and matched edges, and ends at another unmatched vertex. Flip every edge
 * along it — matched becomes unmatched, unmatched becomes matched — and
 * because such a path has one more unmatched edge than matched ones, the
 * matching gets exactly one bigger. Every previously matched vertex on it
 * stays matched, just to a different partner.
 *
 * **Berge's theorem** closes it: a matching is maximum exactly when no
 * augmenting path exists. So the algorithm is "look for an augmenting path
 * from each unmatched vertex on the left; stop when none is left", and the
 * stopping condition is the proof of optimality rather than an approximation
 * of it.
 *
 * The connection to chapter 24 is exact and worth making. Add a source joined
 * to every left vertex, a sink joined from every right vertex, give every
 * edge capacity 1, and a maximum flow *is* a maximum matching — the
 * augmenting paths of §24.2 become these ones. This chapter's version is the
 * same algorithm with the plumbing removed.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const adj = adjacency(g);
  const left = g.left ?? [];
  const mate = new Array<number>(g.n + 1).fill(0);

  const { steps, stats, emit } = createRecorder();
  let visited = new Set<number>();
  let root = 0;

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: false,
      vertices: verticesOf(g),
      edges: g.edges.map((e) => ({ from: vid(e.u), to: vid(e.v) })),
    };
  }

  /** Edges of M, and the vertices they cover. */
  function matched(): { edges: Record<string, Role>; ends: string[] } {
    const edges: Record<string, Role> = {};
    const ends: string[] = [];
    for (const u of left) {
      if (!mate[u]) continue;
      edges[ekey(u, mate[u]!)] = 'done';
      ends.push(vid(u), vid(mate[u]!));
    }
    return { edges, ends };
  }

  function base(): Record<string, unknown> {
    const m = matched();
    return {
      edges: m.edges,
      done: m.ends,
      ...(root ? { mark: vid(root) } : {}),
      ...(visited.size > 0
        ? {
            scope: [...visited].map(vid),
            scopeLabel: `tried this search: ${[...visited].sort((a, b) => a - b).join(', ')}`,
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

  const size = (): number => left.filter((u) => mate[u]).length;

  /**
   * AUGMENT(G, M, u) — try to grow the matching from `u`.
   *
   * Recursive, and the recursion is the alternation: when `v` is already
   * taken, the only way to use it is to ask its current partner to move, and
   * that is exactly the same question one level down.
   */
  function augment(u: number): boolean {
    for (const { v } of adj.get(u)!) {
      if (visited.has(v)) continue;
      visited.add(v);
      stats.comparisons++;
      const free = !mate[v];
      emit(
        'AUGMENT',
        2,
        snapshot(),
        {
          ...base(),
          look: [vid(u), vid(v)],
          edges: { ...(matched().edges as Record<string, Role>), [ekey(u, v)]: 'look' },
          pointers: { u: vid(u), v: vid(v) },
        },
        free
          ? `${v} is unmatched, so ${u}-${v} can simply be taken.`
          : `${v} is taken by ${mate[v]}. Ask ${mate[v]} to find somewhere else.`,
      );

      if (free || augment(mate[v]!)) {
        const previous = mate[v]!;
        mate[u] = v;
        mate[v] = u;
        stats.writes += 2;
        emit(
          'AUGMENT',
          5,
          snapshot(),
          {
            ...base(),
            move: [vid(u), vid(v)],
            edges: { ...(matched().edges as Record<string, Role>), [ekey(u, v)]: 'move' },
            pointers: { u: vid(u), v: vid(v) },
          },
          previous
            ? `${v} switches from ${previous} to ${u}, and ${previous} has already moved on.`
            : `${u}-${v} joins M. Nothing else had to change.`,
        );
        return true;
      }
    }
    emit(
      'AUGMENT',
      7,
      snapshot(),
      { ...base(), look: vid(u), pointers: { u: vid(u) } },
      `Nothing works for ${u} — every neighbour is taken and none of them can move.`,
    );
    return false;
  }

  emit(
    'MAX-BIPARTITE-MATCHING',
    1,
    snapshot(),
    { ...base() },
    `M is empty. The left column is ${left.join(', ')}; every edge joins the two columns.`,
  );

  for (const u of left) {
    if (mate[u]) continue;
    visited = new Set<number>();
    root = u;
    emit(
      'MAX-BIPARTITE-MATCHING',
      3,
      snapshot(),
      { ...base() },
      `${u} is unmatched, so look for an augmenting path starting there.`,
    );
    const grew = augment(u);
    emit(
      'MAX-BIPARTITE-MATCHING',
      grew ? 4 : 3,
      snapshot(),
      { ...base() },
      grew
        ? `The path worked: |M| is now ${size()}. Nothing that was matched became unmatched.`
        : `No augmenting path from ${u}. It stays unmatched, and it always will.`,
    );
    visited = new Set<number>();
    root = 0;
  }

  emit(
    'MAX-BIPARTITE-MATCHING',
    5,
    snapshot(),
    { ...base(), mate: mate.slice() },
    `No augmenting path is left anywhere, so by Berge's theorem |M| = ${size()} is the maximum.`,
  );

  return { steps, output: { matched: size(), left: left.length } };
}

function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const mate = (trace.steps.at(-1)?.hi as { mate?: number[] })?.mate;
  if (!mate) return 'the run recorded no matching';
  return matchingIsMaximum(input, mate);
}

export const bipartiteMatching: AlgorithmModule = {
  id: 'bipartite-matching',
  name: 'Maximum Bipartite Matching',
  visualizer: 'graph',
  aux: [{ key: 'M', label: 'M', hint: "each left vertex's partner, or nothing" }],
  procOrder: ['MAX-BIPARTITE-MATCHING', 'AUGMENT'],
  procedures: {
    // A transcription of §25.1's prose rather than of a numbered procedure:
    // the book develops maximum bipartite matching through the reduction to
    // maximum flow, and this is the augmenting-path algorithm that reduction
    // turns into, written out directly.
    'MAX-BIPARTITE-MATCHING': {
      title: 'MAX-BIPARTITE-MATCHING(G, L, R)',
      indent: [0, 0, 1, 2, 0],
      lines: [
        'M = ∅',
        'for each vertex u ∈ L',
        'if u is unmatched',
        'AUGMENT(G, M, u)',
        'return M',
      ],
    },
    AUGMENT: {
      title: 'AUGMENT(G, M, u)',
      indent: [0, 1, 2, 3, 3, 3, 0],
      lines: [
        'for each v ∈ G.Adj[u]',
        'if v has not been tried in this search',
        'mark v tried',
        'if v is unmatched or AUGMENT(G, M, M[v])',
        'M[u] = v and M[v] = u',
        'return TRUE',
        'return FALSE',
      ],
    },
  },
  complexity: {
    best: 'O(V E)',
    average: 'O(V E)',
    worst: 'O(V E)',
    space: 'Θ(V)',
    extra: [
      ['Searches', 'one per left vertex, each O(E)'],
      ['Berge’s theorem', 'maximum ⟺ no augmenting path'],
      ['As a flow problem', 'unit capacities, a source into L and a sink out of R'],
      ['Integrality', 'unit capacities give an integer max flow, so a real matching'],
      ['Faster', 'Hopcroft-Karp does it in O(E √V), by augmenting in phases'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'graph',
    placeholder: '1-4, 1-5, 2-4, 3-6',
    note: 'bipartite; the two columns are the two sides',
    label: 'The edges, as pairs like 1-4, separated by commas',
    generate: (n) => generateBipartite(n),
    parse: (text) => parseBipartite(text, { directed: false, weighted: false }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 9,
  result: { kind: 'transforms', verify },
  record,
};
