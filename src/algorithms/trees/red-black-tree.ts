import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
} from '../types.ts';

/**
 * RED-BLACK TREE — CLRS §13.1–13.3: RB-INSERT, RB-INSERT-FIXUP and the
 * rotations they run on.
 *
 * Chapter 12 left a structure whose cost depends on the order its keys
 * arrived in: insert them sorted and the search tree is a linked list. A
 * red-black tree fixes that for a constant amount of extra work per insertion
 * and one extra bit per node, and the bit is the whole mechanism.
 *
 * Five properties hold at all times:
 *
 *   1. every node is red or black;
 *   2. the root is black;
 *   3. every NIL is black;
 *   4. a red node's children are both black — so no two reds in a row;
 *   5. every path from a node down to a NIL passes the same number of blacks.
 *
 * Four and five together are what bound the height: the longest root-to-leaf
 * path can be at most twice the shortest, because the blacks are equal in
 * number and the reds cannot be adjacent. So **h ≤ 2 lg(n + 1)** whatever
 * order the keys come in — which `verify` checks, along with the five
 * properties themselves, on every input the site generates.
 *
 * A new node is inserted red, because red is the colour that breaks the least:
 * it cannot disturb property 5, only property 4, and then only against its own
 * parent. `RB-INSERT-FIXUP` repairs that one violation and it has exactly
 * three cases, distinguished by **the uncle** — the parent's sibling:
 *
 * - **Case 1, red uncle:** recolour the parent and uncle black and the
 *   grandparent red. The violation moves two levels up and nothing rotates.
 * - **Case 2, black uncle, z on the inside:** one rotation turns it into
 *   case 3.
 * - **Case 3, black uncle, z on the outside:** recolour and rotate once, and
 *   the tree is fixed for good.
 *
 * On screen the colour is a **badge**, not a fill: the fill is what the
 * algorithm is doing to a node this step, and a node can perfectly well be red
 * *and* the one being rotated. A black node's badge is filled and a red one's
 * is hollow, so "two reds in a row" — the thing the fixup is looking for — is
 * a pattern in shape rather than in hue. See E6 in docs/PROGRESS.md.
 */

type Colour = 'RED' | 'BLACK';

interface Node {
  id: string;
  key: number;
  colour: Colour;
  left: string | null;
  right: string | null;
  p: string | null;
}

export function record(input: number[]): Trace {
  const nodes = new Map<string, Node>();
  let root: string | null = null;
  const at = (id: string): Node => nodes.get(id)!;
  /** NIL is black, and that is property 3 rather than a special case. */
  const colourOf = (id: string | null): Colour => (id ? at(id).colour : 'BLACK');

  const { steps, stats, emit } = createRecorder();

  /**
   * Every node declares both children, `null` included, so every NIL is drawn.
   * A red-black tree is the one structure where the empty children are not
   * noise: property 5 counts blacks *through* them, and a reader asked to
   * count black heights needs to see what is being counted.
   */
  function snapshot(): TreeData {
    return {
      kind: 'tree',
      root,
      nodes: [...nodes.values()].map((n) => ({
        id: n.id,
        keys: [n.key],
        children: [n.left, n.right],
        attrs: { colour: n.colour },
      })),
    };
  }

  const keyChip = (k: number, label = 'z.key') => ({ z: auxOf([null, k], 1, [null, label]) });
  /** The four nodes a fixup case is about: z, its parent, grandparent and uncle. */
  const family = (z: string): string[] => {
    const out = [z];
    const p = at(z).p;
    if (!p) return out;
    out.push(p);
    const g = at(p).p;
    if (!g) return out;
    out.push(g);
    const uncle = at(g).left === p ? at(g).right : at(g).left;
    if (uncle) out.push(uncle);
    return out;
  };

  // ---- rotations --------------------------------------------------------

  /**
   * LEFT-ROTATE(T, x) — x goes down-left and its right child comes up.
   *
   * Emitted at the three lines that change the picture: the child that
   * changes hands, and the two assignments that swap the pair over. The rest
   * of the procedure is parent bookkeeping that the drawing shows implicitly.
   */
  function leftRotate(x: string): void {
    const node = at(x);
    const y = node.right!;
    const yNode = at(y);

    emit(
      'LEFT-ROTATE',
      1,
      snapshot(),
      {
        mark: x,
        look: y,
        edges: { [`${x}>${y}`]: 'look' },
        pointers: { x, y },
        aux: keyChip(node.key, 'x.key'),
      },
      `LEFT-ROTATE(T, ${node.key}). y = x.right = ${yNode.key}: the node that is about to come up.`,
    );

    node.right = yNode.left;
    if (yNode.left) at(yNode.left).p = x;
    stats.writes++;
    emit(
      'LEFT-ROTATE',
      2,
      snapshot(),
      {
        mark: x,
        look: y,
        ...(node.right ? { move: node.right } : {}),
        pointers: { x, y },
        aux: keyChip(node.key, 'x.key'),
      },
      node.right
        ? `x.right = y.left. That subtree lies between x and y in order, so it is at home under either of them.`
        : `x.right = y.left, which is NIL. Nothing has to change hands.`,
    );

    yNode.p = node.p;
    if (node.p === null) root = y;
    else if (at(node.p).left === x) at(node.p).left = y;
    else at(node.p).right = y;
    yNode.left = x;
    node.p = y;
    stats.writes++;
    emit(
      'LEFT-ROTATE',
      11,
      snapshot(),
      { move: [x, y], pointers: { x, y }, aux: keyChip(node.key, 'x.key') },
      `y.left = x. ${yNode.key} is above ${node.key} now, and the order still reads left to right.`,
    );
  }

  /** RIGHT-ROTATE(T, x) — the mirror image, line for line. */
  function rightRotate(x: string): void {
    const node = at(x);
    const y = node.left!;
    const yNode = at(y);

    emit(
      'RIGHT-ROTATE',
      1,
      snapshot(),
      {
        mark: x,
        look: y,
        edges: { [`${x}>${y}`]: 'look' },
        pointers: { x, y },
        aux: keyChip(node.key, 'x.key'),
      },
      `RIGHT-ROTATE(T, ${node.key}). y = x.left = ${yNode.key}: the node that is about to come up.`,
    );

    node.left = yNode.right;
    if (yNode.right) at(yNode.right).p = x;
    stats.writes++;
    emit(
      'RIGHT-ROTATE',
      2,
      snapshot(),
      {
        mark: x,
        look: y,
        ...(node.left ? { move: node.left } : {}),
        pointers: { x, y },
        aux: keyChip(node.key, 'x.key'),
      },
      node.left
        ? `x.left = y.right. That subtree lies between the two keys, so it is at home under either of them.`
        : `x.left = y.right, which is NIL. Nothing has to change hands.`,
    );

    yNode.p = node.p;
    if (node.p === null) root = y;
    else if (at(node.p).left === x) at(node.p).left = y;
    else at(node.p).right = y;
    yNode.right = x;
    node.p = y;
    stats.writes++;
    emit(
      'RIGHT-ROTATE',
      11,
      snapshot(),
      { move: [x, y], pointers: { x, y }, aux: keyChip(node.key, 'x.key') },
      `y.right = x. ${yNode.key} has come up over ${node.key}, and the tree is one level shorter on this side.`,
    );
  }

  // ---- the fixup --------------------------------------------------------

  /**
   * RB-INSERT-FIXUP(T, z) — repair the one property a red insertion can break.
   *
   * The book writes the right-handed half of the loop as a single line 16,
   * "same as lines 3–15 with right and left exchanged", so a mirrored case is
   * emitted against that line and named in the narration. Its rotations still
   * show their own procedure, which is where the mirroring is actually
   * visible.
   */
  function fixup(zStart: string): void {
    let z = zStart;
    for (;;) {
      const p = at(z).p;
      stats.comparisons++;
      if (p === null || colourOf(p) !== 'RED') {
        emit(
          'RB-INSERT-FIXUP',
          1,
          snapshot(),
          { mark: z, scope: family(z), pointers: { z }, aux: keyChip(at(z).key) },
          p === null
            ? `z is the root, so the loop does not run: there is no parent to clash with.`
            : `z.p is black, so there are no two reds in a row. The tree is already legal.`,
        );
        break;
      }

      const g = at(p).p!;
      const left = at(g).left === p;
      const uncle = left ? at(g).right : at(g).left;
      const mirrored = !left;
      /** Case 1 and case 3 sit on different lines in the book's left-handed half. */
      const lineFor = (leftLine: number) => (mirrored ? 16 : leftLine);
      // Line 16 already says "with right and left exchanged", so the note only
      // has to say that this is that half.
      const side = mirrored ? ', mirrored' : '';

      emit(
        'RB-INSERT-FIXUP',
        lineFor(3),
        snapshot(),
        {
          mark: z,
          scope: family(z),
          scopeLabel: colourOf(uncle) === 'RED' ? 'case 1' : 'case 2 or 3',
          ...(uncle ? { look: uncle } : {}),
          pointers: { z, y: uncle ?? g },
          aux: keyChip(at(z).key),
        },
        colourOf(uncle) === 'RED'
          ? `z and its parent are both red, and so is the uncle y${side}. Case 1: recolouring alone fixes it.`
          : `z and its parent are both red, the uncle black${side}. Only a rotation can fix this one.`,
      );

      if (colourOf(uncle) === 'RED') {
        at(p).colour = 'BLACK';
        at(uncle!).colour = 'BLACK';
        at(g).colour = 'RED';
        stats.writes += 3;
        emit(
          'RB-INSERT-FIXUP',
          lineFor(7),
          snapshot(),
          {
            move: [p, uncle!, g],
            scope: family(z),
            scopeLabel: 'case 1',
            pointers: { z },
            aux: keyChip(at(z).key),
          },
          `Parent and uncle go black, grandparent red. Every path still crosses the same number of blacks.`,
        );
        z = g;
        emit(
          'RB-INSERT-FIXUP',
          lineFor(8),
          snapshot(),
          { mark: z, scope: family(z), pointers: { z }, aux: keyChip(at(z).key) },
          `z = z.p.p. The violation moved two levels up — which is why case 1 repeats but cannot loop forever.`,
        );
        continue;
      }

      // Cases 2 and 3: the uncle is black, so colours alone will not do.
      const inside = left ? z === at(p).right : z === at(p).left;
      if (inside) {
        stats.comparisons++;
        z = p;
        emit(
          'RB-INSERT-FIXUP',
          lineFor(11),
          snapshot(),
          {
            mark: z,
            scope: family(z),
            scopeLabel: 'case 2',
            pointers: { z },
            aux: keyChip(at(z).key),
          },
          `Case 2: z is on the inside, so one rotation straightens the zig-zag into case 3.`,
        );
        if (left) leftRotate(z);
        else rightRotate(z);
      }

      const p2 = at(z).p!;
      const g2 = at(p2).p!;
      at(p2).colour = 'BLACK';
      at(g2).colour = 'RED';
      stats.writes += 2;
      emit(
        'RB-INSERT-FIXUP',
        lineFor(14),
        snapshot(),
        {
          move: [p2, g2],
          scope: family(z),
          scopeLabel: 'case 3',
          pointers: { z },
          aux: keyChip(at(z).key),
        },
        `Case 3: parent black, grandparent red. One black too many on this side, and the rotation fixes it.`,
      );
      if (left) rightRotate(g2);
      else leftRotate(g2);
      emit(
        'RB-INSERT-FIXUP',
        lineFor(15),
        snapshot(),
        { mark: z, scope: family(z), pointers: { z }, aux: keyChip(at(z).key) },
        `The black parent came up over the red grandparent. No two reds adjacent, and case 3 always ends the loop.`,
      );
      break;
    }

    if (root && at(root).colour !== 'BLACK') {
      at(root).colour = 'BLACK';
      stats.writes++;
      emit(
        'RB-INSERT-FIXUP',
        17,
        snapshot(),
        { move: root, pointers: { root }, aux: keyChip(at(root).key) },
        `T.root.color = BLACK. That adds one black to every path at once, so property 5 cannot notice.`,
      );
    }
  }

  // ---- insertion --------------------------------------------------------

  function insert(key: number, id: string): void {
    let x: string | null = root;
    let y: string | null = null;

    emit(
      'RB-INSERT',
      1,
      snapshot(),
      { ...(x ? { look: x, pointers: { x } } : {}), aux: keyChip(key) },
      x === null
        ? `RB-INSERT(T, ${key}) into an empty tree.`
        : `RB-INSERT(T, ${key}). The walk down is TREE-INSERT's, and the colours are not consulted on the way.`,
    );

    while (x !== null) {
      y = x;
      const node = at(x);
      stats.comparisons++;
      const goLeft = key < node.key;
      const next: string | null = goLeft ? node.left : node.right;
      emit(
        'RB-INSERT',
        5,
        snapshot(),
        {
          look: x,
          pointers: { x, y },
          ...(next ? { edges: { [`${x}>${next}`]: 'look' as const } } : {}),
          aux: keyChip(key),
        },
        goLeft ? `${key} < ${node.key}: go left.` : `${key} > ${node.key}: go right.`,
      );
      x = next;
    }

    const z: Node = { id, key, colour: 'RED', left: null, right: null, p: y };
    nodes.set(id, z);
    stats.writes++;
    if (y === null) root = id;
    else if (key < at(y).key) at(y).left = id;
    else at(y).right = id;

    emit(
      'RB-INSERT',
      16,
      snapshot(),
      { move: id, mark: id, pointers: { z: id }, aux: keyChip(key) },
      `${key} goes in red, with two NIL children. Red can only break property 4, and only against its own parent.`,
    );
    fixup(id);
  }

  input.forEach((key, i) => insert(key, `n${i + 1}`));

  /** The height in edges, which is the number the chapter's bound is about. */
  function height(id: string | null): number {
    if (!id) return -1;
    return 1 + Math.max(height(at(id).left), height(at(id).right));
  }

  return {
    steps,
    output: { inserted: input.length, height: Math.max(0, height(root)), nodes: nodes.size },
  };
}

/** Distinct keys. Sorted input is the interesting case, and the reader can type it. */
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
  if (parts.length > 12) return { error: 'At most 12 keys — the NILs need room too.' };

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

export const redBlackTree: AlgorithmModule = {
  id: 'red-black-tree',
  name: 'Red-Black Tree (RB-INSERT)',
  visualizer: 'tree',
  aux: [{ key: 'z', label: 'key', hint: 'the key the current operation names' }],
  procOrder: ['RB-INSERT', 'RB-INSERT-FIXUP', 'LEFT-ROTATE', 'RIGHT-ROTATE'],
  procedures: {
    'RB-INSERT': {
      title: 'RB-INSERT(T, z)',
      indent: [0, 0, 0, 1, 1, 2, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0],
      lines: [
        'x = T.root',
        'y = T.nil',
        'while x ≠ T.nil',
        'y = x',
        'if z.key < x.key',
        'x = x.left',
        'else x = x.right',
        'z.p = y',
        'if y == T.nil',
        'T.root = z',
        'elseif z.key < y.key',
        'y.left = z',
        'else y.right = z',
        'z.left = T.nil',
        'z.right = T.nil',
        'z.color = RED',
        'RB-INSERT-FIXUP(T, z)',
      ],
    },
    'RB-INSERT-FIXUP': {
      title: 'RB-INSERT-FIXUP(T, z)',
      indent: [0, 1, 2, 2, 3, 3, 3, 3, 2, 3, 4, 4, 3, 3, 3, 1, 0],
      lines: [
        'while z.p.color == RED',
        'if z.p == z.p.p.left',
        'y = z.p.p.right',
        'if y.color == RED',
        'z.p.color = BLACK',
        'y.color = BLACK',
        'z.p.p.color = RED',
        'z = z.p.p',
        'else',
        'if z == z.p.right',
        'z = z.p',
        'LEFT-ROTATE(T, z)',
        'z.p.color = BLACK',
        'z.p.p.color = RED',
        'RIGHT-ROTATE(T, z.p.p)',
        'else (same as lines 3–15, with right and left exchanged)',
        'T.root.color = BLACK',
      ],
    },
    'LEFT-ROTATE': {
      title: 'LEFT-ROTATE(T, x)',
      indent: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
      lines: [
        'y = x.right',
        'x.right = y.left',
        'if y.left ≠ T.nil',
        'y.left.p = x',
        'y.p = x.p',
        'if x.p == T.nil',
        'T.root = y',
        'elseif x == x.p.left',
        'x.p.left = y',
        'else x.p.right = y',
        'y.left = x',
        'x.p = y',
      ],
    },
    'RIGHT-ROTATE': {
      title: 'RIGHT-ROTATE(T, x)',
      indent: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
      lines: [
        'y = x.left',
        'x.left = y.right',
        'if y.right ≠ T.nil',
        'y.right.p = x',
        'y.p = x.p',
        'if x.p == T.nil',
        'T.root = y',
        'elseif x == x.p.right',
        'x.p.right = y',
        'else x.p.left = y',
        'y.right = x',
        'x.p = y',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(lg n)',
    worst: 'Θ(lg n)',
    space: 'Θ(n)',
    extra: [
      ['Height', 'at most 2 lg(n + 1) — guaranteed'],
      ['RB-INSERT', 'O(lg n): the walk, then the fixup'],
      ['Rotations per insertion', 'at most 2'],
      ['Recolourings per insertion', 'O(lg n), amortised O(1)'],
      ['Extra storage', 'one bit per node'],
      ['Versus a plain BST', 'no input order can make it tall'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 12,
    noun: 'tree',
    placeholder: '10, 20, 30, 40, 50',
    note: 'try sorted keys — they cannot make it tall',
    label: 'The keys to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 8,
  result: {
    // The five properties are the contract, and the height bound is what they
    // buy. Both are checked on the tree the run leaves behind, so a fixup that
    // repaired the picture but not the invariant fails the build.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';
      const byId = new Map(last.data.nodes.map((n) => [n.id, n]));
      const root = last.data.root;
      if (!root) return input.length === 0 ? null : 'the tree ended up empty';

      const colourOf = (id: string | null): string =>
        id ? String(byId.get(id)?.attrs?.colour ?? 'BLACK') : 'BLACK';
      if (colourOf(root) !== 'BLACK') return 'property 2: the root is not black';

      const keys: number[] = [];
      let complaint: string | null = null;
      /** Returns the black-height below `id`, checking properties 4 and 5. */
      const walk = (id: string | null, depth: number): { black: number; height: number } => {
        if (!id) return { black: 1, height: 0 };
        const node = byId.get(id);
        if (!node) {
          complaint ??= `the tree points at ${id}, which is in no node`;
          return { black: 1, height: 0 };
        }
        const [l, r] = node.children ?? [null, null];
        const left = walk(l ?? null, depth + 1);
        keys.push(node.keys[0] as number);
        const right = walk(r ?? null, depth + 1);

        if (
          colourOf(id) === 'RED' &&
          (colourOf(l ?? null) === 'RED' || colourOf(r ?? null) === 'RED')
        ) {
          complaint ??= `property 4: ${node.keys[0]} is red and has a red child`;
        }
        if (left.black !== right.black) {
          complaint ??= `property 5: the paths under ${node.keys[0]} carry ${left.black} and ${right.black} blacks`;
        }
        return {
          black: left.black + (colourOf(id) === 'BLACK' ? 1 : 0),
          height: 1 + Math.max(left.height, right.height),
        };
      };
      const { height } = walk(root, 0);
      if (complaint) return complaint;

      const sorted = [...input].sort((a, b) => a - b);
      if (JSON.stringify(keys) !== JSON.stringify(sorted)) {
        return `an inorder walk gives ${JSON.stringify(keys)}, expected ${JSON.stringify(sorted)}`;
      }

      // The point of the whole chapter: no insertion order can make it tall.
      const bound = 2 * Math.log2(input.length + 1);
      if (height - 1 > bound) {
        return `the tree is ${height - 1} edges deep, past the 2 lg(n+1) = ${bound.toFixed(2)} the properties guarantee`;
      }
      return null;
    },
  },
  record,
};
