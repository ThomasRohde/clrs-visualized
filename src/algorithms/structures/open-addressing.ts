import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type CellsData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * OPEN ADDRESSING — CLRS §11.4, with linear probing.
 *
 * Chaining answers a collision by storing the key somewhere else and pointing
 * at it. Open addressing refuses to store anything outside the table: every
 * key lives in a slot of `T` itself, so a collision has to be answered by
 * *probing* — trying h(k, 1), h(k, 2), … until an empty slot turns up. There
 * are no pointers and no objects, which is the whole appeal: the table is one
 * array, and it holds at most m keys by construction.
 *
 * Linear probing is the simplest probe sequence, h(k, i) = (h'(k) + i) mod m,
 * and it is the one worth drawing: its probes are the slot next door, so a run
 * of occupied slots is visible on screen as a run. That run is **primary
 * clustering**, and every key that lands in a cluster makes the cluster longer
 * and the next search through it slower.
 *
 * The run ends on the part of the section that surprises people:
 *
 *   1. Insert every key, watching probe sequences step over the occupied ones.
 *   2. Search for a key that had to probe — the same walk, in reverse.
 *   3. Delete the key sitting in its way, which does **not** empty the slot.
 *      It writes DELETED, because an emptied slot would break the search.
 *   4. Search for the probed key again. The walk crosses the DELETED slot and
 *      keeps going, which is exactly what a NIL there would have prevented.
 *
 * This is also why the table cannot delete its way back to a clean state, and
 * why §11.4 says chaining is usually the better answer when keys are deleted.
 */

/** Slots in the table: prime, and not near a power of 2. */
const M = 11;

/** What a slot holds: a key, nothing at all, or the tombstone. */
type Slot = number | null | typeof DELETED;
const DELETED = 'DEL';

/** h'(k) = k mod m, and linear probing walks on from there. */
function home(k: number): number {
  return ((k % M) + M) % M;
}
function probe(k: number, i: number): number {
  return (home(k) + i) % M;
}

const slotId = (q: number): string => `s${q}`;

/** One row of m slots, each captioned with its index. */
function snapshot(T: Slot[]): CellsData {
  return {
    kind: 'cells',
    rows: [
      {
        label: 'T',
        cells: T.map((value, q) => ({ id: slotId(q), value, label: q })),
      },
    ],
  };
}

/** Where linear probing puts each key, in insertion order. */
function place(input: number[]): Map<number, number> {
  const T: Slot[] = Array.from({ length: M }, () => null);
  const at = new Map<number, number>();
  for (const k of input) {
    for (let i = 0; i < M; i++) {
      const q = probe(k, i);
      if (T[q] === null) {
        T[q] = k;
        at.set(k, q);
        break;
      }
    }
  }
  return at;
}

/**
 * The two keys the script demonstrates deletion with: `probed`, the first key
 * that could not have its own slot, and `blocker`, whichever key was sitting
 * in it. Deleting the blocker puts a tombstone directly in the middle of the
 * probed key's own probe sequence, which is where DELETED earns its keep.
 *
 * Returns null when no key collided — a table with room and luck — and then
 * the script falls back to deleting the first key and searching for that,
 * which walks over the tombstone and correctly fails to find it.
 */
export function demoPair(input: number[]): { probed: number; blocker: number } | null {
  const at = place(input);
  for (const k of input) {
    const q = at.get(k);
    if (q === undefined || q === home(k)) continue;
    const blocker = input.find((other) => at.get(other) === home(k));
    if (blocker !== undefined && blocker !== k) return { probed: k, blocker };
  }
  return null;
}

/** A key that is certainly absent, and whose own slot is empty. */
export function missingKey(input: number[]): number {
  const at = place(input);
  const taken = new Set(at.values());
  const free = Array.from({ length: M }, (_, q) => q).find((q) => !taken.has(q)) ?? 0;
  for (let k = free; k <= 999; k += M) {
    if (k >= 10 && !input.includes(k)) return k;
  }
  return free;
}

export function record(input: number[]): Trace {
  const T: Slot[] = Array.from({ length: M }, () => null);
  const { steps, stats, emit } = createRecorder();

  /** Slots holding a tombstone, which stay marked for the rest of the run. */
  const graves: string[] = [];
  const cells = () => snapshot(T);
  /**
   * The two names on screen. `q` is the slot being probed and `h(k)` is the
   * one the key asked for; they stack while the probe is still at home.
   */
  const marks = (k: number, q: number | null) => ({
    pointers: {
      ...(q === null ? {} : { q: slotId(q) }),
      'h(k)': slotId(home(k)),
    },
    // `mark` is the slot the key wanted. It is dropped while the probe is
    // standing on it, so that the active probe is what the colour shows.
    ...(q === home(k) ? {} : { mark: slotId(home(k)) }),
    ...(graves.length ? { done: [...graves] } : {}),
  });
  const chips = (k: number, i: number) => ({
    probe: auxOf([null, k, i], 2, [null, 'k', 'i']),
  });

  /** HASH-INSERT(T, k) — probe until a slot is free, then write. */
  function insert(k: number): void {
    emit(
      'HASH-INSERT',
      1,
      cells(),
      { ...marks(k, null), aux: chips(k, 0) },
      `HASH-INSERT(T, ${k}). i = 0, so the first probe is the slot ${k} asks for: h(${k}) = ${home(k)}.`,
    );

    for (let i = 0; i < M; i++) {
      const q = probe(k, i);
      emit(
        'HASH-INSERT',
        3,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i) },
        `q = h(${k}, ${i}) = ${(home(k) + i) % M}. Linear probing: the key's own slot, then the next one along.`,
      );

      stats.comparisons++;
      const occupant = T[q]!;
      if (occupant === null) {
        emit(
          'HASH-INSERT',
          4,
          cells(),
          { ...marks(k, q), look: slotId(q), aux: chips(k, i) },
          `T[${q}] is NIL — an empty slot, and the probe sequence stops here.`,
        );
        T[q] = k;
        stats.writes++;
        emit(
          'HASH-INSERT',
          5,
          cells(),
          { ...marks(k, q), move: slotId(q), aux: chips(k, i) },
          i === 0
            ? `T[${q}] = ${k}. No collision: it went straight into the slot h named.`
            : `T[${q}] = ${k}. It took ${i} probe${i === 1 ? '' : 's'} to get past the keys already in the way.`,
        );
        return;
      }

      emit(
        'HASH-INSERT',
        4,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i) },
        `T[${q}] holds ${occupant === DELETED ? 'a deleted key' : occupant}, not NIL. Occupied, so ${k} cannot go here.`,
      );
      emit(
        'HASH-INSERT',
        7,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i + 1) },
        `i = ${i + 1}. The next probe is slot ${(home(k) + i + 1) % M} — one along, wrapping at the end of the table.`,
      );
    }
  }

  /**
   * HASH-SEARCH(T, k) — the same probe sequence, stopping at the key or at
   * the first NIL. Returns the slot, or null.
   */
  function search(k: number, opening: string): number | null {
    emit('HASH-SEARCH', 1, cells(), { ...marks(k, null), aux: chips(k, 0) }, opening);

    for (let i = 0; i < M; i++) {
      const q = probe(k, i);
      emit(
        'HASH-SEARCH',
        3,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i) },
        `q = h(${k}, ${i}) = ${q}. A search must retrace the probe sequence the insert took.`,
      );

      stats.comparisons++;
      const here = T[q]!;
      if (here === k) {
        emit(
          'HASH-SEARCH',
          5,
          cells(),
          {
            ...marks(k, q),
            look: slotId(q),
            aux: chips(k, i),
            searchResult: { key: k, found: true },
          },
          `T[${q}] = ${k}. Return the slot — found after ${i + 1} probe${i === 0 ? '' : 's'}.`,
        );
        return q;
      }

      emit(
        'HASH-SEARCH',
        4,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i) },
        here === null
          ? `T[${q}] is empty, so it is not ${k}.`
          : `T[${q}] holds ${here === DELETED ? 'a deleted key' : here}, not ${k}.`,
      );
      emit(
        'HASH-SEARCH',
        6,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i + 1) },
        `i = ${i + 1}. q is still ${q} — it is only reassigned when line 3 runs again.`,
      );

      if (here === null) {
        emit(
          'HASH-SEARCH',
          7,
          cells(),
          { ...marks(k, q), look: slotId(q), aux: chips(k, i + 1) },
          `T[${q}] is NIL, so the loop ends. Nothing beyond an empty slot can belong to ${k}'s sequence.`,
        );
        emit(
          'HASH-SEARCH',
          8,
          cells(),
          { ...marks(k, q), aux: chips(k, i + 1), searchResult: { key: k, found: false } },
          `Return NIL: ${k} is not in the table, and only ${i + 1} slot${i === 0 ? '' : 's'} had to be looked at.`,
        );
        return null;
      }

      emit(
        'HASH-SEARCH',
        7,
        cells(),
        { ...marks(k, q), look: slotId(q), aux: chips(k, i + 1) },
        here === DELETED
          ? `T[${q}] is DELETED, which is not NIL — so the loop carries on. This is the whole reason the tombstone exists.`
          : `T[${q}] is neither NIL nor ${k}, so the loop carries on down the sequence.`,
      );
    }
    return null;
  }

  /** Deletion, as §11.4 describes it: find the key, then tombstone its slot. */
  function remove(k: number): void {
    const q = search(k, `HASH-DELETE(T, ${k}) starts by finding it, exactly as a search would.`);
    emit(
      'HASH-DELETE',
      1,
      cells(),
      { ...marks(k, q), ...(q === null ? {} : { look: slotId(q) }), aux: chips(k, 0) },
      q === null ? `HASH-SEARCH returned NIL.` : `HASH-SEARCH returned q = ${q}.`,
    );
    if (q === null) return;

    emit(
      'HASH-DELETE',
      2,
      cells(),
      { ...marks(k, q), look: slotId(q), aux: chips(k, 0) },
      `q ≠ NIL, so there is a slot to empty.`,
    );

    T[q] = DELETED;
    graves.push(slotId(q));
    stats.writes++;
    emit(
      'HASH-DELETE',
      3,
      cells(),
      { ...marks(k, q), move: slotId(q), aux: chips(k, 0) },
      `T[${q}] = DELETED, not NIL. A NIL here would cut every probe sequence that runs through this slot.`,
    );
  }

  for (const k of input) insert(k);

  if (input.length === 0) {
    emit(
      'HASH-INSERT',
      1,
      cells(),
      { aux: chips(0, 0) },
      `An empty table: all ${M} slots are NIL.`,
    );
    return { steps, output: { slots: M, inserted: 0 } };
  }

  const pair = demoPair(input);
  const probed = pair?.probed ?? input[0]!;
  const blocker = pair?.blocker ?? input[0]!;

  search(
    probed,
    `HASH-SEARCH(T, ${probed}). It starts where an insert would: i = 0, at slot ${home(probed)}.`,
  );
  remove(blocker);
  search(
    probed,
    probed === blocker
      ? `HASH-SEARCH(T, ${probed}) again, now that it has been deleted. Watch where the walk stops.`
      : `HASH-SEARCH(T, ${probed}) again, now that ${blocker} has been deleted from its path.`,
  );
  search(
    missingKey(input),
    `HASH-SEARCH(T, ${missingKey(input)}) — a key that was never inserted.`,
  );

  return {
    steps,
    output: { slots: M, inserted: input.length, deleted: blocker, probed },
  };
}

/**
 * Distinct keys, few enough that the table never fills, and with at least one
 * collision — a probe sequence of length 1 every time would demonstrate
 * nothing the direct-address table in §11.1 does not already do.
 */
function generate(n: number): number[] {
  const size = Math.max(1, Math.min(n, M - 2));
  const pool = Array.from({ length: 90 }, (_, i) => i + 10);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const keys = pool.slice(0, size);
  if (size >= 2 && new Set(keys.map(home)).size === keys.length) {
    // No collision came up by chance, so arrange one: the last key asks for
    // the slot the first one is already in.
    const wanted = pool.find((k) => home(k) === home(keys[0]!) && !keys.includes(k));
    if (wanted !== undefined) keys[keys.length - 1] = wanted;
  }
  return keys;
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one key.' };
  if (parts.length > M - 2) {
    return {
      error: `At most ${M - 2} keys — the table has ${M} slots, and a full one has nowhere to put the next key.`,
    };
  }

  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    if (values.includes(v)) {
      return {
        error: `${v} appears twice. Open addressing stores each key once, so a repeat has no slot of its own.`,
      };
    }
    values.push(v);
  }
  return { value: values };
}

export const openAddressing: AlgorithmModule = {
  id: 'open-addressing',
  name: 'Open Addressing (Linear Probing)',
  visualizer: 'cells',
  aux: [
    {
      key: 'probe',
      label: 'probe',
      hint: 'the key this operation names, and how far down its probe sequence it has got',
    },
  ],
  procOrder: ['HASH-INSERT', 'HASH-SEARCH', 'HASH-DELETE'],
  procedures: {
    'HASH-INSERT': {
      title: 'HASH-INSERT(T, k)',
      indent: [0, 0, 1, 1, 2, 2, 1, 0, 0],
      lines: [
        'i = 0',
        'repeat',
        'q = h(k, i)',
        'if T[q] == NIL',
        'T[q] = k',
        'return q',
        'else i = i + 1',
        'until i == m',
        'error "hash table overflow"',
      ],
    },
    'HASH-SEARCH': {
      title: 'HASH-SEARCH(T, k)',
      indent: [0, 0, 1, 1, 2, 1, 0, 0],
      lines: [
        'i = 0',
        'repeat',
        'q = h(k, i)',
        'if T[q] == k',
        'return q',
        'i = i + 1',
        'until T[q] == NIL or i == m',
        'return NIL',
      ],
    },
    // §11.4 gives deletion in prose rather than pseudocode: find the key and
    // write DELETED into its slot instead of NIL. Written out here so the
    // player has a line to point at, and so the tombstone is a step of its own.
    'HASH-DELETE': {
      title: 'HASH-DELETE(T, k)',
      indent: [0, 0, 1],
      lines: ['q = HASH-SEARCH(T, k)', 'if q ≠ NIL', 'T[q] = DELETED'],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'O(1/(1 − α))',
    worst: 'Θ(n)',
    space: 'Θ(m)',
    extra: [
      ['Unsuccessful search', 'at most 1/(1 − α) probes'],
      ['Successful search', 'at most (1/α) ln(1/(1 − α))'],
      ['Load factor', 'α = n/m, and never above 1'],
      ['Probe sequence', 'h(k, i) = (h′(k) + i) mod m — linear'],
      ['Cost of linear', 'primary clustering: long runs get longer'],
      ['Assumes', 'independent uniform permutation hashing'],
      ['This table', 'm = 11, h′(k) = k mod 11'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: M - 2,
    noun: 'table',
    placeholder: '25, 12, 36, 47, 8',
    note: 'distinct keys, inserted left to right',
    label: 'The keys to insert, in order, separated by commas',
    generate,
    parse,
  },
  defaultSize: 7,
  result: {
    // No array to sort, permute or preserve — the claim is about where linear
    // probing puts the keys, which is checked here against a second, simpler
    // implementation rather than against the recorder's own arithmetic.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      if (input.length === 0) return null;

      const searches: Array<{ key: number; found: boolean }> = [];
      for (const step of trace.steps) {
        const result = (step.hi as { searchResult?: { key: number; found: boolean } }).searchResult;
        if (result) searches.push(result);
      }
      if (searches.length !== 4) return `recorded ${searches.length} searches, expected 4`;

      const pair = demoPair(input);
      const probed = pair?.probed ?? input[0]!;
      const blocker = pair?.blocker ?? input[0]!;

      if (!searches[0]!.found) return `HASH-SEARCH missed ${probed}, which had been inserted`;
      if (!searches[1]!.found) return `HASH-DELETE could not find ${blocker} to delete it`;
      // The point of the whole section: a tombstone must not end a probe
      // sequence that runs through it.
      if (searches[2]!.found !== (probed !== blocker)) {
        return probed === blocker
          ? `${probed} is still found after being deleted`
          : `${probed} went missing when ${blocker} was deleted — a DELETED slot must not stop a search`;
      }
      if (searches[3]!.found) return `HASH-SEARCH found a key that was never inserted`;

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'cells') return 'the last step carries no cells snapshot';
      const held = last.data.rows[0]!.cells.map((c) => c.value);
      if (held.length !== M) return `the table has ${held.length} slots, expected ${M}`;

      const at = place(input);
      for (let q = 0; q < M; q++) {
        const key = input.find((k) => at.get(k) === q) ?? null;
        const expected = key === null ? null : key === blocker ? DELETED : key;
        if (held[q] !== expected) {
          return `T[${q}] holds ${JSON.stringify(held[q])}, expected ${JSON.stringify(expected)}`;
        }
      }
      return null;
    },
  },
  record,
};
