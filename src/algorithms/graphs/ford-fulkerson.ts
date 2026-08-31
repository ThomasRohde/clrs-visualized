import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphData,
  type GraphEdge,
  type GraphInput,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, generateFlowNetwork, parseGraph, verticesOf, vid } from './graph-input.ts';
import { fkey, flowIsMaximum } from './graph-check.ts';

/**
 * THE FORD-FULKERSON METHOD — CLRS §24.2.
 *
 * A *method* rather than an algorithm, and the book is careful about the
 * word: it says what to do and not how, and the how is what §24.3 is for.
 *
 * Push flow from the source to the sink along any path that still has room.
 * Repeat. Stop when there is no such path. That is all of it — except for one
 * idea without which it is simply wrong, and with which it is optimal.
 *
 * **The residual network.** After some flow has been pushed, the useful
 * question is not "which edges have capacity" but "which changes are still
 * available", and there are two kinds. An edge carrying 3 of 5 can take 2
 * more. An edge carrying 3 of any capacity can also give 3 *back* — sending
 * flow the other way along it cancels what is there. That second kind is
 * drawn here as a dashed arrow, and it is what lets the method undo a bad
 * early decision without ever backtracking. Without it, a greedy first path
 * can wedge the flow below the maximum and nothing can recover.
 *
 * **When it stops, it is optimal**, and the reason is on screen at the end.
 * When no augmenting path is left, the vertices still reachable from the
 * source in the residual network form one side of a **cut**, every edge
 * leaving it is full, and every edge entering it is empty. So the flow equals
 * that cut's capacity — and since no flow can ever exceed any cut, both are
 * optimal. That is the max-flow min-cut theorem, and the ring at the end of
 * the run is the cut it names.
 *
 * The method's cost depends entirely on how the path is chosen, which is
 * exactly what it declines to specify. This run picks paths depth-first; the
 * chapter's other player picks the shortest one, and that single change is
 * the difference between a bound in the capacities and a bound in the size of
 * the graph.
 */

export type Flow = Map<string, number>;

export interface Augmentation {
  path: Array<{ u: number; v: number; forward: boolean }>;
  bottleneck: number;
}

/** The residual capacity of going from u to v, over both kinds of edge. */
export function residual(g: GraphInput, f: Flow, u: number, v: number): number {
  const forward = g.edges.find((e) => e.u === u && e.v === v);
  if (forward) return (forward.w ?? 1) - (f.get(fkey(u, v)) ?? 0);
  const back = g.edges.find((e) => e.u === v && e.v === u);
  if (back) return f.get(fkey(v, u)) ?? 0;
  return 0;
}

/** Everything reachable from `s` in the residual network — the cut side. */
export function reachable(g: GraphInput, f: Flow, s: number): Set<number> {
  const seen = new Set<number>([s]);
  const stack = [s];
  while (stack.length > 0) {
    const u = stack.pop()!;
    for (let v = 1; v <= g.n; v++) {
      if (!seen.has(v) && residual(g, f, u, v) > 0) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen;
}

/**
 * The network as drawn: every real edge labelled `flow/capacity`, plus a
 * dashed arrow wherever flow could be sent back.
 */
export function flowSnapshot(g: GraphInput, f: Flow): GraphData {
  const edges: GraphEdge[] = [];
  for (const e of g.edges) {
    const x = f.get(fkey(e.u, e.v)) ?? 0;
    edges.push({ from: vid(e.u), to: vid(e.v), weight: `${x}/${e.w ?? 1}` });
    // The residual edge only exists while there is flow to give back, so it
    // appears and disappears as the run goes on — which is the honest picture
    // of G_f, and the thing a static drawing of G cannot show.
    if (x > 0) edges.push({ from: vid(e.v), to: vid(e.u), weight: x, ghost: true });
  }
  return { kind: 'graph', directed: true, vertices: verticesOf(g), edges };
}

/** Edges already at capacity — settled, and never touched again. */
export function saturated(g: GraphInput, f: Flow): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const e of g.edges) {
    if ((f.get(fkey(e.u, e.v)) ?? 0) >= (e.w ?? 1)) out[ekey(e.u, e.v)] = 'done';
  }
  return out;
}

/** The value of the flow: what leaves the source. */
export function flowValue(g: GraphInput, f: Flow, s: number): number {
  let out = 0;
  for (const e of g.edges) {
    if (e.u === s) out += f.get(fkey(e.u, e.v)) ?? 0;
    if (e.v === s) out -= f.get(fkey(e.u, e.v)) ?? 0;
  }
  return out;
}

/** A depth-first augmenting path, taking the lowest-numbered option first. */
function findPath(g: GraphInput, f: Flow, s: number, t: number): Augmentation | null {
  const parent = new Map<number, { u: number; forward: boolean }>();
  const seen = new Set<number>([s]);
  const stack = [s];
  while (stack.length > 0) {
    const u = stack.pop()!;
    if (u === t) break;
    for (let v = g.n; v >= 1; v--) {
      if (seen.has(v) || residual(g, f, u, v) <= 0) continue;
      seen.add(v);
      parent.set(v, { u, forward: g.edges.some((e) => e.u === u && e.v === v) });
      stack.push(v);
    }
  }
  if (!seen.has(t)) return null;

  const path: Array<{ u: number; v: number; forward: boolean }> = [];
  let at = t;
  while (at !== s) {
    const step = parent.get(at)!;
    path.unshift({ u: step.u, v: at, forward: step.forward });
    at = step.u;
  }
  const bottleneck = Math.min(...path.map((p) => residual(g, f, p.u, p.v)));
  return { path, bottleneck };
}

export function record(input: GraphInput): Trace {
  const g = input;
  const s = g.source ?? 1;
  const t = g.sink ?? g.n;
  const f: Flow = new Map();
  for (const e of g.edges) f.set(fkey(e.u, e.v), 0);

  const { steps, stats, emit } = createRecorder();

  function base(aug?: Augmentation): Record<string, unknown> {
    const cut = reachable(g, f, s);
    return {
      edges: saturated(g, f),
      mark: [vid(s), vid(t)],
      // The ring appears only once the residual network has stopped reaching
      // everything. While it still reaches every vertex it rings the whole
      // picture and says nothing; the moment it does not, it is a cut taking
      // shape, and on the last step it is the minimum cut itself.
      ...(cut.size < g.n
        ? {
            scope: [...cut].map(vid),
            scopeLabel: `reachable in G_f: ${[...cut].sort((a, b) => a - b).join(', ')}`,
          }
        : {}),
      aux: {
        p: aug
          ? auxOf([null, aug.path[0]!.u, ...aug.path.map((x) => x.v)], undefined, [
              null,
              '',
              ...aug.path.map((x) => (x.forward ? '' : 'back')),
            ])
          : auxOf([null]),
        f: auxOf([null, flowValue(g, f, s)], 1, [null, '|f|']),
      },
    };
  }

  emit(
    'FORD-FULKERSON',
    2,
    flowSnapshot(g, f),
    { ...base() },
    `Every edge starts at 0 flow. Each label is flow over capacity; ${s} is the source, ${t} the sink.`,
  );

  let augmentations = 0;
  for (;;) {
    const aug = findPath(g, f, s, t);
    if (!aug) break;
    augmentations++;
    stats.comparisons++;

    const pathEdges: Record<string, Role> = { ...saturated(g, f) };
    for (const p of aug.path) pathEdges[ekey(p.u, p.v)] = 'look';
    emit(
      'FORD-FULKERSON',
      3,
      flowSnapshot(g, f),
      {
        ...base(aug),
        look: [s, ...aug.path.map((p) => p.v)].map(vid),
        edges: pathEdges,
      },
      `A path with room: ${[s, ...aug.path.map((p) => p.v)].join(' → ')}${
        aug.path.some((p) => !p.forward) ? ', using a dashed edge backwards' : ''
      }.`,
    );

    emit(
      'FORD-FULKERSON',
      4,
      flowSnapshot(g, f),
      { ...base(aug), look: [s, ...aug.path.map((p) => p.v)].map(vid), edges: pathEdges },
      `The narrowest step on it has ${aug.bottleneck} to spare, so that is what the path can carry.`,
    );

    for (const p of aug.path) {
      const key = p.forward ? fkey(p.u, p.v) : fkey(p.v, p.u);
      f.set(key, (f.get(key) ?? 0) + (p.forward ? aug.bottleneck : -aug.bottleneck));
      stats.writes++;
      const moved: Record<string, Role> = { ...saturated(g, f) };
      moved[ekey(p.u, p.v)] = 'move';
      emit(
        'FORD-FULKERSON',
        p.forward ? 7 : 8,
        flowSnapshot(g, f),
        { ...base(aug), move: [vid(p.u), vid(p.v)], edges: moved },
        p.forward
          ? `(${p.u}, ${p.v}) now carries ${f.get(key)}.`
          : `(${p.v}, ${p.u}) drops to ${f.get(key)} — the path sent ${aug.bottleneck} back along it.`,
      );
    }
  }

  const cut = reachable(g, f, s);
  const value = flowValue(g, f, s);
  let cutCapacity = 0;
  for (const e of g.edges) if (cut.has(e.u) && !cut.has(e.v)) cutCapacity += e.w ?? 1;
  emit(
    'FORD-FULKERSON',
    9,
    flowSnapshot(g, f),
    {
      ...base(),
      done: [...cut].map(vid),
      flow: [...f.entries()],
      augmentations,
    },
    `No path is left. The ring is a cut of capacity ${cutCapacity}, and |f| = ${value} — so both are optimal.`,
  );

  return { steps, output: { value, augmentations, cut: cutCapacity } };
}

/** Feasible, and equal to the capacity of a cut. See `flowIsMaximum`. */
export function verifyFlow(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const entries = (trace.steps.at(-1)?.hi as { flow?: Array<[string, number]> })?.flow;
  if (!entries) return 'the run recorded no final flow';
  return flowIsMaximum(g, g.source ?? 1, g.sink ?? g.n, new Map(entries));
}

export const fordFulkerson: AlgorithmModule = {
  id: 'ford-fulkerson',
  name: 'Ford-Fulkerson',
  visualizer: 'graph',
  aux: [
    { key: 'p', label: 'p', hint: 'the augmenting path being used' },
    { key: 'f', label: '|f|', hint: 'the value of the flow so far' },
  ],
  procOrder: ['FORD-FULKERSON'],
  procedures: {
    'FORD-FULKERSON': {
      title: 'FORD-FULKERSON(G, s, t)',
      indent: [0, 1, 0, 1, 1, 2, 3, 2, 0],
      lines: [
        'for each edge (u, v) ∈ G.E',
        '(u, v).f = 0',
        'while there is a path p from s to t in G_f',
        'c_f(p) = min{c_f(u, v) : (u, v) ∈ p}',
        'for each edge (u, v) ∈ p',
        'if (u, v) ∈ G.E',
        '(u, v).f = (u, v).f + c_f(p)',
        'else (v, u).f = (v, u).f − c_f(p)',
        'return f',
      ],
    },
  },
  complexity: {
    best: 'O(E)',
    average: 'O(E · |f*|)',
    worst: 'O(E · |f*|)',
    space: 'Θ(V + E)',
    extra: [
      ['Why the flow value is in the bound', 'each augmentation may add only 1'],
      ['With irrational capacities', 'it can fail to terminate at all'],
      ['The fix', 'choose the path shortest, not any — see Edmonds-Karp'],
      ['At the end', '|f| equals the capacity of the cut the ring shows'],
      ['Residual edges', 'a dashed arrow is flow that can be sent back'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'network',
    placeholder: '1-2:16, 1-3:13, 2-4:12, 3-4:9',
    note: 'directed capacities; 1 is the source and the last vertex the sink',
    label: 'Edges with capacities, as 1-2:16, separated by commas',
    generate: (n) => generateFlowNetwork(n),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: 1, maxWeight: 99 }),
    size: (input: GraphInput) => input.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify: verifyFlow },
  record,
};
