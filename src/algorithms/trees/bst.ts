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
 * BINARY SEARCH TREE — CLRS §12.1–12.3: TREE-INSERT, TREE-SEARCH,
 * TREE-MINIMUM, TREE-DELETE and TRANSPLANT.
 *
 * The structure chapter 11 could not be. A hash table answers "is k here" in
 * O(1) and cannot answer anything else; a search tree gives up that constant
 * and gets back every question about *order* — the minimum, the successor,
 * everything between two keys, and the whole set in sorted order — at a cost
 * proportional to the height.
 *
 * All of it rests on one property, which the drawing makes literal: **the
 * keys of a node's left subtree are all smaller than it, and the right
 * subtree's are all larger.** Because the renderer lays nodes out by leaf
 * column, that means the tree read left to right *is* the sorted order, and
 * an inorder walk is nothing more than reading the picture.
 *
 * The run is a script:
 *
 *   1. Insert every key, each one walking down from the root to a leaf.
 *   2. TREE-SEARCH for a key that is in the tree — the same walk, deciding.
 *   3. TREE-MINIMUM, which is the walk that never turns right.
 *   4. TREE-DELETE of a node with two children: the case that needs the
 *      successor, and the reason TRANSPLANT exists.
 *
 * The height is what every one of those costs, and it is decided entirely by
 * the order the keys arrived in. Insert them sorted and this tree is a linked
 * list — which is chapter 13's problem, not this one's.
 */

interface Node {
  id: string;
  key: number;
  left: string | null;
  right: string | null;
  p: string | null;
}

export function record(input: number[]): Trace {
  const nodes = new Map<string, Node>();
  let root: string | null = null;
  const at = (id: string): Node => nodes.get(id)!;

  const { steps, stats, emit } = createRecorder();

  /**
   * The tree as the renderer draws it.
   *
   * A NIL child is declared only when its sibling exists: that is the case
   * where the drawing would otherwise be ambiguous about which way the node
   * leans. A leaf declares no children at all, so a plain search tree is not
   * covered in the NIL squares a red-black tree needs.
   */
  function snapshot(): TreeData {
    const out: TreeNode[] = [];
    for (const node of nodes.values()) {
      const kids: Array<string | null> | undefined =
        node.left === null && node.right === null ? undefined : [node.left, node.right];
      out.push({ id: node.id, keys: [node.key], ...(kids ? { children: kids } : {}) });
    }
    return { kind: 'tree', root, nodes: out };
  }

  /** Every id in the subtree rooted at `id` — what the scope hull spans. */
  function subtree(id: string | null): string[] {
    if (!id || !nodes.has(id)) return [];
    const node = at(id);
    return [id, ...subtree(node.left), ...subtree(node.right)];
  }

  /** The keys in order, which for a search tree is the inorder walk. */
  function inorder(id: string | null): number[] {
    if (!id || !nodes.has(id)) return [];
    const node = at(id);
    return [...inorder(node.left), node.key, ...inorder(node.right)];
  }

  const keyChip = (k: number, label = 'z.key') => ({ z: auxOf([null, k], 1, [null, label]) });

  /** TREE-INSERT(T, z) — walk to a leaf, then hang the new node off it. */
  function insert(key: number, id: string): void {
    const z: Node = { id, key, left: null, right: null, p: null };
    let x: string | null = root;
    let y: string | null = null;

    emit(
      'TREE-INSERT',
      1,
      snapshot(),
      {
        ...(x ? { scope: subtree(x), look: x, pointers: { x } } : {}),
        aux: keyChip(key),
      },
      x === null
        ? `TREE-INSERT(T, ${key}). The tree is empty, so the walk is over before it starts.`
        : `TREE-INSERT(T, ${key}). x = T.root, and everything below it is still in play.`,
    );

    while (x !== null) {
      y = x;
      const node = at(x);
      stats.comparisons++;
      const goLeft = key < node.key;
      const next: string | null = goLeft ? node.left : node.right;
      emit(
        'TREE-INSERT',
        5,
        snapshot(),
        {
          scope: subtree(x),
          look: x,
          pointers: { x, y },
          ...(next ? { edges: { [`${x}>${next}`]: 'look' as const } } : {}),
          aux: keyChip(key),
        },
        goLeft
          ? `${key} < ${node.key}, so it belongs in ${node.key}'s left subtree — the right half is out.`
          : `${key} > ${node.key}, so it belongs in ${node.key}'s right subtree — the left half is out.`,
      );

      x = next;
      emit(
        'TREE-INSERT',
        goLeft ? 6 : 7,
        snapshot(),
        {
          ...(x ? { scope: subtree(x), look: x } : {}),
          pointers: { ...(x ? { x } : {}), y },
          aux: keyChip(key),
        },
        x === null
          ? `x = NIL: the walk has fallen off the bottom of the tree. y = ${at(y).key} is where the new node goes.`
          : `x = ${at(x).key}. One comparison has ruled out everything on the other side of ${at(y).key}.`,
      );
    }

    // Link it in. This is the only write an insertion does: the tree above it
    // is untouched, which is why an insert costs the walk and nothing more.
    z.p = y;
    nodes.set(id, z);
    stats.writes++;
    if (y === null) {
      root = id;
      emit(
        'TREE-INSERT',
        10,
        snapshot(),
        { move: id, pointers: { z: id }, aux: keyChip(key) },
        `T.root = ${key}. The tree had no root, so the new node is it.`,
      );
      return;
    }
    const parent = at(y);
    const left = key < parent.key;
    if (left) parent.left = id;
    else parent.right = id;
    emit(
      'TREE-INSERT',
      left ? 12 : 13,
      snapshot(),
      {
        move: id,
        look: y,
        edges: { [`${y}>${id}`]: 'move' as const },
        pointers: { z: id, y },
        aux: keyChip(key),
      },
      `${parent.key}.${left ? 'left' : 'right'} = ${key}. One pointer written, and nothing else in the tree moved.`,
    );
  }

  /** TREE-SEARCH(x, k) — the same walk, but deciding rather than descending to a leaf. */
  function search(key: number): string | null {
    let x: string | null = root;
    for (;;) {
      stats.comparisons++;
      if (x === null) {
        emit(
          'TREE-SEARCH',
          2,
          snapshot(),
          { searchResult: { key, found: false }, aux: keyChip(key, 'k') },
          `x is NIL: ${key} is not in the tree, and the walk that proved it was one root-to-leaf path.`,
        );
        return null;
      }
      const node = at(x);
      if (node.key === key) {
        emit(
          'TREE-SEARCH',
          2,
          snapshot(),
          {
            scope: subtree(x),
            mark: x,
            pointers: { x },
            searchResult: { key, found: true },
            aux: keyChip(key, 'k'),
          },
          `k == x.key, so return x. Found ${key} after touching one node per level.`,
        );
        return x;
      }

      const goLeft = key < node.key;
      const next = goLeft ? node.left : node.right;
      emit(
        'TREE-SEARCH',
        goLeft ? 3 : 5,
        snapshot(),
        {
          scope: subtree(x),
          look: x,
          pointers: { x },
          ...(next ? { edges: { [`${x}>${next}`]: 'look' as const } } : {}),
          aux: keyChip(key, 'k'),
        },
        goLeft
          ? `${key} < ${node.key}: everything to the right of ${node.key} is too big, so half the subtree is gone.`
          : `${key} > ${node.key}: everything to the left of ${node.key} is too small, so half the subtree is gone.`,
      );
      x = next;
    }
  }

  /** TREE-MINIMUM(x) — the walk that never turns right. */
  function minimum(from: string, note: string, report = false): string {
    let x = from;
    emit(
      'TREE-MINIMUM',
      1,
      snapshot(),
      { scope: subtree(x), look: x, pointers: { x }, aux: keyChip(at(x).key, 'x.key') },
      note,
    );
    while (at(x).left !== null) {
      stats.comparisons++;
      const next = at(x).left!;
      emit(
        'TREE-MINIMUM',
        2,
        snapshot(),
        {
          scope: subtree(x),
          look: next,
          pointers: { x: next },
          edges: { [`${x}>${next}`]: 'look' as const },
          aux: keyChip(at(next).key, 'x.key'),
        },
        `x.left is not NIL, so go left. Nothing to the right of ${at(x).key} can be smaller.`,
      );
      x = next;
    }
    emit(
      'TREE-MINIMUM',
      3,
      snapshot(),
      {
        mark: x,
        pointers: { x },
        // Only the standalone call answers "what is the smallest key in the
        // tree"; the one inside TREE-DELETE is asking about a subtree, and a
        // check that could not tell them apart would be checking the wrong one.
        ...(report ? { minimum: at(x).key } : {}),
        aux: keyChip(at(x).key, 'x.key'),
      },
      `x.left is NIL, so return x. ${at(x).key} is the smallest key in this subtree — the leftmost node in the picture.`,
    );
    return x;
  }

  /** TRANSPLANT(T, u, v) — put the subtree rooted at v where u's was. */
  function transplant(u: string, v: string | null, note: string): void {
    const node = at(u);
    stats.writes++;
    // The highlighted line is the branch actually taken, not the call site:
    // which of the three assignments runs is the whole content of TRANSPLANT.
    let line = 5;
    if (node.p === null) {
      root = v;
      line = 2;
    } else if (at(node.p).left === u) {
      at(node.p).left = v;
      line = 4;
    } else {
      at(node.p).right = v;
    }
    if (v) at(v).p = node.p;

    emit(
      'TRANSPLANT',
      line,
      snapshot(),
      {
        ...(v ? { move: v } : {}),
        ...(node.p ? { look: node.p } : {}),
        pointers: { ...(v ? { v } : {}), u },
        aux: keyChip(node.key, 'u.key'),
      },
      note,
    );
  }

  /** TREE-DELETE(T, z) — the two-child case is the one that needs a successor. */
  function remove(id: string): void {
    const z = at(id);
    const key = z.key;

    stats.comparisons++;
    emit(
      'TREE-DELETE',
      1,
      snapshot(),
      { mark: id, pointers: { z: id }, aux: keyChip(key, 'z.key') },
      z.left === null
        ? `TREE-DELETE(T, ${key}). Its left child is NIL, so its right subtree can simply move up.`
        : z.right === null
          ? `TREE-DELETE(T, ${key}). Its right child is NIL, so its left subtree can simply move up.`
          : `TREE-DELETE(T, ${key}). It has two children, and neither can be promoted over the other.`,
    );

    if (z.left === null) {
      transplant(
        id,
        z.right,
        `${key} is replaced by its right child. One pointer, and it is gone.`,
      );
    } else if (z.right === null) {
      transplant(id, z.left, `${key} is replaced by its left child. One pointer, and it is gone.`);
    } else {
      const y = minimum(
        z.right,
        `Line 5: y = TREE-MINIMUM(z.right). The key that has to replace ${key} is the smallest one bigger than it.`,
      );
      const yNode = at(y);
      stats.comparisons++;
      if (yNode.p !== id) {
        emit(
          'TREE-DELETE',
          6,
          snapshot(),
          { mark: id, look: y, pointers: { z: id, y }, aux: keyChip(key, 'z.key') },
          `y is not z's own right child, so it has to be lifted out of the subtree first.`,
        );
        transplant(y, yNode.right, `y's right subtree takes y's place. y itself is now free.`);
        yNode.right = z.right;
        at(z.right).p = y;
        stats.writes++;
        emit(
          'TREE-DELETE',
          8,
          snapshot(),
          { move: y, look: z.right, pointers: { y, z: id }, aux: keyChip(key, 'z.key') },
          `y.right = z.right. y adopts the whole right subtree it came out of.`,
        );
      }
      transplant(
        id,
        y,
        `y takes z's place in the tree. ${key} is no longer reachable from the root.`,
      );
      yNode.left = z.left;
      at(z.left).p = y;
      stats.writes++;
      emit(
        'TREE-DELETE',
        11,
        snapshot(),
        { move: y, look: z.left, pointers: { y }, aux: keyChip(key, 'z.key') },
        `y.left = z.left. y has both of z's subtrees now, and the order property still holds.`,
      );
    }

    nodes.delete(id);
    emit(
      'TREE-DELETE',
      12,
      snapshot(),
      { deleted: key, aux: keyChip(key, 'z.key') },
      `${key} is out of the tree. Read the keys left to right and they are still in order.`,
    );
  }

  // ---- the script -------------------------------------------------------
  input.forEach((key, i) => insert(key, `n${i + 1}`));
  if (root === null) {
    return { steps, output: { inserted: 0, height: 0 } };
  }

  // Search for a key that is in the tree, then find the smallest, then delete
  // a node with two children if the tree has one — that is the case worth
  // watching, and the one the other two are special cases of.
  const target = input[Math.floor(input.length / 2)]!;
  search(target);
  minimum(root, `TREE-MINIMUM(T.root): start at the root and keep turning left.`, true);

  const twoKids = [...nodes.values()].find((n) => n.left !== null && n.right !== null);
  const doomed = twoKids ?? at(root);
  remove(doomed.id);

  const order = inorder(root);
  return {
    steps,
    output: { inserted: input.length, deleted: doomed.key, remaining: order.length },
  };
}

/** Distinct keys: a search tree with a repeated key is ambiguous about which way to walk. */
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
  if (parts.length > 12) return { error: 'At most 12 keys — a deeper tree stops being readable.' };

  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    if (values.includes(v)) {
      return { error: `${v} appears twice, and a search tree cannot say which way to walk to it.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const bst: AlgorithmModule = {
  id: 'bst',
  name: 'Binary Search Tree',
  visualizer: 'tree',
  aux: [{ key: 'z', label: 'key', hint: 'the key the current operation names' }],
  procOrder: ['TREE-INSERT', 'TREE-SEARCH', 'TREE-MINIMUM', 'TREE-DELETE', 'TRANSPLANT'],
  procedures: {
    'TREE-INSERT': {
      title: 'TREE-INSERT(T, z)',
      indent: [0, 0, 0, 1, 1, 2, 1, 0, 0, 1, 0, 1, 1],
      lines: [
        'x = T.root',
        'y = NIL',
        'while x ≠ NIL',
        'y = x',
        'if z.key < x.key',
        'x = x.left',
        'else x = x.right',
        'z.p = y',
        'if y == NIL',
        'T.root = z',
        'elseif z.key < y.key',
        'y.left = z',
        'else y.right = z',
      ],
    },
    'TREE-SEARCH': {
      title: 'TREE-SEARCH(x, k)',
      indent: [0, 1, 0, 1, 0],
      lines: [
        'if x == NIL or k == x.key',
        'return x',
        'if k < x.key',
        'return TREE-SEARCH(x.left, k)',
        'else return TREE-SEARCH(x.right, k)',
      ],
    },
    'TREE-MINIMUM': {
      title: 'TREE-MINIMUM(x)',
      indent: [0, 1, 0],
      lines: ['while x.left ≠ NIL', 'x = x.left', 'return x'],
    },
    'TREE-DELETE': {
      title: 'TREE-DELETE(T, z)',
      indent: [0, 1, 0, 1, 0, 1, 2, 2, 2, 1, 1, 1],
      lines: [
        'if z.left == NIL',
        'TRANSPLANT(T, z, z.right)',
        'elseif z.right == NIL',
        'TRANSPLANT(T, z, z.left)',
        'else y = TREE-MINIMUM(z.right)',
        'if y ≠ z.right',
        'TRANSPLANT(T, y, y.right)',
        'y.right = z.right',
        'y.right.p = y',
        'TRANSPLANT(T, z, y)',
        'y.left = z.left',
        'y.left.p = y',
      ],
    },
    TRANSPLANT: {
      title: 'TRANSPLANT(T, u, v)',
      indent: [0, 1, 0, 1, 0, 0, 1],
      lines: [
        'if u.p == NIL',
        'T.root = v',
        'elseif u == u.p.left',
        'u.p.left = v',
        'else u.p.right = v',
        'if v ≠ NIL',
        'v.p = u.p',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(lg n)',
    worst: 'Θ(n)',
    space: 'Θ(n)',
    extra: [
      ['Every operation', 'O(h) for a tree of height h'],
      ['Height, random order', 'O(lg n) expected'],
      ['Height, sorted input', 'n − 1 — a linked list'],
      ['What it buys over a hash table', 'minimum, successor, sorted order'],
      ['Inorder walk', 'Θ(n) — read the picture left to right'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'tree',
    placeholder: '50, 30, 70, 20, 40',
    note: 'distinct keys, inserted left to right',
    label: 'The keys to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 9,
  result: {
    // No array anywhere. The claims are the chapter's: the walk answered
    // correctly, the minimum really is the minimum, and the tree that comes
    // out of a deletion is still a search tree over the right set of keys.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const searches: Array<{ key: number; found: boolean }> = [];
      let minimum: number | null = null;
      let deleted: number | null = null;
      for (const step of trace.steps) {
        const hi = step.hi as {
          searchResult?: { key: number; found: boolean };
          minimum?: number;
          deleted?: number;
        };
        if (hi.searchResult) searches.push(hi.searchResult);
        if (typeof hi.minimum === 'number') minimum = hi.minimum;
        if (typeof hi.deleted === 'number') deleted = hi.deleted;
      }

      if (searches.length !== 1 || !searches[0]!.found) {
        return `TREE-SEARCH did not find ${input[Math.floor(input.length / 2)]}, which was inserted`;
      }
      if (minimum !== Math.min(...input)) {
        return `TREE-MINIMUM returned ${minimum}, but the smallest key inserted was ${Math.min(...input)}`;
      }
      if (deleted === null) return 'nothing was deleted';

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';
      const byId = new Map(last.data.nodes.map((n) => [n.id, n]));
      const keys: number[] = [];
      const walk = (id: string | null): string | null => {
        if (!id) return null;
        const node = byId.get(id);
        if (!node) return `the tree points at ${id}, which is in no node`;
        const [l, r] = node.children ?? [null, null];
        const left = walk(l ?? null);
        if (left) return left;
        keys.push(node.keys[0] as number);
        return walk(r ?? null);
      };
      const complaint = walk(last.data.root);
      if (complaint) return complaint;

      const expected = input.filter((k) => k !== deleted).sort((a, b) => a - b);
      // An inorder walk of a search tree is sorted — so this one assertion is
      // both "the right keys are in there" and "it is still a search tree".
      if (JSON.stringify(keys) !== JSON.stringify(expected)) {
        return `an inorder walk gives ${JSON.stringify(keys)}, expected ${JSON.stringify(expected)}`;
      }
      return null;
    },
  },
  record,
};
