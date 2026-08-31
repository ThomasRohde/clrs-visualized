import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type Cell,
  type CellsData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * DYNAMIC TABLE — CLRS §16.4: TABLE-INSERT, and doubling as the answer to a
 * table that does not know how big it needs to be.
 *
 * Chapter 10 left the array-based structures with a fixed capacity and no way
 * out of it: a stack that outgrows its array has nowhere to put the next
 * element. The fix is to allocate a bigger table and copy — and the only
 * question that matters is *how much* bigger. Grow by one and n insertions
 * copy 1 + 2 + … + (n−1) = Θ(n²) items. **Double**, and the copies come to
 * fewer than n over the whole run, because each doubling is twice as rare as
 * the one before it. An individual insertion still costs Θ(n) when it lands
 * on a full table; the amortised cost is 3.
 *
 * What the picture shows: the bracket is the table **as allocated** — T.size
 * — and it doubles the moment the table fills. The outlines beyond it are
 * room the drawing keeps so nothing rescales mid-run; they are not slots the
 * table owns yet.
 *
 * `verify` checks the bound rather than restating it: the whole run must
 * write fewer than 3n items, counting every copy.
 */

const slotId = (i: number): string => `t${i}`;

/**
 * The table, drawn at the width it will finally reach.
 *
 * The slots are numbered from 1 like every other array on the site. Which
 * slots are actually *allocated* is the bracket's job, not the row's: a row
 * that grew would rescale every cell in the middle of the run, and the reader
 * would read the rescaling as the algorithm doing something.
 */
function snapshot(items: number[], capacity: number): CellsData {
  const cells: Cell[] = Array.from({ length: capacity }, (_, i) => ({
    id: slotId(i + 1),
    value: items[i] ?? null,
    label: i + 1,
  }));
  return { kind: 'cells', rows: [{ label: 'T', cells }] };
}

/** The size the table ends at: doubling from 1 until it holds them all. */
export function finalCapacity(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(1, size);
}

export function record(input: number[]): Trace {
  const capacity = finalCapacity(input.length);
  const items: number[] = [];
  let size = 0;

  const { steps, stats, emit } = createRecorder();
  const cells = () => snapshot(items, capacity);
  /** The allocated table — the bracket, and the only thing that says T.size. */
  const table = () => Array.from({ length: size }, (_, i) => slotId(i + 1));
  const base = () => ({ scope: table(), scopeLabel: `T.size = ${size}` });
  /** How full the table is, how big it is, and what this insertion has cost. */
  const chips = (cost: number) => ({
    table: auxOf([null, items.length, size, cost], 3, [null, 'T.num', 'T.size', 'cost']),
  });

  for (const x of input) {
    let cost = 0;

    stats.comparisons++;
    emit(
      'TABLE-INSERT',
      1,
      cells(),
      { ...base(), aux: chips(cost) },
      size === 0
        ? `TABLE-INSERT(T, ${x}). T.size is 0: there is no table at all yet.`
        : `TABLE-INSERT(T, ${x}). The table exists, with ${size} slot${size === 1 ? '' : 's'}.`,
    );

    if (size === 0) {
      size = 1;
      emit(
        'TABLE-INSERT',
        2,
        cells(),
        { ...base(), aux: chips(cost) },
        `One slot is allocated. The bracket is the table as allocated — everything outside it is not yet ours.`,
      );
      emit(
        'TABLE-INSERT',
        3,
        cells(),
        { ...base(), aux: chips(cost) },
        `T.size = 1. It holds one item and will not grow again until that one is in it.`,
      );
    }

    stats.comparisons++;
    const full = items.length === size;
    emit(
      'TABLE-INSERT',
      4,
      cells(),
      { ...base(), ...(full && size > 0 ? { look: table() } : {}), aux: chips(cost) },
      full
        ? `T.num = T.size = ${size}: the table is full, and every one of these ${size} item${size === 1 ? '' : 's'} has to be copied.`
        : `T.num = ${items.length} and T.size = ${size}, so there is a free slot and this insertion is cheap.`,
    );

    if (full) {
      const old = size;
      size = old * 2;
      emit(
        'TABLE-INSERT',
        5,
        cells(),
        { ...base(), aux: chips(cost) },
        `A new table of ${size} slots is allocated — twice the old one, which is the whole trick.`,
      );

      for (let i = 0; i < old; i++) {
        stats.writes++;
        cost++;
        emit(
          'TABLE-INSERT',
          6,
          cells(),
          { ...base(), move: slotId(i + 1), aux: chips(cost) },
          `Item ${i + 1} of ${old} moves across. Copying is what makes this one insertion expensive.`,
        );
      }

      emit(
        'TABLE-INSERT',
        7,
        cells(),
        { ...base(), aux: chips(cost) },
        `The old table is freed. Its ${old} slot${old === 1 ? '' : 's'} cost ${old} write${old === 1 ? '' : 's'} to leave behind.`,
      );
      emit(
        'TABLE-INSERT',
        8,
        cells(),
        { ...base(), aux: chips(cost) },
        `T.table is the new table now.`,
      );
      emit(
        'TABLE-INSERT',
        9,
        cells(),
        { ...base(), aux: chips(cost) },
        `T.size = ${size}. The next ${size - old} insertion${size - old === 1 ? '' : 's'} will not have to copy anything.`,
      );
    }

    items.push(x);
    stats.writes++;
    cost++;
    emit(
      'TABLE-INSERT',
      10,
      cells(),
      { ...base(), move: slotId(items.length), aux: chips(cost) },
      `${x} goes into slot ${items.length}. That is one write, whatever else this insertion had to do.`,
    );
    emit(
      'TABLE-INSERT',
      11,
      cells(),
      { ...base(), aux: chips(cost) },
      cost === 1
        ? `T.num = ${items.length}. One write and the insertion is over — which is what almost all of them look like.`
        : `T.num = ${items.length}. This insertion cost ${cost}: ${cost - 1} copies and the item itself.`,
    );
  }

  return {
    steps,
    output: { inserted: input.length, size, writes: stats.writes },
  };
}

/** Values to insert. Nothing about them matters but how many there are. */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 16));
  return Array.from({ length: count }, () => 10 + Math.floor(Math.random() * 90));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one item to insert.' };
  if (parts.length > 16)
    return { error: 'At most 16 items — the final table has to fit on screen.' };

  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const dynamicTable: AlgorithmModule = {
  id: 'dynamic-table',
  name: 'Dynamic Table (TABLE-INSERT)',
  visualizer: 'cells',
  aux: [
    {
      key: 'table',
      label: 'T',
      hint: 'T.num, T.size, and what this insertion has cost',
    },
  ],
  procOrder: ['TABLE-INSERT'],
  procedures: {
    'TABLE-INSERT': {
      title: 'TABLE-INSERT(T, x)',
      indent: [0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0],
      lines: [
        'if T.size == 0',
        'allocate T.table with 1 slot',
        'T.size = 1',
        'if T.num == T.size',
        'allocate new-table with 2 · T.size slots',
        'insert all items in T.table into new-table',
        'free T.table',
        'T.table = new-table',
        'T.size = 2 · T.size',
        'insert x into T.table',
        'T.num = T.num + 1',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(1)',
    worst: 'Θ(n)',
    space: 'Θ(n)',
    extra: [
      ['Amortised per insertion', '3'],
      ['n insertions', 'O(n) total'],
      ['Expensive insertions', 'when T.num is a power of 2'],
      ['Total copying', 'fewer than n items'],
      ['If it grew by one instead', 'Θ(n²) — the whole reason to double'],
      ['Potential', 'Φ = 2 · T.num − T.size'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 16,
    noun: 'run',
    placeholder: '31, 4, 59, 26',
    note: 'the items to insert, in order',
    label: 'The items to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 10,
  result: {
    // No sorted array to check. The claims are §16.4's: the table ends at the
    // right size holding the right items, and the whole run — copies included
    // — wrote fewer than 3n items, which is the amortised bound itself.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const n = input.length;
      const size = trace.output?.size ?? -1;
      const writes = trace.output?.writes ?? -1;

      if (size !== finalCapacity(n)) {
        return `the table ends with T.size = ${size}, expected ${finalCapacity(n)}`;
      }
      if (writes > 3 * n) {
        return `${n} insertions wrote ${writes} items, which breaks the amortised bound of 3 per insertion`;
      }
      // Doubling is what buys that bound: growing by one slot at a time would
      // copy 0 + 1 + … + (n−1) items, so a run that writes fewer than that is
      // evidence the copies really are geometric.
      const oneAtATime = (n * (n - 1)) / 2 + n;
      if (n > 4 && writes >= oneAtATime) {
        return `${writes} writes is no better than growing one slot at a time (${oneAtATime})`;
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'cells') return 'the last step carries no cells snapshot';
      const held = last.data.rows[0]!.cells.slice(0, n).map((c) => c.value);
      if (JSON.stringify(held) !== JSON.stringify(input)) {
        return `the table holds ${JSON.stringify(held)}, expected ${JSON.stringify(input)}`;
      }
      return null;
    },
  },
  record,
};
