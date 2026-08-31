/**
 * What a correct run of a Part VI algorithm produces — as theorems.
 *
 * The temptation in every one of these is to re-run the algorithm under test
 * and compare, which tests a recorder against a second copy of the same idea
 * and finds nothing when the idea itself is wrong. So none of them do that.
 * Each function below is a **characterization**: a property that a correct
 * answer has and an incorrect one cannot, taken from the proof in the book
 * rather than from the code beside it.
 *
 *   - Shortest paths: no edge is left slack, and every estimate is witnessed
 *     by its own parent. Those two together are the proof in §22.5.
 *   - Minimum spanning trees: the cycle property — no non-tree edge is
 *     lighter than the heaviest edge on the tree path it would close.
 *   - Maximum flow: the flow's value equals the capacity of a cut, which by
 *     max-flow min-cut can only happen when the flow is maximum.
 *   - Maximum matching: no augmenting path is left, which is Berge's theorem.
 */
import type { GraphInput } from '../types.ts';
import { adjacency } from './graph-input.ts';

/**
 * Shortest-path estimates that are actually shortest.
 *
 * Three conditions, and they are exactly the ones §22.5 proves sufficient:
 * `d[s] = 0`, no edge (u,v) with `d[v] > d[u] + w`, and every finite `d[v]`
 * equal to `d[π[v]] + w(π[v], v)` along a real edge. The first two say no
 * shorter path exists; the third says the claimed distance is achieved by a
 * path that is actually there.
 */
export function shortestPathsSound(
  g: GraphInput,
  s: number,
  d: number[],
  pi: number[],
): string | null {
  if (d[s] !== 0) return `d[s] is ${d[s]}, not 0`;

  const out = new Map<number, Array<{ v: number; w: number }>>();
  for (let v = 1; v <= g.n; v++) out.set(v, []);
  for (const e of g.edges) {
    out.get(e.u)!.push({ v: e.v, w: e.w ?? 1 });
    if (!g.directed) out.get(e.v)!.push({ v: e.u, w: e.w ?? 1 });
  }

  for (const [u, list] of out) {
    if (!Number.isFinite(d[u]!)) continue;
    for (const { v, w } of list) {
      if (d[v]! > d[u]! + w) {
        return `edge ${u}→${v} is still slack: d[${v}] = ${d[v]} > ${d[u]} + ${w}`;
      }
    }
  }

  for (let v = 1; v <= g.n; v++) {
    if (v === s || !Number.isFinite(d[v]!)) continue;
    const p = pi[v]!;
    if (!p) return `${v} has a finite d but no parent to justify it`;
    const edge = out.get(p)!.find((e) => e.v === v);
    if (!edge) return `${v}'s parent ${p} has no edge to it`;
    if (d[p]! + edge.w !== d[v]!) {
      return `d[${v}] = ${d[v]} but its parent path gives ${d[p]} + ${edge.w}`;
    }
  }

  // Reachability and finiteness have to agree, or a whole component could be
  // left at ∞ with every other check passing vacuously.
  const seen = new Set<number>([s]);
  const stack = [s];
  while (stack.length > 0) {
    const u = stack.pop()!;
    for (const { v } of out.get(u)!) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  for (const v of seen) if (!Number.isFinite(d[v]!)) return `${v} is reachable but left at ∞`;
  for (let v = 1; v <= g.n; v++) {
    if (!seen.has(v) && Number.isFinite(d[v]!)) return `${v} is unreachable but has d = ${d[v]}`;
  }
  return null;
}

/**
 * A minimum spanning tree, checked by the cycle property.
 *
 * A spanning tree is minimum **iff** every edge not in it is at least as
 * heavy as the heaviest edge on the tree path between its ends — otherwise
 * swapping the two would improve the tree. That is a statement about the
 * answer, not about how it was found, so it holds Kruskal and Prim to the
 * same standard without either one being the other's oracle.
 */
export function isMinimumSpanningTree(
  g: GraphInput,
  chosen: Array<{ u: number; v: number; w: number }>,
): string | null {
  if (chosen.length !== g.n - 1) {
    return `a spanning tree of ${g.n} vertices has ${g.n - 1} edges, not ${chosen.length}`;
  }

  const adj = new Map<number, Array<{ v: number; w: number }>>();
  for (let v = 1; v <= g.n; v++) adj.set(v, []);
  for (const e of chosen) {
    if (!adj.has(e.u) || !adj.has(e.v))
      return `edge ${e.u}-${e.v} names a vertex that is not there`;
    adj.get(e.u)!.push({ v: e.v, w: e.w });
    adj.get(e.v)!.push({ v: e.u, w: e.w });
  }
  for (const e of chosen) {
    const real = g.edges.some((x) => (x.u === e.u && x.v === e.v) || (x.u === e.v && x.v === e.u));
    if (!real) return `edge ${e.u}-${e.v} is not in the graph`;
  }

  // n − 1 edges and connected is the same thing as "a tree", so acyclicity
  // comes for free once connectivity is checked.
  const seen = new Set<number>([1]);
  const stack = [1];
  while (stack.length > 0) {
    const u = stack.pop()!;
    for (const { v } of adj.get(u)!) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  if (seen.size !== g.n) return `the chosen edges do not connect all ${g.n} vertices`;

  /** The heaviest edge on the unique tree path between two vertices. */
  const heaviest = (from: number, to: number): number => {
    const best = new Map<number, number>([[from, -Infinity]]);
    const queue = [from];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const { v, w } of adj.get(u)!) {
        if (best.has(v)) continue;
        best.set(v, Math.max(best.get(u)!, w));
        queue.push(v);
      }
    }
    return best.get(to) ?? Infinity;
  };

  const inTree = new Set(chosen.map((e) => `${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`));
  for (const e of g.edges) {
    const key = `${Math.min(e.u, e.v)}-${Math.max(e.u, e.v)}`;
    if (inTree.has(key)) continue;
    const w = e.w ?? 1;
    const worst = heaviest(e.u, e.v);
    if (w < worst) {
      return `${e.u}-${e.v} weighs ${w}, lighter than the ${worst} it would replace — not minimum`;
    }
  }
  return null;
}

export type Flow = Map<string, number>;

export const fkey = (u: number, v: number): string => `${u}>${v}`;

/**
 * A flow that is feasible, and maximum.
 *
 * Feasible is the definition: every edge within its capacity, and every
 * vertex but the source and the sink conserving what passes through it.
 * Maximum is **max-flow min-cut** — the value of the flow is compared with
 * the capacity of the cut the residual network hands back, and a flow can
 * only equal a cut's capacity when both are optimal.
 */
export function flowIsMaximum(g: GraphInput, s: number, t: number, f: Flow): string | null {
  const net = new Array<number>(g.n + 1).fill(0);
  for (const e of g.edges) {
    const x = f.get(fkey(e.u, e.v)) ?? 0;
    if (x < 0) return `edge ${e.u}→${e.v} carries a negative flow of ${x}`;
    if (x > (e.w ?? 1)) return `edge ${e.u}→${e.v} carries ${x} over a capacity of ${e.w}`;
    net[e.u]! -= x;
    net[e.v]! += x;
  }
  for (let v = 1; v <= g.n; v++) {
    if (v === s || v === t) continue;
    if (net[v] !== 0) return `${v} does not conserve flow: ${net[v]} in excess`;
  }
  const value = net[t]!;
  if (net[s] !== -value) return `what leaves the source (${-net[s]!}) is not what reaches the sink`;

  // The cut the residual network defines: everything still reachable from s
  // once no augmenting path is left.
  const residual = new Map<number, number[]>();
  for (let v = 1; v <= g.n; v++) residual.set(v, []);
  for (const e of g.edges) {
    const x = f.get(fkey(e.u, e.v)) ?? 0;
    if (x < (e.w ?? 1)) residual.get(e.u)!.push(e.v);
    if (x > 0) residual.get(e.v)!.push(e.u);
  }
  const S = new Set<number>([s]);
  const stack = [s];
  while (stack.length > 0) {
    const u = stack.pop()!;
    for (const v of residual.get(u)!) {
      if (!S.has(v)) {
        S.add(v);
        stack.push(v);
      }
    }
  }
  if (S.has(t))
    return `an augmenting path from ${s} to ${t} is still there — the flow is not maximum`;

  let cutCapacity = 0;
  for (const e of g.edges) if (S.has(e.u) && !S.has(e.v)) cutCapacity += e.w ?? 1;
  if (cutCapacity !== value) {
    return `the flow is ${value} but the cut it induces has capacity ${cutCapacity}`;
  }
  return null;
}

/**
 * A matching that is maximum, by Berge's theorem.
 *
 * A matching is maximum **iff** it admits no augmenting path — an alternating
 * path between two unmatched vertices. Searching for one is a different piece
 * of code from the one that built the matching, and it answers the question
 * the algorithm claims to have answered.
 */
export function matchingIsMaximum(g: GraphInput, mate: number[]): string | null {
  const adj = adjacency(g);
  const left = new Set(g.left ?? []);

  for (let v = 1; v <= g.n; v++) {
    const m = mate[v] ?? 0;
    if (!m) continue;
    if (mate[m] !== v) return `${v} is matched to ${m} but ${m} is matched to ${mate[m]}`;
    if (!adj.get(v)!.some((e) => e.v === m)) return `${v} is matched to ${m} along no edge`;
    if (left.has(v) === left.has(m)) return `${v} and ${m} are on the same side`;
  }

  // One alternating search per free left vertex: unmatched edges out, matched
  // edges back. Reaching a free right vertex is an augmenting path.
  for (const u of left) {
    if (mate[u]) continue;
    const seen = new Set<number>();
    const stack: number[] = [u];
    while (stack.length > 0) {
      const x = stack.pop()!;
      for (const { v } of adj.get(x)!) {
        if (seen.has(v)) continue;
        seen.add(v);
        if (!mate[v]) return `an augmenting path from ${u} to ${v} is still there`;
        stack.push(mate[v]!);
      }
    }
  }
  return null;
}
