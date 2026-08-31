import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
  type TreeNode,
} from '../types.ts';

/**
 * HUFFMAN CODES — CLRS §15.3: HUFFMAN(C), a greedy algorithm that builds an
 * optimal prefix-free code.
 *
 * A **fixed-length** code gives every character the same number of bits. A
 * **variable-length** code gives the common ones short codewords and the rare
 * ones long ones, and can beat fixed-length by 20–90% on real text. The catch
 * is that a decoder has to know where each codeword ends — which is what
 * **prefix-free** buys: no codeword is a prefix of another, so the moment you
 * have read one, it is unambiguous.
 *
 * A prefix-free code *is* a binary tree. Characters sit at the leaves, and a
 * character's codeword is the path down to it — 0 for left, 1 for right. No
 * leaf is on the path to another leaf, so no codeword prefixes another, for
 * free. The cost of the code is Σ freq(c) × depth(c), and an optimal code is
 * a **full** tree: every internal node has two children, because a node with
 * one child could be spliced out and every leaf below it made a bit cheaper.
 *
 * The greedy rule: **merge the two least frequent trees.** Repeat n − 1 times
 * and what is left is the code tree. The two rarest characters end up
 * deepest, which is where a good code wants them, and §15.3's exchange
 * argument shows no other tree can do better.
 *
 * On screen the queue is the forest itself, kept in frequency order, so
 * `EXTRACT-MIN` is always "take the two on the left" and the merge is a new
 * node appearing above them. Each leaf carries its character as a badge —
 * data, not a role, so it never competes with what the algorithm is doing.
 */

interface Node {
  id: string;
  freq: number;
  ch?: string;
  left?: string;
  right?: string;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function record(input: number[]): Trace {
  const nodes = new Map<string, Node>();
  const at = (id: string): Node => nodes.get(id)!;
  /** The priority queue, held as the roots of the forest on screen. */
  let queue: string[] = [];

  input.forEach((freq, i) => {
    const id = `c${i + 1}`;
    nodes.set(id, { id, freq: Math.max(1, Math.round(freq)), ch: LETTERS[i] ?? '?' });
    queue.push(id);
  });

  const { steps, stats, emit } = createRecorder();
  /** Q in frequency order, which is what makes EXTRACT-MIN the leftmost tree. */
  const order = (): void => {
    queue = [...queue].sort((a, b) => at(a).freq - at(b).freq || a.localeCompare(b));
  };
  order();

  function nodeOf(id: string): TreeNode {
    const node = at(id);
    const kids = node.left && node.right ? [node.left, node.right] : undefined;
    return {
      id,
      keys: [node.freq],
      ...(kids ? { children: kids } : {}),
      ...(node.ch ? { attrs: { ch: node.ch } } : {}),
    };
  }

  /** The whole forest: every tree still in the queue, side by side. */
  function snapshot(): TreeData {
    const all: TreeNode[] = [];
    const collect = (id: string): void => {
      all.push(nodeOf(id));
      const node = at(id);
      if (node.left) collect(node.left);
      if (node.right) collect(node.right);
    };
    for (const id of queue) collect(id);
    return { kind: 'tree', root: queue[0] ?? null, nodes: all, roots: queue.slice(1) };
  }

  const chips = (x: number | null, y: number | null, z: number | null) => ({
    merge: auxOf([null, x, y, z], 3, [null, 'x.freq', 'y.freq', 'z.freq']),
  });
  /** Every node of a tree, so the hull can cover the pair being merged. */
  const treeOf = (id: string): string[] => {
    const node = at(id);
    return [id, ...(node.left ? treeOf(node.left) : []), ...(node.right ? treeOf(node.right) : [])];
  };

  const n = queue.length;
  if (n === 0) {
    emit('HUFFMAN', 1, { kind: 'tree', root: null, nodes: [] }, {}, `No characters to encode.`);
    return { steps, output: { characters: 0, cost: 0 } };
  }

  emit(
    'HUFFMAN',
    2,
    snapshot(),
    { aux: chips(null, null, null) },
    `Q holds all ${n} characters as one-node trees, the least frequent on the left.`,
  );

  for (let i = 1; i < n; i++) {
    const x = queue[0]!;
    const y = queue[1]!;
    stats.comparisons += 2;
    emit(
      'HUFFMAN',
      5,
      snapshot(),
      {
        scope: [...treeOf(x), ...treeOf(y)],
        scopeLabel: 'the two smallest',
        look: [x, y],
        aux: chips(at(x).freq, at(y).freq, null),
      },
      `x and y are the two least frequent trees in Q — ${at(x).freq} and ${at(y).freq}. Nothing else is looked at.`,
    );

    const id = `z${i}`;
    const freq = at(x).freq + at(y).freq;
    nodes.set(id, { id, freq, left: x, right: y });
    queue = queue.slice(2);
    queue.push(id);
    order();
    stats.writes++;
    emit(
      'HUFFMAN',
      7,
      snapshot(),
      {
        move: id,
        look: [x, y],
        scope: treeOf(id),
        scopeLabel: `${freq}`,
        aux: chips(at(x).freq, at(y).freq, freq),
      },
      `A new node of frequency ${freq} takes both as children. Every character under it just got one bit longer.`,
    );
  }

  const root = queue[0]!;
  /** Σ freq × depth — the number of bits the code costs on this text. */
  const cost = (id: string, depth: number): number => {
    const node = at(id);
    if (!node.left || !node.right) return node.freq * depth;
    return cost(node.left, depth + 1) + cost(node.right, depth + 1);
  };
  const bits = n === 1 ? at(root).freq : cost(root, 0);

  emit(
    'HUFFMAN',
    9,
    snapshot(),
    { done: treeOf(root), codeCost: bits, aux: chips(null, null, at(root).freq) },
    `One tree left, so return its root. The code costs ${bits} bits — read each character's codeword off the path to it.`,
  );

  return { steps, output: { characters: n, cost: bits, total: at(root).freq } };
}

/**
 * Frequencies with a real spread, because a code is only interesting when the
 * characters are not equally common — and no two the same at the top, so the
 * queue order the reader sees is the order the algorithm used.
 */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 9));
  const pool = Array.from({ length: 40 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one frequency.' };
  if (parts.length > 9) return { error: 'At most 9 characters — the forest has to fit on screen.' };

  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 1 || v > 99) {
      return { error: `"${part}" is not a frequency between 1 and 99.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const huffman: AlgorithmModule = {
  id: 'huffman',
  name: 'Huffman Codes',
  visualizer: 'tree',
  aux: [
    {
      key: 'merge',
      label: 'freq',
      hint: 'the two trees being merged, and the node that replaces them',
    },
  ],
  procOrder: ['HUFFMAN'],
  procedures: {
    HUFFMAN: {
      title: 'HUFFMAN(C)',
      indent: [0, 0, 0, 1, 1, 1, 1, 1, 0],
      lines: [
        'n = |C|',
        'Q = C',
        'for i = 1 to n − 1',
        'allocate a new node z',
        'z.left = x = EXTRACT-MIN(Q)',
        'z.right = y = EXTRACT-MIN(Q)',
        'z.freq = x.freq + y.freq',
        'INSERT(Q, z)',
        'return EXTRACT-MIN(Q)',
      ],
    },
  },
  complexity: {
    best: 'Θ(n lg n)',
    average: 'Θ(n lg n)',
    worst: 'Θ(n lg n)',
    space: 'Θ(n)',
    extra: [
      ['Where the lg n comes from', 'the priority queue of chapter 6'],
      ['Merges', 'exactly n − 1'],
      ['Code cost', 'Σ freq(c) × depth(c)'],
      ['Identity', 'that cost is the sum of the internal frequencies'],
      ['Why greedy works', 'the two rarest characters can be deepest'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 9,
    noun: 'alphabet',
    placeholder: '45, 13, 12, 16, 9, 5',
    note: 'a frequency per character, a b c …',
    label: 'The character frequencies, separated by commas',
    generate,
    parse,
  },
  defaultSize: 6,
  result: {
    // Optimality cannot be checked by re-running the same greedy rule, so the
    // checks here are the properties an optimal prefix code must have — plus
    // the identity that pins the cost independently of how it was computed.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      if (input.length === 0) return null;
      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';
      if ((last.data.roots ?? []).length > 0) return 'the queue still holds more than one tree';
      const byId = new Map(last.data.nodes.map((n) => [n.id, n]));
      const root = last.data.root;
      if (!root) return 'no code tree was built';

      const leaves: number[] = [];
      let internal = 0;
      let complaint: string | null = null;
      let cost = 0;
      const walk = (id: string, depth: number): void => {
        const node = byId.get(id);
        if (!node) {
          complaint ??= `the tree points at ${id}, which is in no node`;
          return;
        }
        const kids = (node.children ?? []).filter((c): c is string => !!c);
        if (kids.length === 0) {
          leaves.push(node.keys[0] as number);
          cost += (node.keys[0] as number) * depth;
          return;
        }
        // An optimal prefix code is a full binary tree: a node with one child
        // wastes a bit on everything below it.
        if (kids.length !== 2) complaint ??= `an internal node has ${kids.length} children`;
        internal += node.keys[0] as number;
        for (const kid of kids) walk(kid, depth + 1);
      };
      walk(root, 0);
      if (complaint) return complaint;

      const expected = [...input].map((f) => Math.max(1, Math.round(f))).sort((a, b) => a - b);
      if (JSON.stringify([...leaves].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
        return `the leaves are ${JSON.stringify(leaves)}, expected the input frequencies`;
      }
      if (input.length > 1 && cost !== internal) {
        return `the code costs ${cost} bits but the internal frequencies sum to ${internal} — those are the same number in any correct Huffman tree`;
      }

      // Necessary for optimality: a more frequent character must never sit
      // deeper than a rarer one, or swapping the two would cost less.
      const depths = new Map<number, number>();
      const measure = (id: string, depth: number): void => {
        const node = byId.get(id)!;
        const kids = (node.children ?? []).filter((c): c is string => !!c);
        if (kids.length === 0) {
          depths.set(node.keys[0] as number, depth);
          return;
        }
        for (const kid of kids) measure(kid, depth + 1);
      };
      measure(root, 0);
      for (const [f1, d1] of depths) {
        for (const [f2, d2] of depths) {
          if (f1 > f2 && d1 > d2) {
            return `${f1} sits deeper than ${f2}, so swapping them would give a cheaper code`;
          }
        }
      }
      return null;
    },
  },
  record,
};
