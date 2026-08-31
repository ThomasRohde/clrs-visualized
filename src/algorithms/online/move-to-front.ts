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
 * MAINTAINING A SEARCH LIST — CLRS §27.2.
 *
 * A linked list holding a set, searched by walking it from the front. Finding
 * the item in position i costs i. You do not know what will be asked for
 * next. **How should the list be ordered?**
 *
 * If you knew the whole request sequence in advance the answer is easy: sort
 * by how often each item is asked for. The point of the chapter is that you
 * do not, and the question is what to do anyway.
 *
 * **MOVE-TO-FRONT.** After each access, move the item you just found to the
 * front of the list. That is the entire algorithm — no counters, no
 * statistics, no memory beyond the list itself.
 *
 * It looks far too crude to be good, and it is **4-competitive**: on any
 * request sequence at all, its total cost is within a constant factor of what
 * the best possible *offline* algorithm — one that saw the whole sequence
 * first — would have paid. That is the shape of every result in this chapter,
 * and it is a different kind of guarantee from the rest of the book. Not "this
 * is optimal", but "**not knowing the future costs you at most a constant
 * factor**".
 *
 * The proof is a potential-function argument, exactly like chapter 16's. The
 * potential is the number of pairs the two lists disagree about, and each
 * access is charged its amortised cost rather than its real one.
 *
 * Watch the bracket. Its width is what the access cost, and move-to-front is
 * betting that an item asked for once will be asked for again soon — which is
 * **locality of reference**, the same assumption every cache in the world is
 * built on. When it holds, the bracket stays narrow. When the requests are
 * uniformly random, it does not, and nothing else would do better either.
 */

export function record(input: number[]): Trace {
  // The first `size` entries are the list, the rest are the request sequence.
  const size = input[0]!;
  const initial = input.slice(1, 1 + size);
  const requests = input.slice(1 + size);

  let list = [...initial];
  const { steps, stats, emit } = createRecorder();
  let cost = 0;
  /** Where each request was found, for the verify to re-check. */
  const found: number[] = [];

  const item = (v: number) => `item${v}`;
  const req = (i: number) => `req${i}`;

  function snapshot(): CellsData {
    return {
      kind: 'cells',
      rows: [
        { label: 'L', cells: list.map((v): Cell => ({ id: item(v), value: v })) },
        {
          label: 'σ',
          cells: requests.map((v, i): Cell => ({ id: req(i), value: v, label: i + 1 })),
        },
      ],
    };
  }

  const served = (upto: number): string[] => Array.from({ length: upto }, (_, i) => req(i));
  const chips = () => auxOf([null, cost], 1, [null, 'total cost']);

  emit(
    'MOVE-TO-FRONT',
    1,
    snapshot(),
    { aux: { cost: chips() } },
    `A list of ${size}, and ${requests.length} requests to come. Finding position i costs i.`,
  );

  requests.forEach((want, r) => {
    const at = list.indexOf(want);
    const walked = list.slice(0, at + 1).map(item);
    cost += at + 1;
    found.push(at + 1);
    stats.comparisons += at + 1;

    emit(
      'MOVE-TO-FRONT',
      2,
      snapshot(),
      {
        done: served(r),
        mark: req(r),
        look: walked,
        scope: walked,
        scopeLabel: `${at + 1} step${at === 0 ? '' : 's'} to reach ${want}`,
        // No `x` marker on this step: the cells renderer hangs markers above the
        // first row, which is exactly where the bracket's caption goes, and the
        // caption already names the item.
        aux: { cost: chips() },
      },
      at === 0
        ? `${want} is already at the front: cost 1, the cheapest an access can be.`
        : `${want} is in position ${at + 1}, so the walk costs ${at + 1}. Running total ${cost}.`,
    );

    if (at === 0) return;
    list = [want, ...list.filter((v) => v !== want)];
    stats.writes++;
    emit(
      'MOVE-TO-FRONT',
      3,
      snapshot(),
      {
        done: served(r + 1),
        move: item(want),
        pointers: { x: item(want) },
        aux: { cost: chips() },
      },
      `Move ${want} to the front. Everything else keeps its order, and the next ask for ${want} costs 1.`,
    );
  });

  emit(
    'MOVE-TO-FRONT',
    3,
    snapshot(),
    {
      done: served(requests.length),
      order: [...list],
      cost,
      positions: [...found],
      aux: { cost: chips() },
    },
    `Total cost ${cost} for ${requests.length} accesses — an average of ${(cost / requests.length).toFixed(1)} per access.`,
  );

  return { steps, output: { cost, accesses: requests.length } };
}

/**
 * Three claims, and the third is the chapter's theorem.
 *
 * The list stays a permutation and each reported cost is the position the
 * item was actually in — both recomputed from the recorded snapshots rather
 * than from the algorithm's own counters. Then the competitive bound: the
 * best **offline** cost is computed exactly, by dynamic programming over
 * every reachable list order, and move-to-front is required to stay inside
 * four times it. That optimum knows the whole request sequence in advance and
 * shares no code with move-to-front, which is what makes the comparison mean
 * anything.
 */
function verify(input: number[], trace: Trace): string | null {
  const size = input[0]!;
  const initial = input.slice(1, 1 + size);
  const requests = input.slice(1 + size);

  const hi = trace.steps.at(-1)!.hi as {
    order?: number[];
    cost?: number;
    positions?: number[];
  };
  if (!hi.order || hi.cost === undefined || !hi.positions) return 'the run reported no result';

  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  if (JSON.stringify(sorted(hi.order)) !== JSON.stringify(sorted(initial))) {
    return 'the list is no longer a permutation of what it started as';
  }
  if (hi.positions.reduce((a, b) => a + b, 0) !== hi.cost) {
    return `the reported cost ${hi.cost} is not the sum of the positions searched`;
  }

  // Every snapshot must show the accessed item at the front afterwards, with
  // everything else in its original relative order — the definition of the
  // move, checked against the trace rather than by repeating it.
  let expected = [...initial];
  for (let r = 0; r < requests.length; r++) {
    const want = requests[r]!;
    const at = expected.indexOf(want);
    if (at < 0) return `${want} was requested but is not in the list`;
    if (hi.positions[r] !== at + 1) {
      return `request ${r + 1} was charged ${hi.positions[r]}, but ${want} was in position ${at + 1}`;
    }
    expected = [want, ...expected.filter((v) => v !== want)];
  }
  if (JSON.stringify(expected) !== JSON.stringify(hi.order)) {
    return `the final order is ${hi.order.join(',')}, but the moves give ${expected.join(',')}`;
  }

  // The offline optimum, exactly: after paying to reach the item, an offline
  // algorithm may move it any distance towards the front for free — the same
  // freedom move-to-front has. Dynamic programming over permutations.
  const key = (a: number[]) => a.join(',');
  let best = new Map<string, number>([[key(initial), 0]]);
  for (const want of requests) {
    const next = new Map<string, number>();
    for (const [state, sofar] of best) {
      const order = state.split(',').map(Number);
      const at = order.indexOf(want);
      const paid = sofar + at + 1;
      const rest = order.filter((v) => v !== want);
      for (let to = 0; to <= at; to++) {
        const moved = [...rest.slice(0, to), want, ...rest.slice(to)];
        const k = key(moved);
        if (!next.has(k) || next.get(k)! > paid) next.set(k, paid);
      }
    }
    best = next;
  }
  const optimum = Math.min(...best.values());
  if (hi.cost > 4 * optimum) {
    return `move-to-front cost ${hi.cost}, over four times the offline optimum of ${optimum}`;
  }
  return null;
}

/**
 * Requests with locality, because that is what the algorithm is for.
 *
 * Uniformly random requests make every ordering equally good and the run says
 * nothing; a sequence that revisits recent items is what move-to-front is
 * betting on, and is also what real access patterns look like.
 */
function generate(n: number): number[] {
  const size = 5;
  const list = Array.from({ length: size }, (_, i) => i + 1);
  const length = Math.max(3, Math.min(n, 12));
  const requests: number[] = [];
  for (let i = 0; i < length; i++) {
    // Two times in three, ask again for something recent.
    const recent = requests.length > 0 && Math.random() < 0.62;
    requests.push(
      recent
        ? requests[Math.max(0, requests.length - 1 - Math.floor(Math.random() * 2))]!
        : list[Math.floor(Math.random() * size)]!,
    );
  }
  return [size, ...list, ...requests];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2) return { error: 'Give the requests, as numbers from 1 to 5.' };
  const requests: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return { error: `"${part}" is not one of the list items, 1 to 5.` };
    }
    requests.push(v);
  }
  if (requests.length > 14) return { error: 'At most 14 requests — the row stops fitting.' };
  return { value: [5, 1, 2, 3, 4, 5, ...requests] };
}

export const moveToFront: AlgorithmModule = {
  id: 'move-to-front',
  name: 'Move-to-Front',
  visualizer: 'cells',
  aux: [{ key: 'cost', label: 'cost', hint: 'the total paid so far, in list positions' }],
  procOrder: ['MOVE-TO-FRONT'],
  procedures: {
    // A transcription of §27.2's prose: the book develops list maintenance and
    // its competitive analysis in words rather than as a numbered procedure.
    'MOVE-TO-FRONT': {
      title: 'MOVE-TO-FRONT(L, σ)',
      indent: [0, 1, 1],
      lines: [
        'for each request x in σ',
        'walk L from the front to x, paying its position',
        'move x to the front of L',
      ],
    },
  },
  complexity: {
    best: 'Θ(1) per access',
    average: 'Θ(n) per access',
    worst: 'Θ(n) per access',
    space: 'Θ(1) extra',
    extra: [
      ['Competitive ratio', '4 — within a constant of the best offline ordering'],
      ['What it remembers', 'nothing beyond the list itself'],
      ['The assumption it bets on', 'locality: what was asked for will be asked for again'],
      ['Proved by', 'a potential function, exactly as in chapter 16'],
      ['With the sequence known in advance', 'sort by frequency, and be done'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 14,
    noun: 'sequence',
    placeholder: '4, 2, 4, 4, 1, 2',
    note: 'the list starts 1..5; type the requests',
    label: 'The sequence of requested items, separated by commas',
    generate,
    parse,
    size: (value: number[]) => value.length - 1 - value[0]!,
  },
  defaultSize: 9,
  result: { kind: 'transforms', verify },
  record,
};
