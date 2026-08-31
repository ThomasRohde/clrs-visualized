import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type Cell,
  type CellsData,
  type Highlight,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * LINKED LIST — CLRS §10.2: LIST-SEARCH, LIST-PREPEND and LIST-DELETE on a
 * doubly linked list.
 *
 * The point of the chapter is that the order lives in the pointers, so the
 * drawing has to be arranged the other way round from every array on the
 * site: **the boxes sit where the objects were allocated and never move**,
 * and the arcs underneath are the only thing that says what order the list is
 * in. That is what makes the two interesting operations legible. `LIST-DELETE`
 * leaves its object exactly where it was and reroutes two arrows around it;
 * `LIST-PREPEND` puts a brand-new object in the last free slot, at the far
 * right, and one arrow reaching back across the whole row makes it the front
 * of the list. Neither moves anything, which is precisely the claim.
 *
 * The run is a script, in the order the reader needs to see it:
 *
 *   1. LIST-SEARCH for a key near the far end — the walk that costs Θ(n).
 *   2. LIST-DELETE of the object that search returned — the splice.
 *   3. LIST-PREPEND of a key that was never in the list — the new front.
 *   4. LIST-SEARCH for the deleted key again, which now runs off the end.
 *
 * Step 4 is the proof that step 2 worked, and it is why the keys have to be
 * distinct: `LIST-SEARCH` returns the first match, so a repeated key could
 * survive its own deletion.
 */

/**
 * One object in the list, plus where it is on screen.
 *
 * `next`/`prev` are `undefined` before `LIST-PREPEND` assigns them and `null`
 * for NIL, a distinction the renderer draws — nothing at all versus a labelled
 * terminator. `removed` is the object `LIST-DELETE` spliced out: still in its
 * slot, no longer reachable, and drawn without arcs because the pointers it
 * still holds are stale.
 */
interface ListNode {
  id: string;
  key: number;
  next?: string | null;
  prev?: string | null;
  removed: boolean;
}

/** Slot `i` is drawn at position `i`, whether or not an object lives there. */
function slotId(i: number): string {
  return `x${i + 1}`;
}

/**
 * The row of slots.
 *
 * Its length never changes during a run — the free slot `LIST-PREPEND` will
 * use is drawn as an empty box from the first frame. A row that grew would
 * rescale every cell mid-trace, and the reader would read the rescaling as
 * something the algorithm did.
 */
function snapshot(slots: Array<ListNode | null>): CellsData {
  return {
    kind: 'cells',
    rows: [
      {
        label: 'L',
        cells: slots.map((node, i) => {
          if (!node) return { id: slotId(i), value: null };
          const cell: Cell = { id: node.id, value: node.key, label: node.id };
          if (!node.removed) {
            if (node.next !== undefined) cell.next = node.next;
            if (node.prev !== undefined) cell.prev = node.prev;
          }
          return cell;
        }),
      },
    ],
  };
}

/**
 * Which key the script searches for and then deletes: the last but one, so
 * the walk is nearly the whole list *and* the object has a neighbour on both
 * sides, which is the only case where every line of LIST-DELETE runs. Short
 * lists fall back to the head, whose `prev` is NIL — the other branch.
 */
export function targetIndex(n: number): number {
  return Math.max(0, n - 2);
}

/** A key that is certainly not in the list, for the prepend. */
export function freshKey(values: number[]): number {
  return values.length === 0 ? 1 : Math.max(...values) + 1;
}

export function record(input: number[]): Trace {
  const n = input.length;

  // The list starts out already linked, front to back in allocation order,
  // with one free slot on the end for the prepend.
  const slots: Array<ListNode | null> = Array.from({ length: n + 1 }, (_, i) =>
    i < n
      ? {
          id: slotId(i),
          key: input[i]!,
          next: i + 1 < n ? slotId(i + 1) : null,
          prev: i > 0 ? slotId(i - 1) : null,
          removed: false,
        }
      : null,
  );
  const byId = new Map<string, ListNode>();
  for (const node of slots) if (node) byId.set(node.id, node);
  const node = (id: string) => byId.get(id)!;

  let head: string | null = n > 0 ? slotId(0) : null;

  const { steps, stats, emit: emitStep } = createRecorder();

  /**
   * Objects `LIST-DELETE` has spliced out.
   *
   * They stay marked for the rest of the run rather than only on the step
   * that removed them: an object outside the list is outside it forever, and
   * a cell that quietly rejoined the palette two steps later would undo the
   * whole point of leaving it in its slot.
   */
  const spliced: string[] = [];
  const emit = (proc: string, line: number, data: CellsData, hi: Highlight, note: string): void =>
    emitStep(proc, line, data, spliced.length ? { ...hi, done: [...spliced] } : hi, note);

  const cells = () => snapshot(slots);
  /** `L.head` is drawn as a marker, so it is never guessed from the arcs. */
  const headPtr = (): Record<string, string> => (head ? { 'L.head': head } : {});
  /** The key the current operation names, held in the strip above the row. */
  const keyChip = (k: number) => ({ k: auxOf([null, k], 1) });

  /**
   * LIST-SEARCH(L, k) — walk from the head until the key turns up or the
   * pointers run out. Returns the object found, or null.
   */
  function listSearch(k: number, opening: string): string | null {
    const ptrs = (x: string | null) => ({ ...headPtr(), ...(x ? { x } : {}) });
    let x = head;
    let walked = 0;

    emit(
      'LIST-SEARCH',
      1,
      cells(),
      { pointers: ptrs(x), mark: head ?? '', look: x ?? '', aux: keyChip(k) },
      opening,
    );

    for (;;) {
      stats.comparisons++;
      if (x === null) {
        emit(
          'LIST-SEARCH',
          2,
          cells(),
          { pointers: ptrs(x), mark: head ?? '', aux: keyChip(k) },
          `x is NIL. The walk ran off the end of the list without meeting ${k}.`,
        );
        break;
      }

      const cur = node(x);
      if (cur.key === k) {
        emit(
          'LIST-SEARCH',
          2,
          cells(),
          { pointers: ptrs(x), mark: head ?? '', look: x, aux: keyChip(k) },
          `${x}.key = ${k}, so the test fails and the loop stops. This is the object.`,
        );
        break;
      }

      emit(
        'LIST-SEARCH',
        2,
        cells(),
        {
          pointers: ptrs(x),
          mark: head ?? '',
          look: x,
          links: { [`${x}.next`]: 'look' },
          aux: keyChip(k),
        },
        `${x}.key = ${cur.key}, not ${k}. Neither test fails, so the walk goes on.`,
      );

      const from = x;
      x = cur.next ?? null;
      walked++;
      emit(
        'LIST-SEARCH',
        3,
        cells(),
        {
          pointers: ptrs(x),
          mark: head ?? '',
          look: x ?? '',
          links: { [`${from}.next`]: 'look' },
          aux: keyChip(k),
        },
        x === null
          ? `x = ${from}.next = NIL. ${from} was the last object in the list.`
          : `x = ${from}.next = ${x}. The walk follows the arrow, not the row.`,
      );
    }

    emit(
      'LIST-SEARCH',
      4,
      cells(),
      {
        pointers: ptrs(x),
        mark: head ?? '',
        ...(x ? { look: x } : {}),
        searchResult: { key: k, found: x !== null },
        aux: keyChip(k),
      },
      x === null
        ? `Return NIL: no object in the list holds ${k}.`
        : walked === 0
          ? `Return ${x}. It was the front of the list, so the walk never left the head.`
          : `Return ${x}. Reaching it meant following ${walked} pointer${walked === 1 ? '' : 's'} — Θ(n).`,
    );
    return x;
  }

  /**
   * LIST-DELETE(L, x) — given the object itself, splice it out. Two
   * assignments and no loop, which is the whole argument for `prev`.
   */
  function listDelete(id: string): void {
    const x = node(id);
    const ptrs = () => ({ ...headPtr(), x: id });
    const k = x.key;
    // Line 4 always runs, so it is the floor; only line 5 can move it on.
    let lastLine = 4;

    stats.comparisons++;
    emit(
      'LIST-DELETE',
      1,
      cells(),
      {
        pointers: ptrs(),
        mark: head ?? '',
        look: x.prev ? [id, x.prev] : id,
        ...(x.prev ? { links: { [`${id}.prev`]: 'look' } } : {}),
        aux: keyChip(k),
      },
      x.prev
        ? `${id}.prev is ${x.prev}, not NIL — and holding it is what makes this Θ(1).`
        : `${id}.prev is NIL: ${id} is the front of the list, so nothing points at it.`,
    );

    if (x.prev != null) {
      const before = node(x.prev);
      before.next = x.next;
      stats.writes++;
      emit(
        'LIST-DELETE',
        2,
        cells(),
        {
          pointers: ptrs(),
          mark: head ?? '',
          move: before.id,
          links: { [`${before.id}.next`]: 'move' },
          aux: keyChip(k),
        },
        `${before.id}.next = ${id}.next. The forward arrow now runs straight past ${id}.`,
      );
    } else {
      head = x.next ?? null;
      stats.writes++;
      emit(
        'LIST-DELETE',
        3,
        cells(),
        {
          pointers: ptrs(),
          mark: head ?? '',
          ...(head ? { move: head } : {}),
          aux: keyChip(k),
        },
        head
          ? `L.head = ${id}.next = ${head}. The front of the list moved along one.`
          : `L.head = NIL. ${id} was the only object, so the list is now empty.`,
      );
    }

    stats.comparisons++;
    emit(
      'LIST-DELETE',
      4,
      cells(),
      {
        pointers: ptrs(),
        mark: head ?? '',
        ...(x.next ? { look: [id, x.next], links: { [`${id}.next`]: 'look' } } : {}),
        aux: keyChip(k),
      },
      x.next
        ? `${id}.next is ${x.next}, not NIL, so that object's back pointer needs fixing too.`
        : `${id}.next is NIL: ${id} was the last object, so there is no back pointer to fix.`,
    );

    if (x.next != null) {
      const after = node(x.next);
      after.prev = x.prev;
      stats.writes++;
      lastLine = 5;
      emit(
        'LIST-DELETE',
        5,
        cells(),
        {
          pointers: ptrs(),
          mark: head ?? '',
          move: after.id,
          links: { [`${after.id}.prev`]: 'move' },
          aux: keyChip(k),
        },
        `${after.id}.prev = ${id}.prev. The back arrow skips ${id} as well — two writes, no loop.`,
      );
    }

    x.removed = true;
    spliced.push(id);
    emit(
      'LIST-DELETE',
      lastLine,
      cells(),
      { pointers: headPtr(), mark: head ?? '', aux: keyChip(k) },
      `Nothing in the list points at ${id} any more. Its own two pointers are stale now, so they stop being drawn.`,
    );
  }

  /**
   * LIST-PREPEND(L, x) — splice a brand-new object in at the front.
   *
   * The object is allocated first, in the free slot at the end of the row,
   * because the procedure takes an object rather than a key: it is handed
   * something that already exists and is in no list.
   */
  function listPrepend(key: number, slot: number): void {
    const id = slotId(slot);
    const fresh: ListNode = { id, key, removed: false };
    slots[slot] = fresh;
    byId.set(id, fresh);

    emit(
      'LIST-PREPEND',
      1,
      cells(),
      { pointers: headPtr(), mark: head ?? '', move: id, aux: keyChip(key) },
      `A new object ${id} holding ${key} takes the free slot. It is in memory, not in the list.`,
    );

    const oldHead = head;
    fresh.next = oldHead;
    stats.writes++;
    emit(
      'LIST-PREPEND',
      1,
      cells(),
      {
        pointers: headPtr(),
        mark: head ?? '',
        move: id,
        links: { [`${id}.next`]: 'move' },
        aux: keyChip(key),
      },
      oldHead
        ? `${id}.next = L.head = ${oldHead}. One arrow, reaching right back across the row.`
        : `${id}.next = L.head = NIL. The list was empty, so there is nothing ahead of it.`,
    );

    fresh.prev = null;
    stats.writes++;
    emit(
      'LIST-PREPEND',
      2,
      cells(),
      {
        pointers: headPtr(),
        mark: head ?? '',
        move: id,
        links: { [`${id}.prev`]: 'move' },
        aux: keyChip(key),
      },
      `${id}.prev = NIL. Nothing comes before the front of a list.`,
    );

    stats.comparisons++;
    emit(
      'LIST-PREPEND',
      3,
      cells(),
      {
        pointers: headPtr(),
        mark: head ?? '',
        ...(oldHead ? { look: oldHead } : {}),
        aux: keyChip(key),
      },
      oldHead
        ? `L.head is ${oldHead}, not NIL, so the old front needs a back pointer to ${id}.`
        : `L.head is NIL, so line 4 is skipped: there is no old front to point back.`,
    );

    if (oldHead != null) {
      node(oldHead).prev = id;
      stats.writes++;
      emit(
        'LIST-PREPEND',
        4,
        cells(),
        {
          pointers: headPtr(),
          move: oldHead,
          links: { [`${oldHead}.prev`]: 'move' },
          aux: keyChip(key),
        },
        `${oldHead}.prev = ${id}. The old front now points back at the new one.`,
      );
    }

    head = id;
    stats.writes++;
    emit(
      'LIST-PREPEND',
      5,
      cells(),
      { pointers: headPtr(), move: id, aux: keyChip(key) },
      `L.head = ${id}. It is the front of the list, and not one existing object moved.`,
    );
  }

  const cut = targetIndex(n);
  const k = input[cut] ?? 0;

  const found = listSearch(
    k,
    `The boxes sit where the objects were allocated; the arrows are the order. x = L.head.`,
  );
  if (found) listDelete(found);
  listPrepend(freshKey(input), n);
  listSearch(k, `LIST-SEARCH(L, ${k}) again — the key just deleted. x = L.head, now ${head}.`);

  return { steps, output: { deleted: k, prepended: freshKey(input) } };
}

/** Distinct keys, so LIST-SEARCH's "first match" can never hide an object. */
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
  if (parts.length > 14) return { error: 'At most 14 keys — the row of slots has to fit.' };

  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 0 || v > 999) {
      return { error: `"${part}" is not a whole number between 0 and 999.` };
    }
    if (values.includes(v)) {
      return {
        error: `${v} appears twice. Keys must be distinct — LIST-SEARCH returns the first match, so a repeat would hide an object.`,
      };
    }
    values.push(v);
  }
  return { value: values };
}

export const linkedList: AlgorithmModule = {
  id: 'linked-list',
  name: 'Doubly Linked List (SEARCH, PREPEND, DELETE)',
  visualizer: 'cells',
  aux: [{ key: 'k', label: 'k', hint: 'the key the current operation names' }],
  procOrder: ['LIST-SEARCH', 'LIST-PREPEND', 'LIST-DELETE'],
  procedures: {
    'LIST-SEARCH': {
      title: 'LIST-SEARCH(L, k)',
      indent: [0, 0, 1, 0],
      lines: ['x = L.head', 'while x ≠ NIL and x.key ≠ k', 'x = x.next', 'return x'],
    },
    'LIST-PREPEND': {
      title: 'LIST-PREPEND(L, x)',
      indent: [0, 0, 0, 1, 0],
      lines: [
        'x.next = L.head',
        'x.prev = NIL',
        'if L.head ≠ NIL',
        'L.head.prev = x',
        'L.head = x',
      ],
    },
    'LIST-DELETE': {
      title: 'LIST-DELETE(L, x)',
      indent: [0, 1, 0, 0, 1],
      lines: [
        'if x.prev ≠ NIL',
        'x.prev.next = x.next',
        'else L.head = x.next',
        'if x.next ≠ NIL',
        'x.next.prev = x.prev',
      ],
    },
  },
  complexity: {
    best: 'Θ(1)',
    average: 'Θ(n)',
    worst: 'Θ(n)',
    space: 'Θ(n)',
    extra: [
      ['LIST-SEARCH', 'Θ(n)'],
      ['LIST-PREPEND', 'Θ(1)'],
      ['LIST-DELETE', 'Θ(1) — given the object'],
      ['Delete by key', 'Θ(n) — LIST-SEARCH first'],
      ['Cost of prev', 'one word per object'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 12,
    noun: 'list',
    placeholder: '31, 4, 59, 26',
    note: 'distinct keys, front to back',
    label: 'The keys in the list, front to back, separated by commas',
    generate,
    parse,
  },
  defaultSize: 8,
  result: {
    // Nothing here sorts, permutes or preserves an array: there is no array.
    // What must hold is that the searches answered correctly and that the
    // list the pointers describe at the end is the one the script asked for.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const searches: Array<{ key: number; found: boolean }> = [];
      for (const step of trace.steps) {
        const found = (step.hi as { searchResult?: { key: number; found: boolean } }).searchResult;
        if (found) searches.push(found);
      }
      if (searches.length !== 2) return `recorded ${searches.length} searches, expected 2`;
      if (!searches[0]!.found) {
        return `LIST-SEARCH missed ${searches[0]!.key}, which was in the list`;
      }
      if (searches[1]!.found) {
        return `LIST-SEARCH still finds ${searches[1]!.key} after LIST-DELETE removed it`;
      }

      const last = trace.steps.at(-1)!;
      if (last.data?.kind !== 'cells') return 'the last step carries no cells snapshot';
      const cells = new Map(last.data.rows[0]!.cells.map((c) => [c.id, c]));
      const head = (last.hi as { pointers?: Record<string, string> }).pointers?.['L.head'] ?? null;

      // Walk the list the pointers actually describe, checking the back
      // pointers against it: a `prev` that disagrees with `next` is a broken
      // list that reads perfectly well in one direction.
      const order: number[] = [];
      let at: string | null = head;
      let behind: string | null = null;
      while (at) {
        const cell = cells.get(at);
        if (!cell) return `the chain from L.head reached ${at}, which is in no slot`;
        if ((cell.prev ?? null) !== behind) {
          return `${at}.prev is ${cell.prev ?? 'NIL'} but ${behind ?? 'NIL'} points at it`;
        }
        order.push(cell.value as number);
        if (order.length > cells.size) return 'the list runs in a cycle';
        behind = at;
        at = cell.next ?? null;
      }

      const expected = [
        freshKey(input),
        ...input.filter((_, i) => i !== targetIndex(input.length)),
      ];
      if (JSON.stringify(order) !== JSON.stringify(expected)) {
        return `the list ends as ${JSON.stringify(order)}, expected ${JSON.stringify(expected)}`;
      }
      return null;
    },
  },
  record,
};
