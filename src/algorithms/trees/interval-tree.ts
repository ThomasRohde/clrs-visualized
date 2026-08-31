import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type Trace,
  type TreeData,
} from '../types.ts';

/**
 * INTERVAL TREE — CLRS §17.3: INTERVAL-SEARCH, the second augmentation and
 * the one where the extra field does something a search tree could not.
 *
 * The set is intervals rather than numbers, and the query is: **find one that
 * overlaps `i`**. Ordering the tree by low endpoint alone is not enough to
 * search it — an interval that overlaps `i` can easily have a smaller low
 * endpoint than the node you are standing on, so a plain search tree gives no
 * rule for which way to go.
 *
 * The augmentation that fixes it is one number per node: `x.max`, the largest
 * high endpoint anywhere in x's subtree. It turns the walk into a decision:
 *
 * > If the left subtree's `max` is at least `i.low`, go left. Otherwise go
 * > right.
 *
 * And the theorem in §17.3 is that this never goes the wrong way. If it goes
 * left, either the left subtree holds an overlap or nothing does. If it goes
 * right — because everything on the left ends before `i` starts — nothing on
 * the left could have overlapped anyway. So one root-to-leaf walk settles it,
 * and the whole thing is O(lg n) rather than O(n).
 *
 * `max` is drawn as a **badge**, like the sizes in §17.1 and for the same
 * reason: it is data, and the fill still belongs to what the algorithm is
 * doing this step. The node itself shows both endpoints of its interval.
 */

interface Node {
  id: string;
  low: number;
  high: number;
  max: number;
  left: string | null;
  right: string | null;
}

/** The input is flat pairs: low₁, high₁, low₂, high₂, … */
export function intervalsOf(input: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < input.length; i += 2) {
    const low = Math.max(0, Math.round(input[i]!));
    out.push([low, Math.max(low + 1, Math.round(input[i + 1]!))]);
  }
  return out;
}

export function record(input: number[]): Trace {
  const intervals = intervalsOf(input);
  const nodes = new Map<string, Node>();
  let root: string | null = null;
  const at = (id: string): Node => nodes.get(id)!;
  const maxOf = (id: string | null): number => (id ? at(id).max : -Infinity);

  const { steps, stats, emit } = createRecorder();

  function snapshot(): TreeData {
    return {
      kind: 'tree',
      root,
      nodes: [...nodes.values()].map((n) => ({
        id: n.id,
        keys: [n.low, n.high],
        ...(n.left || n.right ? { children: [n.left, n.right] } : {}),
        attrs: { max: n.max },
      })),
    };
  }

  const subtree = (id: string | null): string[] =>
    !id ? [] : [id, ...subtree(at(id).left), ...subtree(at(id).right)];
  const chips = (low: number | null, high: number | null) => ({
    query: auxOf([null, low, high], 1, [null, 'i.low', 'i.high']),
  });

  function insert(low: number, high: number, id: string): void {
    let x = root;
    let y: string | null = null;
    const path: string[] = [];
    while (x !== null) {
      y = x;
      path.push(x);
      at(x).max = Math.max(at(x).max, high);
      stats.comparisons++;
      x = low < at(x).low ? at(x).left : at(x).right;
    }
    nodes.set(id, { id, low, high, max: high, left: null, right: null });
    if (y === null) root = id;
    else if (low < at(y).low) at(y).left = id;
    else at(y).right = id;
    stats.writes++;

    emit(
      'INTERVAL-INSERT',
      path.length ? 2 : 3,
      snapshot(),
      { move: id, ...(path.length ? { look: path } : {}), aux: chips(low, high) },
      path.length === 0
        ? `[${low}, ${high}] is the root, and its max is its own high endpoint.`
        : `[${low}, ${high}] goes in by its low endpoint, and every node above it takes ${high} into its max if it is bigger.`,
    );
  }

  /** INTERVAL-SEARCH(T, i) — one walk down, decided by the left subtree's max. */
  function search(low: number, high: number): string | null {
    let x = root;
    const overlaps = (id: string): boolean => at(id).low <= high && low <= at(id).high;

    emit(
      'INTERVAL-SEARCH',
      1,
      snapshot(),
      {
        ...(x ? { look: x, pointers: { x }, scope: subtree(x) } : {}),
        aux: chips(low, high),
      },
      `INTERVAL-SEARCH for [${low}, ${high}]. Start at the root; anything that overlaps is somewhere below it.`,
    );

    while (x !== null) {
      stats.comparisons++;
      if (overlaps(x)) {
        emit(
          'INTERVAL-SEARCH',
          2,
          snapshot(),
          {
            mark: x,
            pointers: { x },
            found: { low, high, result: [at(x).low, at(x).high] },
            aux: chips(low, high),
          },
          `[${at(x).low}, ${at(x).high}] overlaps [${low}, ${high}], so the loop stops and returns it.`,
        );
        return x;
      }

      const left = at(x).left;
      stats.comparisons++;
      const goLeft = left !== null && maxOf(left) >= low;
      const next = goLeft ? left : at(x).right;
      emit(
        'INTERVAL-SEARCH',
        goLeft ? 4 : 5,
        snapshot(),
        {
          look: x,
          ...(next ? { scope: subtree(next), edges: { [`${x}>${next}`]: 'look' as const } } : {}),
          pointers: { x },
          aux: chips(low, high),
        },
        goLeft
          ? `The left subtree reaches to ${maxOf(left)}, which is at or past ${low} — so if anything overlaps, something on the left does.`
          : left === null
            ? `There is no left subtree, so go right.`
            : `Everything on the left ends by ${maxOf(left)}, before ${low}. Nothing there can overlap, so go right.`,
      );
      x = next;
    }

    emit(
      'INTERVAL-SEARCH',
      6,
      snapshot(),
      { found: { low, high, result: null }, aux: chips(low, high) },
      `The walk ran off the bottom: nothing in the tree overlaps [${low}, ${high}], and one path was enough to prove it.`,
    );
    return null;
  }

  intervals.forEach(([low, high], i) => insert(low, high, `n${i + 1}`));
  if (root === null) return { steps, output: { intervals: 0 } };

  // One query that overlaps something, and one that cannot possibly — the
  // second is where the walk shows that it stops, rather than searching on.
  const hit = intervals[Math.floor(intervals.length / 2)]!;
  search(hit[0], hit[0] + 1);
  const beyond = Math.max(...intervals.map(([, h]) => h)) + 2;
  search(beyond, beyond + 2);

  return { steps, output: { intervals: intervals.length } };
}

/** Intervals scattered over a window, with plenty of overlap to search through. */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 10));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const low = Math.floor(Math.random() * 22);
    out.push(low, low + 1 + Math.floor(Math.random() * 6));
  }
  return out;
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one interval, as low-high.' };
  if (parts.length > 10) return { error: 'At most 10 intervals — the tree has to stay readable.' };

  const out: number[] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
    if (!m)
      return { error: `"${part}" is not an interval. Write each one as low-high, e.g. 5-11.` };
    const low = Number(m[1]);
    const high = Number(m[2]);
    if (high <= low) return { error: `"${part}" ends before it starts.` };
    if (high > 99) return { error: `"${part}" runs past 99.` };
    out.push(low, high);
  }
  return { value: out };
}

export const intervalTree: AlgorithmModule = {
  id: 'interval-tree',
  name: 'Interval Tree',
  visualizer: 'tree',
  aux: [{ key: 'query', label: 'i', hint: 'the interval being searched for' }],
  procOrder: ['INTERVAL-INSERT', 'INTERVAL-SEARCH'],
  procedures: {
    // §17.3 gives insertion in prose — the tree is ordered on the low endpoint
    // and `max` is updated on the way down — so this block is that in
    // TREE-INSERT's shape. INTERVAL-SEARCH below is the book's, verbatim.
    'INTERVAL-INSERT': {
      title: 'INTERVAL-INSERT(T, x)',
      indent: [0, 1, 0],
      lines: [
        'walk down from the root, comparing x.int.low',
        'y.max = max(y.max, x.int.high) at every node y on the way',
        'insert x as a leaf, with x.max = x.int.high',
      ],
    },
    'INTERVAL-SEARCH': {
      title: 'INTERVAL-SEARCH(T, i)',
      indent: [0, 0, 1, 2, 1, 0],
      lines: [
        'x = T.root',
        'while x ≠ T.nil and i does not overlap x.int',
        'if x.left ≠ T.nil and x.left.max ≥ i.low',
        'x = x.left',
        'else x = x.right',
        'return x',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(lg n)',
    worst: 'Θ(lg n)',
    space: 'Θ(n)',
    extra: [
      ['INTERVAL-SEARCH', 'O(lg n) — one root-to-leaf path'],
      ['Without the max field', 'Θ(n) — no rule says which way to go'],
      ['Extra storage', 'one endpoint per node'],
      ['Maintained on insert', 'along the path, like a size'],
      ['Finding *all* overlaps', 'O(k lg n) for k of them'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'set',
    placeholder: '16-21, 8-9, 25-30, 5-8',
    note: 'each interval as low-high',
    label: 'The intervals, each written low-high, separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.floor(value.length / 2),
  },
  defaultSize: 7,
  result: {
    // Two claims: the augmentation is consistent, and the search's answer is
    // right — which is checked by scanning every interval, the linear work the
    // tree exists to avoid.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const intervals = intervalsOf(input);
      if (intervals.length === 0) return null;

      const answers: Array<{ low: number; high: number; result: [number, number] | null }> = [];
      for (const step of trace.steps) {
        const hi = step.hi as {
          found?: { low: number; high: number; result: [number, number] | null };
        };
        if (hi.found) answers.push(hi.found);
      }
      if (answers.length !== 2) return `recorded ${answers.length} searches, expected 2`;

      for (const { low, high, result } of answers) {
        const overlapping = intervals.filter(([l, h]) => l <= high && low <= h);
        if (result === null) {
          if (overlapping.length > 0) {
            return `the search for [${low}, ${high}] returned NIL, but [${overlapping[0]![0]}, ${overlapping[0]![1]}] overlaps it`;
          }
        } else if (!(result[0] <= high && low <= result[1])) {
          return `the search for [${low}, ${high}] returned [${result[0]}, ${result[1]}], which does not overlap it`;
        }
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'tree') return 'the last step carries no tree snapshot';
      const byId = new Map(last.data.nodes.map((n) => [n.id, n]));
      let complaint: string | null = null;
      const check = (id: string | null): number => {
        if (!id) return -Infinity;
        const node = byId.get(id);
        if (!node) {
          complaint ??= `the tree points at ${id}, which is in no node`;
          return -Infinity;
        }
        const [l, r] = node.children ?? [null, null];
        const max = Math.max(node.keys[1] as number, check(l ?? null), check(r ?? null));
        if (Number(node.attrs?.max) !== max) {
          complaint ??= `a node claims max ${node.attrs?.max} but its subtree reaches ${max}`;
        }
        return max;
      };
      check(last.data.root);
      return complaint;
    },
  },
  record,
};
