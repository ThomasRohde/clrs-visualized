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
 * CHAINED HASH TABLE — CLRS §11.2: collision resolution by chaining.
 *
 * The third answer to "where does the order live". An array puts it in the
 * positions and a list puts it in the pointers; a hash table computes it. The
 * key names its own slot through `h`, so nothing is searched for, compared or
 * shifted on the way in — and the entire cost of the structure is what
 * happens when two keys name the same slot.
 *
 * Chaining's answer is to hang a linked list off every slot, which is why
 * all three procedures are one line long: they work out `h(k)` and then hand
 * the whole job to §10.2. Only `LIST-SEARCH` is shown in full beside them,
 * because it is the only one with a loop, and that loop is the thing on
 * screen — a walk down one bucket, one comparison per object.
 *
 * The table is deliberately tiny (m = 5) so that chains form at a size a
 * reader can hold in their head. Every row is drawn head-first, left to
 * right, and reserved from the first frame to the length its chain will
 * eventually reach: a row that grew would rescale every cell in the table
 * mid-trace, and the reader would read the rescaling as something the
 * algorithm did.
 *
 * The run is a script:
 *
 *   1. Insert every key, watching `h` scatter them and the collisions pile up.
 *   2. Search for the deepest key in the longest chain — the α of Θ(1 + α).
 *   3. Delete the object that search returned.
 *   4. Search for it again, which now walks that chain to the end and fails.
 */

/** Slots in the table. Small on purpose: chains are the point, not the size. */
const M = 5;

/** The division method, §11.3: h(k) = k mod m. */
function hash(k: number): number {
  return ((k % M) + M) % M;
}

/** One object in the table. Its id follows it between frames; nothing else does. */
interface Entry {
  id: string;
  key: number;
}

/**
 * The table as the renderer draws it: one row per slot, the chain in list
 * order with the head at the left, padded out to the length that chain will
 * reach so that no cell in the table changes size mid-run.
 */
function snapshot(chains: Entry[][], reserved: number[]): CellsData {
  return {
    kind: 'cells',
    rows: chains.map((chain, j) => {
      const cells: Cell[] = chain.map((entry) => ({ id: entry.id, value: entry.key }));
      for (let p = chain.length; p < reserved[j]!; p++) {
        cells.push({ id: `t${j}s${p}`, value: null });
      }
      return { label: `T[${j}]`, cells };
    }),
  };
}

/**
 * Which key the script searches for and then deletes: the one that arrived
 * first in the busiest bucket. Prepending puts it at the *end* of that chain,
 * so the walk to reach it is the longest the table has to offer.
 */
export function probeKey(input: number[]): number | null {
  if (input.length === 0) return null;
  const counts = Array.from({ length: M }, () => 0);
  for (const k of input) counts[hash(k)]!++;
  let busiest = 0;
  for (let j = 1; j < M; j++) if (counts[j]! > counts[busiest]!) busiest = j;
  return input.find((k) => hash(k) === busiest) ?? null;
}

export function record(input: number[]): Trace {
  const chains: Entry[][] = Array.from({ length: M }, () => []);
  // How long each chain will get, so its row can be drawn at that width from
  // the first frame. Never zero: an empty bucket is still a slot, and drawing
  // it as a blank line would lose it among the rows that have objects in it.
  const reserved = Array.from({ length: M }, (_, j) =>
    Math.max(1, input.filter((k) => hash(k) === j).length),
  );

  const { steps, stats, emit } = createRecorder();
  const cells = () => snapshot(chains, reserved);
  /**
   * Every cell of one row, so the bracket marks the whole bucket.
   *
   * Recomputed at each emit rather than held: a prepend renames the cell at
   * every position after the head, and a stale id list would bracket the part
   * of the row that happens to still answer to it.
   */
  const bucket = (j: number): string[] => {
    const ids = chains[j]!.map((entry) => entry.id);
    for (let p = ids.length; p < reserved[j]!; p++) ids.push(`t${j}s${p}`);
    return ids;
  };
  /** The key this operation names, and the slot it hashed to. */
  const chips = (k: number) => ({ h: auxOf([null, k, hash(k)], 2, [null, 'k', 'h(k)']) });

  /** LIST-SEARCH down one bucket. Returns the entry found, or null. */
  function search(k: number, opening: string): Entry | null {
    const j = hash(k);
    const chain = chains[j]!;
    // The chain does not change under a search, so one id list serves it all.
    const base = { scope: bucket(j), aux: chips(k) };

    emit('CHAINED-HASH-SEARCH', 1, cells(), base, opening);

    let at = 0;
    emit(
      'LIST-SEARCH',
      1,
      cells(),
      { ...base, ...(chain[0] ? { look: chain[0].id } : {}) },
      chain.length === 0
        ? `x = T[${j}].head = NIL. This bucket holds nothing, so the walk is over before it starts.`
        : `x = T[${j}].head — the object prepended most recently, not the one inserted first.`,
    );

    for (;;) {
      stats.comparisons++;
      const here = chain[at];
      if (!here) {
        emit(
          'LIST-SEARCH',
          2,
          cells(),
          base,
          `x is NIL: the walk is off the end of T[${j}]'s chain, and ${k} was not in it.`,
        );
        break;
      }
      if (here.key === k) {
        emit(
          'LIST-SEARCH',
          2,
          cells(),
          { ...base, look: here.id },
          `x.key = ${k}. The test fails, the loop stops, and this is the object.`,
        );
        break;
      }
      emit(
        'LIST-SEARCH',
        2,
        cells(),
        { ...base, look: here.id },
        `x.key = ${here.key}, not ${k}. Another object in this bucket, another comparison.`,
      );

      at++;
      const next = chain[at];
      emit(
        'LIST-SEARCH',
        3,
        cells(),
        { ...base, ...(next ? { look: next.id } : {}) },
        next
          ? `x = x.next. Only this chain is walked — the other ${M - 1} buckets are never read.`
          : `x = x.next = NIL. That was the last object in T[${j}].`,
      );
    }

    const found = chain[at] ?? null;
    emit(
      'LIST-SEARCH',
      4,
      cells(),
      {
        ...base,
        ...(found ? { look: found.id } : {}),
        searchResult: { key: k, found: found !== null },
      },
      found
        ? `Return the object. It cost ${at + 1} comparison${at === 0 ? '' : 's'} — the length of one chain, not of the table.`
        : `Return NIL. ${k} is in no bucket, and only T[${j}] had to be looked at to know it.`,
    );
    return found;
  }

  /** LIST-DELETE inside one bucket — the object is already in hand. */
  function remove(entry: Entry): void {
    const j = hash(entry.key);
    const chain = chains[j]!;

    emit(
      'CHAINED-HASH-DELETE',
      1,
      cells(),
      { scope: bucket(j), done: entry.id, aux: chips(entry.key) },
      `LIST-DELETE(T[${j}], x). The search handed over the object itself, so this is a splice and not a walk.`,
    );

    chain.splice(chain.indexOf(entry), 1);
    stats.writes++;
    emit(
      'CHAINED-HASH-DELETE',
      1,
      cells(),
      { scope: bucket(j), aux: chips(entry.key) },
      `T[${j}]'s chain is one shorter. No other bucket was read, and nothing was rehashed.`,
    );
  }

  for (let i = 0; i < input.length; i++) {
    const key = input[i]!;
    const j = hash(key);
    const entry: Entry = { id: `o${i + 1}`, key };

    emit(
      'CHAINED-HASH-INSERT',
      1,
      cells(),
      { scope: bucket(j), aux: chips(key) },
      `h(${key}) = ${key} mod ${M} = ${j}. The key names its own slot; nothing is searched for.`,
    );

    chains[j]!.unshift(entry);
    stats.writes++;
    emit(
      'CHAINED-HASH-INSERT',
      1,
      cells(),
      { scope: bucket(j), move: entry.id, aux: chips(key) },
      chains[j]!.length === 1
        ? `LIST-PREPEND drops it into an empty bucket. One write, no comparison, Θ(1).`
        : `LIST-PREPEND puts it at the front of T[${j}] — a collision, and still Θ(1): the chain is never read.`,
    );
  }

  const target = probeKey(input);
  if (target === null) {
    emit(
      'CHAINED-HASH-INSERT',
      1,
      cells(),
      { aux: chips(0) },
      `An empty table: every one of the ${M} chains is NIL.`,
    );
    return { steps, output: { slots: M, inserted: 0 } };
  }

  const found = search(
    target,
    `CHAINED-HASH-SEARCH(T, ${target}). h(${target}) = ${hash(target)}, so only that one bucket can hold it.`,
  );
  if (found) remove(found);
  search(
    target,
    `CHAINED-HASH-SEARCH(T, ${target}) again, after the delete. The same bucket, one object lighter.`,
  );

  return { steps, output: { slots: M, inserted: input.length, deleted: target } };
}

/**
 * Distinct keys, so that a chain can never hold the same key twice —
 * `LIST-SEARCH` returns the first match, and a repeat would hide an object
 * exactly as it would in §10.2.
 */
function generate(n: number): number[] {
  const pool = Array.from({ length: 80 }, (_, i) => i + 10);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(1, Math.min(n, pool.length)));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one key.' };
  if (parts.length > 12) return { error: 'At most 12 keys — beyond that the chains stop fitting.' };

  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    if (values.includes(v)) {
      return {
        error: `${v} appears twice. Keys must be distinct — a chain holding it twice would hide one of them.`,
      };
    }
    values.push(v);
  }
  return { value: values };
}

export const chainedHash: AlgorithmModule = {
  id: 'chained-hash',
  name: 'Hash Table with Chaining',
  visualizer: 'cells',
  aux: [{ key: 'h', label: 'h', hint: 'the key this operation names, and the slot it hashes to' }],
  procOrder: ['CHAINED-HASH-INSERT', 'CHAINED-HASH-SEARCH', 'CHAINED-HASH-DELETE', 'LIST-SEARCH'],
  procedures: {
    'CHAINED-HASH-INSERT': {
      title: 'CHAINED-HASH-INSERT(T, x)',
      indent: [0],
      lines: ['LIST-PREPEND(T[h(x.key)], x)'],
    },
    'CHAINED-HASH-SEARCH': {
      title: 'CHAINED-HASH-SEARCH(T, k)',
      indent: [0],
      lines: ['return LIST-SEARCH(T[h(k)], k)'],
    },
    'CHAINED-HASH-DELETE': {
      title: 'CHAINED-HASH-DELETE(T, x)',
      indent: [0],
      lines: ['LIST-DELETE(T[h(x.key)], x)'],
    },
    // The one procedure above with a loop in it, and the only work the table
    // does that is not Θ(1). It is §10.2's, unchanged.
    'LIST-SEARCH': {
      title: 'LIST-SEARCH(L, k)',
      indent: [0, 0, 1, 0],
      lines: ['x = L.head', 'while x ≠ NIL and x.key ≠ k', 'x = x.next', 'return x'],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(1 + α)',
    worst: 'Θ(n)',
    space: 'Θ(m + n)',
    extra: [
      ['CHAINED-HASH-INSERT', 'Θ(1) — worst case, not amortised'],
      ['CHAINED-HASH-DELETE', 'Θ(1) — given the object'],
      ['CHAINED-HASH-SEARCH', 'Θ(1 + α) — expected'],
      ['Load factor', 'α = n/m, the average chain length'],
      ['Worst case', 'all n keys in one chain'],
      ['Assumes', 'independent uniform hashing'],
      ['This table', 'm = 5, h(k) = k mod 5'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 10,
    noun: 'table',
    placeholder: '25, 12, 31, 47, 8',
    note: 'distinct keys, inserted left to right',
    label: 'The keys to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 7,
  result: {
    // No array, so nothing sorts, permutes or is preserved. What must hold is
    // that each key ended up in the bucket its hash names, that the chains are
    // in the order prepending puts them in, and that the delete took effect.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      if (input.length === 0) return null;

      const searches: Array<{ key: number; found: boolean }> = [];
      for (const step of trace.steps) {
        const result = (step.hi as { searchResult?: { key: number; found: boolean } }).searchResult;
        if (result) searches.push(result);
      }
      if (searches.length !== 2) return `recorded ${searches.length} searches, expected 2`;
      if (!searches[0]!.found) {
        return `CHAINED-HASH-SEARCH missed ${searches[0]!.key}, which had been inserted`;
      }
      if (searches[1]!.found) {
        return `CHAINED-HASH-SEARCH still finds ${searches[1]!.key} after it was deleted`;
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'cells') return 'the last step carries no cells snapshot';
      const rows = last.data.rows;
      if (rows.length !== M) return `the table has ${rows.length} slots, expected ${M}`;

      const deleted = searches[0]!.key;
      for (let j = 0; j < M; j++) {
        const held = rows[j]!.cells.filter((c) => c.value !== null).map((c) => c.value as number);
        // Prepending reverses: the last key to arrive in a bucket is its head.
        const expected = input.filter((k) => hash(k) === j && k !== deleted).reverse();
        if (JSON.stringify(held) !== JSON.stringify(expected)) {
          return `T[${j}] holds ${JSON.stringify(held)}, expected ${JSON.stringify(expected)}`;
        }
      }
      return null;
    },
  },
  record,
};
