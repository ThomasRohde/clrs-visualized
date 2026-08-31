import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type GraphInput,
  type Trace,
} from '../types.ts';
import { generateWeightedDigraph, parseGraph } from '../graphs/graph-input.ts';

/**
 * ALL-PAIRS SHORTEST PATHS BY MATRIX MULTIPLICATION — CLRS §23.1.
 *
 * One of the book's best jokes, and it is entirely serious. Write out the
 * recurrence for "the shortest path from i to j using at most m edges":
 *
 *     l^(m)_ij = min over k of ( l^(m−1)_ik + w_kj )
 *
 * and put it next to the definition of a matrix product:
 *
 *     c_ij     = sum over k of ( a_ik · b_kj )
 *
 * They are the same expression with `min` in place of `sum` and `+` in place
 * of `×`. So extending shortest paths by one edge **is** a matrix
 * multiplication, in an arithmetic where adding means taking the smaller and
 * multiplying means adding.
 *
 * A shortest path has at most n − 1 edges, so the answer is `W` multiplied by
 * itself n − 1 times — Θ(V⁴), which is worse than running Bellman-Ford from
 * every vertex and is not the point.
 *
 * **The point is that this product is associative**, so it can be computed by
 * repeated squaring: `L², L⁴, L⁸, …`, which reaches `L^(n−1)` in ⌈lg(n−1)⌉
 * multiplications instead of n − 1. Θ(V³ lg V), from noticing an analogy.
 *
 * That is what the run below does. The top block is the current `L`; the
 * bottom is the square being built from it, each entry the minimum over one
 * **row of L** and one **column of L** — exactly the row-times-column of
 * §4.1. When the block is full it moves up, and the number of edges paths may
 * use doubles.
 *
 * It stops when `m ≥ n − 1`, and going further would change nothing:
 * `L^(n−1)` is a fixed point, because no shortest path can be longer.
 */

export function record(input: GraphInput): Trace {
  const g = input;
  const n = g.n;

  const W: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === j ? 0 : Infinity)),
  );
  for (const e of g.edges) W[e.u]![e.v] = Math.min(W[e.u]![e.v]!, e.w ?? 1);

  let L: number[][] = W.map((row) => [...row]);
  let next: Array<Array<number | null>> = Array.from({ length: n + 1 }, () =>
    new Array<number | null>(n + 1).fill(null),
  );

  const { steps, stats, emit } = createRecorder();

  /** Rows 0‥n−1 are L; rows n‥2n−1 are the square being built. */
  const l = (i: number, j: number) => `${i - 1},${j - 1}`;
  const s = (i: number, j: number) => `${n + i - 1},${j - 1}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      rows.push({
        label: `L${i}`,
        cells: Array.from({ length: n }, (_, j): GridCell => ({ value: L[i]![j + 1]! })),
      });
    }
    for (let i = 1; i <= n; i++) {
      rows.push({
        label: `L²${i}`,
        cells: Array.from({ length: n }, (_, j): GridCell => ({ value: next[i]![j + 1] })),
      });
    }
    return {
      kind: 'grid',
      corner: 'i\\j',
      colLabels: Array.from({ length: n }, (_, j) => j + 1),
      rows,
    };
  }

  const built = (): string[] => {
    const out: string[] = [];
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) if (next[i]![j] !== null) out.push(s(i, j));
    }
    return out;
  };

  const chips = (m: number) => auxOf([null, m, n - 1], undefined, [null, 'edges ≤', 'needed']);

  let m = 1;
  emit(
    'FASTER-ALL-PAIRS-SHORTEST-PATHS',
    2,
    snapshot(),
    { aux: { m: chips(m) } },
    `L¹ is the weight matrix: the best path using at most one edge is the edge itself.`,
  );

  while (m < n - 1) {
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= n; j++) {
        let best = Infinity;
        let bestK = 0;
        for (let k = 1; k <= n; k++) {
          stats.comparisons++;
          const through = L[i]![k]! + L[k]![j]!;
          if (through < best) {
            best = through;
            bestK = k;
          }
        }
        next[i]![j] = best;
        stats.writes++;
        emit(
          'EXTEND-SHORTEST-PATHS',
          5,
          snapshot(),
          {
            done: built().filter((key) => key !== s(i, j)),
            move: s(i, j),
            // Row i of L and column j of L: the row-times-column of §4.1,
            // with min for sum and + for times.
            look: [
              ...Array.from({ length: n }, (_, k) => l(i, k + 1)),
              ...Array.from({ length: n }, (_, k) => l(k + 1, j)),
            ],
            mark: bestK ? [l(i, bestK), l(bestK, j)] : [],
            scope: Array.from({ length: n }, (_, x) => s(i, x + 1)),
            scopeLabel: `row ${i} of the square`,
            pointers: { j: s(i, j) },
            aux: { m: chips(m) },
          },
          Number.isFinite(best)
            ? `Row ${i} against column ${j}: the smallest sum is ${best}, through ${bestK}.`
            : `Row ${i} against column ${j}: every combination is ∞ — no path of this length.`,
        );
      }
    }

    L = next.map((row) => row.map((v) => (v === null ? Infinity : v)));
    next = Array.from({ length: n + 1 }, () => new Array<number | null>(n + 1).fill(null));
    m *= 2;
    emit(
      'FASTER-ALL-PAIRS-SHORTEST-PATHS',
      5,
      snapshot(),
      { aux: { m: chips(m) } },
      `The square becomes L. Paths may now use up to ${m} edges — doubling, not adding one.`,
    );
  }

  const all: string[] = [];
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) all.push(l(i, j));
  emit(
    'FASTER-ALL-PAIRS-SHORTEST-PATHS',
    6,
    snapshot(),
    { done: all, matrix: L.map((row) => [...row]), aux: { m: chips(m) } },
    `m = ${m} ≥ ${n - 1}, so no path can be longer. ⌈lg(n−1)⌉ squarings, not n−1 products.`,
  );

  return { steps, output: { n, squarings: Math.max(1, Math.ceil(Math.log2(Math.max(1, n - 1)))) } };
}

/**
 * Checked against Bellman-Ford run from every vertex.
 *
 * A completely different algorithm — edge relaxation in passes, rather than
 * repeated squaring of a min-plus matrix — so agreeing on all n² entries is
 * real evidence rather than the same arithmetic done twice.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const n = g.n;
  const L = (trace.steps.at(-1)!.hi as { matrix?: number[][] }).matrix;
  if (!L) return 'the run returned no matrix';

  for (let s = 1; s <= n; s++) {
    const d = new Array<number>(n + 1).fill(Infinity);
    d[s] = 0;
    for (let pass = 1; pass < n; pass++) {
      for (const e of g.edges) {
        const via = d[e.u]! + (e.w ?? 1);
        if (via < d[e.v]!) d[e.v] = via;
      }
    }
    for (let j = 1; j <= n; j++) {
      if (L[s]![j] !== d[j]) {
        return `L[${s},${j}] is ${L[s]![j]}, but Bellman-Ford from ${s} gives ${d[j]}`;
      }
    }
  }
  return null;
}

export const apspMatrixMultiply: AlgorithmModule = {
  id: 'apsp-matrix-multiply',
  name: 'All-Pairs by Matrix Squaring',
  visualizer: 'grid',
  aux: [{ key: 'm', label: 'm', hint: 'edges a path may use, against the n − 1 needed' }],
  procOrder: ['FASTER-ALL-PAIRS-SHORTEST-PATHS', 'EXTEND-SHORTEST-PATHS'],
  procedures: {
    'FASTER-ALL-PAIRS-SHORTEST-PATHS': {
      title: 'FASTER-ALL-PAIRS-SHORTEST-PATHS(W, n)',
      indent: [0, 0, 0, 1, 1, 1, 0],
      lines: [
        'L¹ = W',
        'm = 1',
        'while m < n − 1',
        'let L²ᵐ be a new n × n matrix',
        'L²ᵐ = EXTEND-SHORTEST-PATHS(Lᵐ, Lᵐ, n)',
        'm = 2m',
        'return Lᵐ',
      ],
    },
    'EXTEND-SHORTEST-PATHS': {
      title: 'EXTEND-SHORTEST-PATHS(L, W, n)',
      indent: [0, 1, 2, 2, 3, 0],
      lines: [
        'for i = 1 to n',
        'for j = 1 to n',
        'l′_ij = ∞',
        'for k = 1 to n',
        'l′_ij = min(l′_ij, l_ik + w_kj)',
        'return L′',
      ],
    },
  },
  complexity: {
    best: 'Θ(V³ lg V)',
    average: 'Θ(V³ lg V)',
    worst: 'Θ(V³ lg V)',
    space: 'Θ(V²)',
    extra: [
      ['Without squaring', 'Θ(V⁴) — n − 1 products, one edge at a time'],
      ['Why squaring works', 'the min-plus product is associative'],
      ['Squarings needed', '⌈lg(n − 1)⌉'],
      ['Versus Floyd-Warshall', 'Θ(V³ lg V) against Θ(V³) — slower, and the better idea'],
      ['The analogy', 'min for +, + for × — the same triple loop as §4.1'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 5,
    noun: 'graph',
    placeholder: '1-2:3, 2-3:-2, 3-4:4',
    note: 'directed and weighted; negative weights allowed',
    label: 'Weighted directed edges, as 1-2:3, separated by commas',
    generate: (n) => generateWeightedDigraph(Math.min(n, 5)),
    parse: (text) =>
      parseGraph(text, { directed: true, weighted: true, minWeight: -20, maxWeight: 99, maxN: 5 }),
    size: (value: GraphInput) => value.n,
  },
  defaultSize: 4,
  result: { kind: 'transforms', verify },
  record,
};
