import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
} from '../types.ts';

/**
 * ORDER-STATISTIC TREE — CLRS §17.1: OS-SELECT and OS-RANK, and the first
 * example of augmenting a data structure.
 *
 * Chapter 9 found the i-th smallest of an array in Θ(n) — but it had to be
 * handed the whole array, and it rearranged it. This is the same question
 * asked of a *dynamic* set: what is the i-th smallest right now, with
 * insertions and deletions happening in between, and what rank does this
 * element have?
 *
 * The structure that answers it is chapter 13's tree with **one extra field
 * per node**: `x.size`, the number of nodes in the subtree rooted at x. That
 * is the entire augmentation, and both queries fall straight out of it —
 * `x.left.size + 1` is x's own rank within its subtree, so one comparison per
 * level decides which way to go.
 *
 * The field is drawn as a **badge** on each node, because a subtree size is
 * data rather than a visual state (E6 in docs/PROGRESS.md). Watch the badges
 * during the insertions: every node on the path from the root down to the new
 * leaf has its size incremented, and nothing else in the tree is touched. That
 * is what makes the augmentation free — the walk was happening anyway.
 *
 * §17.2 asks the question this raises: a red-black tree also *rotates*, so can
 * `size` survive one? It can, in Θ(1), because a rotation only changes which
 * nodes are in two subtrees and both new sizes can be read off the old ones.
 * The insertions here maintain sizes down the path, which is where the idea
 * lives; the chapter's prose carries the rotation case.
 */

interface Node {
  id: string;
  key: number;
  size: number;
  left: string | null;
  right: string | null;
  p: string | null;
}

export function record(input: number[]): Trace {
  const nodes = new Map<string, Node>();
  let root: string | null = null;
  const at = (id: string): Node => nodes.get(id)!;
  const sizeOf = (id: string | null): number => (id ? at(id).size : 0);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): TreeData {
    return {
      kind: 'tree',
      root,
      nodes: [...nodes.values()].map((n) => ({
        id: n.id,
        keys: [n.key],
        ...(n.left || n.right ? { children: [n.left, n.right] } : {}),
        attrs: { size: n.size },
      })),
    };
  }

  const subtree = (id: string | null): string[] =>
    !id ? [] : [id, ...subtree(at(id).left), ...subtree(at(id).right)];
  const chips = (i: number | null, r: number | null) => ({
    os: auxOf([null, i, r], 1, [null, 'i', 'r']),
  });

  /** Insert as a plain search tree would, incrementing sizes on the way down. */
  function insert(key: number, id: string): void {
    let x = root;
    let y: string | null = null;
    const path: string[] = [];
    while (x !== null) {
      y = x;
      path.push(x);
      at(x).size++;
      stats.comparisons++;
      x = key < at(x).key ? at(x).left : at(x).right;
    }
    nodes.set(id, { id, key, size: 1, left: null, right: null, p: y });
    if (y === null) root = id;
    else if (key < at(y).key) at(y).left = id;
    else at(y).right = id;
    stats.writes++;

    if (path.length > 0) {
      emit(
        'OS-INSERT',
        3,
        snapshot(),
        { look: path, aux: chips(null, null) },
        `Walking down to ${key}'s place, every node on the path gains one: ${path.length} size${path.length === 1 ? '' : 's'} incremented, and nothing else touched.`,
      );
    }
    emit(
      'OS-INSERT',
      5,
      snapshot(),
      { move: id, aux: chips(null, null) },
      path.length === 0
        ? `${key} is the first node: size 1, and it is the whole tree.`
        : `${key} goes in as a leaf with size 1. The augmentation cost nothing — the walk was happening anyway.`,
    );
  }

  /** OS-SELECT(x, i) — the i-th smallest, one comparison per level. */
  function select(i: number): string | null {
    let x = root;
    let rank = i;
    while (x !== null) {
      const r = sizeOf(at(x).left) + 1;
      stats.comparisons++;
      if (rank === r) {
        emit(
          'OS-SELECT',
          3,
          snapshot(),
          { mark: x, scope: subtree(x), pointers: { x }, selected: at(x).key, aux: chips(i, r) },
          `r = ${r} = i, so x is the answer: ${at(x).key} is the ${i}${ordinal(i)} smallest key.`,
        );
        return x;
      }
      if (rank < r) {
        const next = at(x).left;
        emit(
          'OS-SELECT',
          5,
          snapshot(),
          {
            look: x,
            scope: subtree(x),
            pointers: { x },
            ...(next ? { edges: { [`${x}>${next}`]: 'look' as const } } : {}),
            aux: chips(rank, r),
          },
          `x has rank ${r} in its own subtree and i is ${rank}, so the answer is to the left — and i does not change.`,
        );
        x = next;
      } else {
        const next = at(x).right;
        emit(
          'OS-SELECT',
          6,
          snapshot(),
          {
            look: x,
            scope: subtree(x),
            pointers: { x },
            ...(next ? { edges: { [`${x}>${next}`]: 'look' as const } } : {}),
            aux: chips(rank, r),
          },
          `i is ${rank} and x has rank ${r}, so go right — and look for the ${rank - r}${ordinal(rank - r)} smallest there, not the ${rank}${ordinal(rank)}.`,
        );
        rank -= r;
        x = next;
      }
    }
    return null;
  }

  /** OS-RANK(T, x) — walk up, adding in every subtree that lies to the left. */
  function rank(id: string): number {
    let r = sizeOf(at(id).left) + 1;
    let y = id;
    emit(
      'OS-RANK',
      1,
      snapshot(),
      { mark: id, pointers: { x: id }, aux: chips(null, r) },
      `r = x.left.size + 1 = ${r}. Within its own subtree, ${at(id).key} is the ${r}${ordinal(r)} smallest.`,
    );

    while (y !== root) {
      const p = at(y).p!;
      stats.comparisons++;
      if (at(p).right === y) {
        r += sizeOf(at(p).left) + 1;
        stats.writes++;
        emit(
          'OS-RANK',
          5,
          snapshot(),
          {
            mark: id,
            look: [p, ...(at(p).left ? subtree(at(p).left) : [])],
            pointers: { y: p },
            aux: chips(null, r),
          },
          `y was a right child, so ${at(p).key} and its whole left subtree come before x: r = ${r}.`,
        );
      } else {
        emit(
          'OS-RANK',
          6,
          snapshot(),
          { mark: id, look: p, pointers: { y: p }, aux: chips(null, r) },
          `y was a left child, so everything up here is bigger than x. r is unchanged at ${r}.`,
        );
      }
      y = p;
    }

    emit(
      'OS-RANK',
      7,
      snapshot(),
      { mark: id, rank: r, ranked: at(id).key, aux: chips(null, r) },
      `Return r = ${r}. ${at(id).key} is the ${r}${ordinal(r)} smallest key in the whole tree.`,
    );
    return r;
  }

  input.forEach((key, i) => insert(key, `n${i + 1}`));
  if (root === null) return { steps, output: { n: 0 } };

  const n = nodes.size;
  const target = Math.max(1, Math.min(n, Math.ceil(n / 2)));
  const found = select(target);
  if (found) rank(found);

  return { steps, output: { n, selected: target } };
}

function ordinal(i: number): string {
  const rem = i % 100;
  if (rem >= 11 && rem <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][i % 10] ?? 'th';
}

/** Distinct keys, so a rank is unambiguous. */
function generate(n: number): number[] {
  const pool = Array.from({ length: 90 }, (_, i) => i + 10);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(1, Math.min(n, 12)));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one key.' };
  if (parts.length > 12) return { error: 'At most 12 keys — the badges need room.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    if (values.includes(v)) return { error: `${v} appears twice, so its rank would be ambiguous.` };
    values.push(v);
  }
  return { value: values };
}

export const orderStatisticTree: AlgorithmModule = {
  id: 'order-statistic-tree',
  name: 'Order-Statistic Tree',
  visualizer: 'tree',
  aux: [
    { key: 'os', label: 'os', hint: 'the rank being looked for, and the rank of x in its subtree' },
  ],
  procOrder: ['OS-INSERT', 'OS-SELECT', 'OS-RANK'],
  procedures: {
    // §17.1 describes maintaining `size` on insertion in prose rather than in
    // pseudocode — increment it at every node on the way down — so this block
    // is that description written out, in TREE-INSERT's shape.
    'OS-INSERT': {
      title: 'OS-INSERT(T, z)',
      indent: [0, 0, 1, 1, 0],
      lines: [
        'x = T.root',
        'while x ≠ T.nil',
        'x.size = x.size + 1',
        'x = z.key < x.key ? x.left : x.right',
        'insert z as TREE-INSERT does, with z.size = 1',
      ],
    },
    'OS-SELECT': {
      title: 'OS-SELECT(x, i)',
      indent: [0, 0, 1, 0, 1, 0],
      lines: [
        'r = x.left.size + 1',
        'if i == r',
        'return x',
        'elseif i < r',
        'return OS-SELECT(x.left, i)',
        'else return OS-SELECT(x.right, i − r)',
      ],
    },
    'OS-RANK': {
      title: 'OS-RANK(T, x)',
      indent: [0, 0, 0, 1, 2, 1, 0],
      lines: [
        'r = x.left.size + 1',
        'y = x',
        'while y ≠ T.root',
        'if y == y.p.right',
        'r = r + y.p.left.size + 1',
        'y = y.p',
        'return r',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(lg n)',
    worst: 'Θ(lg n)',
    space: 'Θ(n)',
    extra: [
      ['OS-SELECT', 'O(h) — one comparison per level, going down'],
      ['OS-RANK', 'O(h) — going up'],
      ['Extra storage', 'one integer per node'],
      ['Maintained on insert', 'increment along the path — free'],
      ['Maintained on rotation', 'Θ(1), which is what §17.2 requires'],
      ['On a red-black tree', 'h is O(lg n), so all of it is'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'tree',
    placeholder: '41, 38, 31, 12, 19, 8',
    note: 'distinct keys, inserted left to right',
    label: 'The keys to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 8,
  result: {
    // Two things have to be true: the augmentation is consistent everywhere,
    // and the two queries agree with the sorted order they are supposed to
    // describe — computed here by sorting, which the tree never does.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      if (input.length === 0) return null;
      let selected: number | null = null;
      let rank: number | null = null;
      let ranked: number | null = null;
      for (const step of trace.steps) {
        const hi = step.hi as { selected?: number; rank?: number; ranked?: number };
        if (typeof hi.selected === 'number') selected = hi.selected;
        if (typeof hi.rank === 'number') rank = hi.rank;
        if (typeof hi.ranked === 'number') ranked = hi.ranked;
      }

      const sorted = [...input].sort((a, b) => a - b);
      const target = Math.max(1, Math.min(sorted.length, Math.ceil(sorted.length / 2)));
      if (selected !== sorted[target - 1]) {
        return `OS-SELECT returned ${selected} for i = ${target}, but the ${target}th smallest is ${sorted[target - 1]}`;
      }
      if (ranked !== null && rank !== sorted.indexOf(ranked) + 1) {
        return `OS-RANK gave ${ranked} rank ${rank}, but it is number ${sorted.indexOf(ranked) + 1} in order`;
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';
      const byId = new Map(last.data.nodes.map((n) => [n.id, n]));
      let complaint: string | null = null;
      const check = (id: string | null): number => {
        if (!id) return 0;
        const node = byId.get(id);
        if (!node) {
          complaint ??= `the tree points at ${id}, which is in no node`;
          return 0;
        }
        const [l, r] = node.children ?? [null, null];
        const size = 1 + check(l ?? null) + check(r ?? null);
        if (Number(node.attrs?.size) !== size) {
          complaint ??= `node ${node.keys[0]} claims size ${node.attrs?.size} but has ${size} nodes under it`;
        }
        return size;
      };
      check(last.data.root);
      return complaint;
    },
  },
  record,
};
