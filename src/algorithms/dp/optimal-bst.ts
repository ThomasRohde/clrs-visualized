import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * OPTIMAL BINARY SEARCH TREES — CLRS §14.5.
 *
 * Chapter 12 built search trees and chapter 13 kept them balanced. Balance
 * minimises the *worst* search. This chapter minimises the **average** one,
 * which is a different tree — and sometimes a deliberately unbalanced one.
 *
 * If you know how often each key is looked for, the best tree puts the
 * popular keys near the root, even at the cost of pushing rare ones deep. A
 * key at depth d costs d + 1 comparisons, so the expected cost of a tree is
 * the sum over every key of `frequency × (depth + 1)`, plus the same for the
 * **unsuccessful** searches — the gaps between keys, which are where a search
 * for a key that is not there ends up. Those gaps are the `q` values, and
 * ignoring them gives the wrong tree.
 *
 * The recurrence has the shape of §14.2's, and for the same reason: whatever
 * the optimal tree is, some key `r` is its root, and its two subtrees must
 * themselves be optimal for the keys either side of `r`. So try every `r`:
 *
 *     e[i, j] = min over r of ( e[i, r−1] + e[r+1, j] + w(i, j) )
 *
 * The `w(i, j)` term is the part worth understanding. When a subtree becomes
 * the child of a new root, **every node in it goes one level deeper**, so its
 * cost rises by the total frequency of everything in it. That is what `w` is,
 * and it is why the two subtree costs cannot simply be added.
 *
 * The table below is `e`. Each entry is the best cost for the keys `i‥j`, and
 * the note under it is the root that achieves it. Following those roots
 * recursively builds the tree — which the run does at the end, and which is
 * the only reason the roots were stored.
 *
 * Frequencies here are whole numbers rather than probabilities. It is the
 * same problem scaled by the total, and it keeps the table readable.
 */

export function record(input: number[]): Trace {
  // The first n entries are key frequencies p[1‥n]; the rest are the n + 1
  // gap frequencies q[0‥n].
  const n = (input.length - 1) / 2;
  const p = [0, ...input.slice(0, n)];
  const q = input.slice(n);

  const e: Array<Array<number | null>> = Array.from({ length: n + 2 }, () =>
    new Array<number | null>(n + 1).fill(null),
  );
  const w: number[][] = Array.from({ length: n + 2 }, () => new Array<number>(n + 1).fill(0));
  const root: Array<Array<number | null>> = Array.from({ length: n + 2 }, () =>
    new Array<number | null>(n + 1).fill(null),
  );

  const { steps, stats, emit } = createRecorder();

  /** Row r of the drawing is i = r + 1; column c is j = c. */
  const key = (i: number, j: number) => `${i - 1},${j}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 1; i <= n + 1; i++) {
      const cells: GridCell[] = [];
      for (let j = 0; j <= n; j++) {
        cells.push({
          value: e[i]![j] ?? null,
          ...(root[i]![j] ? { note: `k${root[i]![j]}` } : {}),
        });
      }
      rows.push({ label: `i=${i}`, cells });
    }
    return {
      kind: 'grid',
      corner: 'e',
      colLabels: Array.from({ length: n + 1 }, (_, j) => `j=${j}`),
      rows,
    };
  }

  const filled = (): string[] => {
    const out: string[] = [];
    for (let i = 1; i <= n + 1; i++) {
      for (let j = 0; j <= n; j++) if (e[i]![j] !== null) out.push(key(i, j));
    }
    return out;
  };

  const chips = () => ({
    p: auxOf([null, ...p.slice(1)], undefined, [null, ...p.slice(1).map((_, k) => `k${k + 1}`)]),
    q: auxOf([null, ...q], undefined, [null, ...q.map((_, k) => `d${k}`)]),
  });

  for (let i = 1; i <= n + 1; i++) {
    e[i]![i - 1] = q[i - 1]!;
    w[i]![i - 1] = q[i - 1]!;
    stats.writes++;
  }
  emit(
    'OPTIMAL-BST',
    3,
    snapshot(),
    {
      done: filled(),
      scope: Array.from({ length: n + 1 }, (_, i) => key(i + 1, i)),
      scopeLabel: 'empty subtrees — just the gap below them',
      aux: chips(),
    },
    `The subdiagonal is the empty subtrees: a gap on its own costs its own frequency.`,
  );

  for (let len = 1; len <= n; len++) {
    for (let i = 1; i <= n - len + 1; i++) {
      const j = i + len - 1;
      w[i]![j] = w[i]![j - 1]! + p[j]! + q[j]!;
      let best = Infinity;
      let bestR = i;

      const diagonal: string[] = [];
      for (let a = 1; a + len - 1 <= n; a++) diagonal.push(key(a, a + len - 1));
      emit(
        'OPTIMAL-BST',
        9,
        snapshot(),
        {
          done: filled(),
          move: key(i, j),
          scope: diagonal,
          scopeLabel: `subtrees of ${len} key${len === 1 ? '' : 's'}`,
          pointers: { j: key(i, j) },
          aux: chips(),
        },
        `Keys k${i}‥k${j}. Their total weight is ${w[i]![j]} — what every one of them costs per level.`,
      );

      for (let r = i; r <= j; r++) {
        const t = e[i]![r - 1]! + e[r + 1]![j]! + w[i]![j]!;
        stats.comparisons++;
        const better = t < best;
        if (better) {
          best = t;
          bestR = r;
        }
        emit(
          'OPTIMAL-BST',
          better ? 13 : 11,
          snapshot(),
          {
            done: filled(),
            look: [key(i, r - 1), key(r + 1, j)],
            move: key(i, j),
            arrows: [
              { from: key(i, r - 1), to: key(i, j), role: 'look' as const },
              { from: key(r + 1, j), to: key(i, j), role: 'look' as const },
            ],
            pointers: { r: key(i, r - 1) },
            aux: chips(),
          },
          `Root k${r}: ${e[i]![r - 1]} + ${e[r + 1]![j]} + ${w[i]![j]} = ${t}${
            better ? ' — best so far.' : '.'
          }`,
        );
      }

      e[i]![j] = best;
      root[i]![j] = bestR;
      stats.writes++;
      emit(
        'OPTIMAL-BST',
        14,
        snapshot(),
        {
          done: filled().filter((c) => c !== key(i, j)),
          move: key(i, j),
          pointers: { j: key(i, j) },
          aux: chips(),
        },
        `e[${i},${j}] = ${best}, with k${bestR} at the root of this stretch.`,
      );
    }
  }

  // Reconstruct the tree from the stored roots, which is the only thing they
  // were kept for.
  const path: string[] = [];
  const shape = (i: number, j: number): string => {
    if (i > j) return '·';
    path.push(key(i, j));
    const r = root[i]![j]!;
    if (i === j) return `k${r}`;
    return `(${shape(i, r - 1)} k${r} ${shape(r + 1, j)})`;
  };
  const tree = shape(1, n);

  emit(
    'OPTIMAL-BST',
    15,
    snapshot(),
    {
      done: filled().filter((c) => !path.includes(c)),
      mark: [...path],
      arrows: path
        .filter((c) => c !== key(1, n))
        .map((c) => ({ from: key(1, n), to: c, role: 'mark' as const })),
      cost: e[1]![n] as number,
      root: root[1]![n] as number,
      shape: tree,
      aux: chips(),
    },
    `Expected cost ${e[1]![n]}, with k${root[1]![n]} at the root: ${tree}`,
  );

  return { steps, output: { cost: e[1]![n] as number, keys: n } };
}

/**
 * Optimal against every tree, checked two ways.
 *
 * The cost is compared with an independent memoized recursion — the
 * definition, not the table — and then the *tree the roots describe* is
 * costed from scratch by walking it and charging every key and every gap for
 * its own depth. A table can be right while its `root` entries are wrong, and
 * only the second check sees that.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = (input.length - 1) / 2;
  const p = [0, ...input.slice(0, n)];
  const q = input.slice(n);

  const memo = new Map<string, number>();
  const weight = (i: number, j: number): number => {
    let sum = q[i - 1]!;
    for (let k = i; k <= j; k++) sum += p[k]! + q[k]!;
    return sum;
  };
  const best = (i: number, j: number): number => {
    if (i > j) return q[i - 1]!;
    const cached = memo.get(`${i},${j}`);
    if (cached !== undefined) return cached;
    let out = Infinity;
    for (let r = i; r <= j; r++) {
      out = Math.min(out, best(i, r - 1) + best(r + 1, j) + weight(i, j));
    }
    memo.set(`${i},${j}`, out);
    return out;
  };

  const hi = trace.steps.at(-1)!.hi as { cost?: number; shape?: string };
  if (hi.cost === undefined || !hi.shape) return 'the run reported no result';
  const expected = best(1, n);
  if (hi.cost !== expected) return `the table says ${hi.cost}, the recursion says ${expected}`;

  // Cost the printed tree independently: every key and every gap pays for its
  // own depth, which is the definition of expected search cost.
  let total = 0;
  let at = 0;
  const walk = (depth: number): { lo: number; hi: number } | null => {
    if (hi.shape![at] === '·') {
      at++;
      return null;
    }
    if (hi.shape![at] === '(') {
      at++;
      const left = walk(depth + 1);
      at++; // the space before the key
      const m = /^k(\d+)/.exec(hi.shape!.slice(at));
      if (!m) return null;
      at += m[0].length;
      const r = Number(m[1]);
      total += p[r]! * (depth + 1);
      at++; // the space after the key
      const right = walk(depth + 1);
      if (hi.shape![at] !== ')') return null;
      at++;
      // A gap sits one level below the leaf it hangs from.
      if (!left) total += q[r - 1]! * (depth + 2);
      if (!right) total += q[r]! * (depth + 2);
      return { lo: left ? left.lo : r, hi: right ? right.hi : r };
    }
    const m = /^k(\d+)/.exec(hi.shape!.slice(at));
    if (!m) return null;
    at += m[0].length;
    const r = Number(m[1]);
    total += p[r]! * (depth + 1);
    total += q[r - 1]! * (depth + 2) + q[r]! * (depth + 2);
    return { lo: r, hi: r };
  };
  const span = walk(0);
  if (!span || at !== hi.shape.length) return `could not read back "${hi.shape}"`;
  if (span.lo !== 1 || span.hi !== n) return `"${hi.shape}" is not a tree over all ${n} keys`;
  if (total !== expected) {
    return `the tree "${hi.shape}" actually costs ${total}, not the ${expected} claimed`;
  }
  return null;
}

/** Uneven frequencies, so the optimal tree is not just the balanced one. */
function generate(n: number): number[] {
  const keys = Math.max(2, Math.min(n, 6));
  const draw = () => 1 + Math.floor(Math.random() * 9);
  return [
    ...Array.from({ length: keys }, draw),
    ...Array.from({ length: keys + 1 }, () => Math.max(1, Math.floor(draw() / 2))),
  ];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 5 || parts.length % 2 === 0) {
    return {
      error: 'Give n key frequencies then n + 1 gap frequencies — an odd count, at least 5.',
    };
  }
  const n = (parts.length - 1) / 2;
  if (n > 6) return { error: 'At most 6 keys; the table is (n+1) × (n+1).' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 99) {
      return { error: `"${part}" is not a whole number between 0 and 99.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const optimalBst: AlgorithmModule = {
  id: 'optimal-bst',
  name: 'Optimal Binary Search Tree',
  visualizer: 'grid',
  aux: [
    { key: 'p', label: 'p', hint: 'how often each key is searched for' },
    { key: 'q', label: 'q', hint: 'how often a search falls into each gap' },
  ],
  procOrder: ['OPTIMAL-BST'],
  procedures: {
    'OPTIMAL-BST': {
      title: 'OPTIMAL-BST(p, q, n)',
      indent: [0, 0, 1, 1, 0, 1, 2, 2, 2, 2, 3, 3, 4, 4, 0],
      lines: [
        'let e[1:n+1, 0:n], w[1:n+1, 0:n], root[1:n, 1:n] be new tables',
        'for i = 1 to n + 1',
        'e[i, i−1] = q[i−1]',
        'w[i, i−1] = q[i−1]',
        'for l = 1 to n',
        'for i = 1 to n − l + 1',
        'j = i + l − 1',
        'e[i, j] = ∞',
        'w[i, j] = w[i, j−1] + p[j] + q[j]',
        'for r = i to j',
        't = e[i, r−1] + e[r+1, j] + w[i, j]',
        'if t < e[i, j]',
        'e[i, j] = t',
        'root[i, j] = r',
        'return e and root',
      ],
    },
  },
  complexity: {
    best: 'Θ(n³)',
    average: 'Θ(n³)',
    worst: 'Θ(n³)',
    space: 'Θ(n²)',
    extra: [
      ['Trees to choose from', 'Catalan(n) — the same explosion as §14.2'],
      ['Subproblems', 'Θ(n²), each trying O(n) roots'],
      ['Why w(i, j) is added', 'a subtree gaining a parent puts every node one deeper'],
      ['Versus a balanced tree', 'this minimises the average search, not the worst'],
      ['Knuth’s refinement', 'O(n²), by bounding where the root can move'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 6,
    noun: 'frequency table',
    placeholder: '15, 10, 5, 10, 20, 5, 10, 5, 5, 5, 10',
    note: 'n key frequencies, then n + 1 gap frequencies',
    label: 'Key frequencies then gap frequencies, separated by commas',
    generate,
    parse,
    size: (value: number[]) => (value.length - 1) / 2,
  },
  defaultSize: 5,
  result: { kind: 'transforms', verify },
  record,
};
