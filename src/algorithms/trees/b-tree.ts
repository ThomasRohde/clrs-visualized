import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
} from '../types.ts';

/**
 * B-TREE — CLRS §18.1–18.2: B-TREE-INSERT, B-TREE-SPLIT-CHILD and
 * B-TREE-SEARCH, with minimum degree t = 2.
 *
 * Every tree so far has assumed that following a pointer is free. On a disk
 * it is not: a read is milliseconds where a comparison is nanoseconds, so the
 * only cost that matters is **how many nodes you have to touch**, and the way
 * to make that small is to give each node a great many keys. A B-tree node is
 * sized to a disk block; with a thousand keys in a node, a tree of a billion
 * keys is three levels deep.
 *
 * The shape rules, for minimum degree t:
 *
 *   - every node holds between t − 1 and 2t − 1 keys (the root may hold fewer);
 *   - a node with k keys has k + 1 children;
 *   - **every leaf is at the same depth**, which is what makes the height
 *     logarithmic without any rotations at all.
 *
 * Here t = 2, so a node holds 1 to 3 keys and the tree is what is usually
 * called a 2-3-4 tree. It is the smallest B-tree that still splits, which is
 * the operation worth watching.
 *
 * **Splitting is how a B-tree grows.** A full node cannot take another key, so
 * it is split in two around its median, and the median moves *up* into the
 * parent. Insertion splits every full node it meets on the way down — before
 * it needs to — so it never has to walk back up: the parent always has room
 * for a median because it was split on the way past if it was full. And when
 * the root itself splits, the tree gains a level from the top, which is why
 * every leaf stays at the same depth.
 */

/** Minimum degree. 2 is the smallest that splits: nodes hold 1‥3 keys. */
const T = 2;
const MAX_KEYS = 2 * T - 1;

interface Node {
  id: string;
  keys: number[];
  children: string[] | null;
}

export function record(input: number[]): Trace {
  const nodes = new Map<string, Node>();
  const at = (id: string): Node => nodes.get(id)!;
  let next = 1;
  const alloc = (keys: number[], children: string[] | null): string => {
    const id = `b${next++}`;
    nodes.set(id, { id, keys, children });
    return id;
  };
  let root = alloc([], null);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): TreeData {
    const live: string[] = [];
    const collect = (id: string): void => {
      live.push(id);
      for (const child of at(id).children ?? []) collect(child);
    };
    collect(root);
    return {
      kind: 'tree',
      root,
      nodes: live.map((id) => ({
        id,
        keys: at(id).keys.length ? [...at(id).keys] : ['·'],
        ...(at(id).children ? { children: [...at(id).children!] } : {}),
      })),
    };
  }

  const subtree = (id: string): string[] => [id, ...(at(id).children ?? []).flatMap(subtree)];
  const chips = (k: number | null, n: number | null) => ({
    b: auxOf([null, k, n], 1, [null, 'k', 'x.n']),
  });

  /**
   * B-TREE-SPLIT-CHILD(x, i) — the full child `y` becomes two nodes of t − 1
   * keys, and its median rises into `x`.
   */
  function splitChild(xId: string, i: number, key: number): void {
    const x = at(xId);
    const yId = x.children![i]!;
    const y = at(yId);
    const median = y.keys[T - 1]!;

    emit(
      'B-TREE-SPLIT-CHILD',
      1,
      snapshot(),
      {
        look: yId,
        mark: xId,
        pointers: { y: yId, x: xId },
        aux: chips(key, y.keys.length),
      },
      `y = [${y.keys.join(', ')}] is full, so split it before going any further. Its median ${median} will move up.`,
    );

    const zId = alloc(y.keys.slice(T), y.children ? y.children.slice(T) : null);
    y.keys = y.keys.slice(0, T - 1);
    if (y.children) y.children = y.children.slice(0, T);
    x.keys.splice(i, 0, median);
    x.children!.splice(i + 1, 0, zId);
    stats.writes += 3;

    emit(
      'B-TREE-SPLIT-CHILD',
      4,
      snapshot(),
      {
        move: [yId, zId, xId],
        pointers: { y: yId, z: zId },
        aux: chips(key, x.keys.length),
      },
      `${median} is now a key of the parent, with [${y.keys.join(', ')}] on its left and [${at(zId).keys.join(', ')}] on its right.`,
    );
  }

  /** B-TREE-INSERT-NONFULL(x, k) — walk down, splitting any full node met. */
  function insertNonFull(xId: string, key: number): void {
    let id = xId;

    for (;;) {
      const x = at(id);
      if (!x.children) {
        let i = x.keys.length;
        stats.comparisons += Math.max(1, i);
        while (i > 0 && key < x.keys[i - 1]!) i--;
        x.keys.splice(i, 0, key);
        stats.writes++;
        emit(
          'B-TREE-INSERT-NONFULL',
          5,
          snapshot(),
          { move: id, mark: id, aux: chips(key, x.keys.length) },
          `x is a leaf with room, so ${key} goes straight in: [${x.keys.join(', ')}].`,
        );
        return;
      }

      let i = x.keys.length;
      stats.comparisons += Math.max(1, i);
      while (i > 0 && key < x.keys[i - 1]!) i--;
      const childId = x.children[i]!;
      emit(
        'B-TREE-INSERT-NONFULL',
        9,
        snapshot(),
        {
          look: id,
          scope: subtree(childId),
          edges: { [`${id}>${childId}`]: 'look' },
          pointers: { x: id },
          aux: chips(key, x.keys.length),
        },
        `${key} belongs in child ${i + 1} of [${x.keys.join(', ')}] — one node read, and the whole rest of the tree ruled out.`,
      );

      if (at(childId).keys.length === MAX_KEYS) {
        stats.comparisons++;
        splitChild(id, i, key);
        // The median that came up may now be the one to go past.
        const after = at(id);
        let j = after.keys.length;
        while (j > 0 && key < after.keys[j - 1]!) j--;
        id = after.children![j]!;
        continue;
      }
      id = childId;
    }
  }

  function insert(key: number): void {
    const r = at(root);
    stats.comparisons++;
    if (r.keys.length === MAX_KEYS) {
      const oldRoot = root;
      root = alloc([], [oldRoot]);
      stats.writes++;
      emit(
        'B-TREE-INSERT',
        4,
        snapshot(),
        { move: root, look: oldRoot, pointers: { s: root, r: oldRoot }, aux: chips(key, 0) },
        `The root is full, so a new empty root is made above it. This is the only way a B-tree gets taller.`,
      );
      splitChild(root, 0, key);
    }
    insertNonFull(root, key);
  }

  /** B-TREE-SEARCH(x, k) — scan a node's keys, then descend through one child. */
  function search(key: number): void {
    let id = root;
    for (;;) {
      const x = at(id);
      let i = 0;
      stats.comparisons += x.keys.length;
      while (i < x.keys.length && key > x.keys[i]!) i++;

      if (i < x.keys.length && x.keys[i] === key) {
        emit(
          'B-TREE-SEARCH',
          5,
          snapshot(),
          {
            mark: id,
            pointers: { x: id },
            searchResult: { key, found: true },
            aux: chips(key, x.keys.length),
          },
          `${key} is key ${i + 1} of this node. The whole search read ${depthOf(id) + 1} node${depthOf(id) ? 's' : ''} — on a disk, that is the only number that matters.`,
        );
        return;
      }
      if (!x.children) {
        emit(
          'B-TREE-SEARCH',
          7,
          snapshot(),
          {
            look: id,
            pointers: { x: id },
            searchResult: { key, found: false },
            aux: chips(key, x.keys.length),
          },
          `This node is a leaf and ${key} is not in it, so it is nowhere in the tree.`,
        );
        return;
      }

      const childId = x.children[i]!;
      emit(
        'B-TREE-SEARCH',
        10,
        snapshot(),
        {
          look: id,
          scope: subtree(childId),
          edges: { [`${id}>${childId}`]: 'look' },
          pointers: { x: id },
          aux: chips(key, x.keys.length),
        },
        `${key} lies between this node's keys, so it can only be in child ${i + 1}. One more disk read.`,
      );
      id = childId;
    }
  }

  function depthOf(id: string): number {
    const walk = (from: string, d: number): number => {
      if (from === id) return d;
      for (const child of at(from).children ?? []) {
        const found = walk(child, d + 1);
        if (found >= 0) return found;
      }
      return -1;
    };
    return Math.max(0, walk(root, 0));
  }

  for (const key of input) insert(key);
  if (input.length > 0) search(input[Math.floor(input.length / 2)]!);

  return { steps, output: { inserted: input.length, nodes: nodes.size } };
}

/** Distinct keys — a B-tree holds a set, and a repeat has no slot of its own. */
function generate(n: number): number[] {
  const pool = Array.from({ length: 90 }, (_, i) => i + 10);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(1, Math.min(n, 14)));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one key.' };
  if (parts.length > 14) return { error: 'At most 14 keys — the nodes need room to be readable.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    if (values.includes(v))
      return { error: `${v} appears twice, and a B-tree holds a set of keys.` };
    values.push(v);
  }
  return { value: values };
}

export const bTree: AlgorithmModule = {
  id: 'b-tree',
  name: 'B-Tree (t = 2)',
  visualizer: 'tree',
  aux: [
    {
      key: 'b',
      label: 'b',
      hint: 'the key being inserted or sought, and how many keys the node holds',
    },
  ],
  procOrder: ['B-TREE-INSERT', 'B-TREE-INSERT-NONFULL', 'B-TREE-SPLIT-CHILD', 'B-TREE-SEARCH'],
  procedures: {
    'B-TREE-INSERT': {
      title: 'B-TREE-INSERT(T, k)',
      indent: [0, 0, 1, 1, 1, 1, 1, 1, 1, 0],
      lines: [
        'r = T.root',
        'if r.n == 2t − 1',
        's = ALLOCATE-NODE()',
        'T.root = s',
        's.leaf = FALSE',
        's.n = 0',
        's.c[1] = r',
        'B-TREE-SPLIT-CHILD(s, 1)',
        'B-TREE-INSERT-NONFULL(s, k)',
        'else B-TREE-INSERT-NONFULL(r, k)',
      ],
    },
    'B-TREE-INSERT-NONFULL': {
      title: 'B-TREE-INSERT-NONFULL(x, k)',
      indent: [0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
      lines: [
        'i = x.n',
        'if x.leaf',
        'while i ≥ 1 and k < x.key[i]',
        'x.key[i + 1] = x.key[i]',
        'i = i − 1',
        'x.key[i + 1] = k; x.n = x.n + 1',
        'else',
        'while i ≥ 1 and k < x.key[i]',
        'i = i − 1',
        'if x.c[i + 1].n == 2t − 1',
        'B-TREE-SPLIT-CHILD(x, i + 1)',
      ],
    },
    // The book's B-TREE-SPLIT-CHILD is seventeen lines, and thirteen of them
    // are the index shuffling that moves keys inside an array. Summarised here
    // to the four things that change on screen; §18.2 has the full version.
    'B-TREE-SPLIT-CHILD': {
      title: 'B-TREE-SPLIT-CHILD(x, i)',
      indent: [0, 0, 1, 1, 1],
      lines: [
        'y = x.c[i]  // the full child',
        'z = ALLOCATE-NODE()',
        "z takes y's largest t − 1 keys",
        'y.key[t] moves up into x',
        'z becomes the child of x just after y',
      ],
    },
    'B-TREE-SEARCH': {
      title: 'B-TREE-SEARCH(x, k)',
      indent: [0, 0, 1, 0, 1, 0, 1, 0, 1, 1],
      lines: [
        'i = 1',
        'while i ≤ x.n and k > x.key[i]',
        'i = i + 1',
        'if i ≤ x.n and k == x.key[i]',
        'return (x, i)',
        'elseif x.leaf',
        'return NIL',
        'else',
        'DISK-READ(x.c[i])',
        'return B-TREE-SEARCH(x.c[i], k)',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(log_t n)',
    worst: 'Θ(log_t n)',
    space: 'Θ(n)',
    extra: [
      ['Disk reads per operation', 'O(log_t n) — the height'],
      ['CPU per operation', 'O(t · log_t n)'],
      ['Keys per node', 't − 1 to 2t − 1'],
      ['This tree', 't = 2, so 1 to 3 keys — a 2-3-4 tree'],
      ['Height with t = 1000, n = 10⁹', '3'],
      ['How it grows', 'the root splits — never the leaves'],
    ],
  },
  input: {
    minSize: 6,
    maxSize: 14,
    noun: 'tree',
    placeholder: '10, 20, 30, 40, 50',
    note: 'distinct keys, inserted left to right',
    label: 'The keys to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 10,
  result: {
    // Every structural rule of §18.1 is checked on the tree the run leaves —
    // key counts, uniform leaf depth, sorted keys and the range each subtree
    // is allowed to hold — plus that the keys are the ones that went in.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      if (input.length === 0) return null;
      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';
      const byId = new Map(last.data.nodes.map((n) => [n.id, n]));
      const root = last.data.root;
      if (!root) return 'the tree has no root';

      const found: number[] = [];
      const depths = new Set<number>();
      let complaint: string | null = null;

      const walk = (id: string, depth: number, low: number, high: number): void => {
        const node = byId.get(id);
        if (!node) {
          complaint ??= `the tree points at ${id}, which is in no node`;
          return;
        }
        const keys = node.keys.map(Number);
        const kids = (node.children ?? []).filter((c): c is string => !!c);

        if (id !== root && (keys.length < T - 1 || keys.length > MAX_KEYS)) {
          complaint ??= `a node holds ${keys.length} keys, outside ${T - 1}‥${MAX_KEYS}`;
        }
        for (let i = 1; i < keys.length; i++) {
          if (keys[i - 1]! >= keys[i]!) complaint ??= `a node's keys are not in order: ${keys}`;
        }
        for (const k of keys) {
          if (k <= low || k >= high)
            complaint ??= `key ${k} is outside the range its subtree allows`;
          found.push(k);
        }
        if (kids.length === 0) {
          depths.add(depth);
          return;
        }
        if (kids.length !== keys.length + 1) {
          complaint ??= `a node has ${keys.length} keys but ${kids.length} children`;
          return;
        }
        kids.forEach((kid, i) => {
          walk(kid, depth + 1, i === 0 ? low : keys[i - 1]!, i === keys.length ? high : keys[i]!);
        });
      };
      walk(root, 0, -Infinity, Infinity);
      if (complaint) return complaint;

      // The property that replaces rotation: a B-tree stays balanced because
      // every leaf is at the same depth, and it grows from the root to keep it.
      if (depths.size > 1) {
        return `the leaves are at depths ${[...depths].join(', ')} — a B-tree keeps them all equal`;
      }
      const sorted = [...input].sort((a, b) => a - b);
      if (JSON.stringify(found.sort((a, b) => a - b)) !== JSON.stringify(sorted)) {
        return `the tree holds ${JSON.stringify(found)}, expected ${JSON.stringify(sorted)}`;
      }
      return null;
    },
  },
  record,
};
