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
 * ONLINE CACHING — CLRS §27.3.
 *
 * The same problem chapter 15 solved, with the future taken away.
 *
 * §15.4 evicted the block **whose next request is furthest in the future**,
 * and proved that unbeatable. It is also unimplementable: no real cache knows
 * what will be asked for next. This section asks what to do instead, and how
 * much not knowing costs.
 *
 * **Least-recently-used** is the answer everything actually runs. Evict the
 * block that has gone longest without being asked for — which is the
 * backwards-looking guess at the forward-looking rule, and rests on the same
 * assumption as §27.2's list: what was used recently will be used again.
 *
 * **LRU is k-competitive**, where k is the size of the cache: it never suffers
 * more than about k times the misses the optimal offline algorithm would. And
 * that is the best any deterministic online algorithm can do — for every
 * deterministic policy there is a sequence forcing exactly that ratio, which
 * is proved by the simplest adversary in the book: **always ask for the block
 * the algorithm just threw out**.
 *
 * The bracket in this run points *backwards*, over the requests already
 * served, where chapter 15's pointed forwards. That is the whole difference
 * between the two chapters in one mark.
 *
 * Run them on the same sequence and compare the miss counts. LRU is usually
 * close and never far, and the gap is the price of not knowing.
 */

/** Blocks in the cache — the same three as §15.4, so the two are comparable. */
const K = 3;

const reqId = (i: number): string => `r${i}`;
const slotId = (i: number): string => `c${i}`;

export function record(input: number[]): Trace {
  const requests = input.map((b) => Math.max(1, Math.round(b)));
  const n = requests.length;
  const cache: Array<number | null> = Array.from({ length: K }, () => null);
  /** When each cached block was last asked for. */
  const usedAt = new Map<number, number>();

  const { steps, stats, emit } = createRecorder();
  let misses = 0;

  function snapshot(): CellsData {
    return {
      kind: 'cells',
      rows: [
        {
          label: 'σ',
          cells: requests.map((b, i): Cell => ({ id: reqId(i), value: b, label: i + 1 })),
        },
        {
          label: 'C',
          cells: cache.map((b, i): Cell => ({
            id: slotId(i),
            value: b,
            label: b === null ? undefined : `t${usedAt.get(b)! + 1}`,
          })),
        },
      ],
    };
  }

  const chips = (i: number) =>
    auxOf([null, misses, i + 1], undefined, [null, 'misses', 'requests']);

  emit(
    'LRU',
    1,
    snapshot(),
    { aux: { m: auxOf([null, 0, 0], undefined, [null, 'misses', 'requests']) } },
    `A cache of ${K}, and no idea what is coming. Every eviction is a guess.`,
  );

  requests.forEach((block, i) => {
    usedAt.set(block, i);
    const served = Array.from({ length: i }, (_, j) => reqId(j));
    const inCache = cache.indexOf(block);
    stats.comparisons++;

    if (inCache >= 0) {
      emit(
        'LRU',
        3,
        snapshot(),
        {
          done: served,
          mark: reqId(i),
          look: slotId(inCache),
          scope: served.length > 0 ? served : [reqId(0)],
          scopeLabel: 'what has already been asked for — all LRU may look at',
          aux: { m: chips(i) },
        },
        `${block} is already in the cache: a hit, and its clock resets to now.`,
      );
      return;
    }

    misses++;
    const empty = cache.indexOf(null);
    if (empty >= 0) {
      cache[empty] = block;
      stats.writes++;
      emit(
        'LRU',
        5,
        snapshot(),
        {
          done: served,
          mark: reqId(i),
          move: slotId(empty),
          scope: served.length > 0 ? served : [reqId(0)],
          scopeLabel: 'what has already been asked for — all LRU may look at',
          aux: { m: chips(i) },
        },
        `A miss, but the cache has room: ${block} goes in without anything being thrown out.`,
      );
      return;
    }

    // Evict the block that has gone longest without being asked for.
    let victim = 0;
    for (let s = 1; s < K; s++) {
      if (usedAt.get(cache[s]!)! < usedAt.get(cache[victim]!)!) victim = s;
    }
    const evicted = cache[victim]!;
    const lastSeen = usedAt.get(evicted)!;
    emit(
      'LRU',
      7,
      snapshot(),
      {
        done: served,
        mark: reqId(i),
        look: [slotId(victim), reqId(lastSeen)],
        scope: served.length > 0 ? served : [reqId(0)],
        scopeLabel: 'what has already been asked for — all LRU may look at',
        pointers: { lru: slotId(victim) },
        aux: { m: chips(i) },
      },
      `A miss with a full cache. ${evicted} was last used at request ${lastSeen + 1}, longer ago than any other.`,
    );

    cache[victim] = block;
    usedAt.delete(evicted);
    stats.writes++;
    emit(
      'LRU',
      8,
      snapshot(),
      {
        done: served,
        mark: reqId(i),
        move: slotId(victim),
        scope: served.length > 0 ? served : [reqId(0)],
        scopeLabel: 'what has already been asked for — all LRU may look at',
        aux: { m: chips(i) },
      },
      `${evicted} out, ${block} in. If ${evicted} is asked for next, that guess cost a miss.`,
    );
  });

  emit(
    'LRU',
    9,
    snapshot(),
    {
      done: requests.map((_, i) => reqId(i)),
      misses,
      aux: { m: chips(n - 1) },
    },
    `${misses} misses out of ${n}. The offline optimum knows the future; this is what it costs not to.`,
  );

  return { steps, output: { misses, requests: n } };
}

/**
 * LRU is k-competitive, checked against the optimum it cannot see.
 *
 * The reference is Belady's rule — evict the block whose next request is
 * furthest away — which §15.4 proves optimal and which is only computable
 * with the whole sequence in hand. So this compares an online algorithm with
 * the offline best on the same input, and asserts the chapter's bound:
 * `misses_LRU ≤ k · misses_OPT + k`.
 *
 * That the bound is *loose* on most inputs is the point. It is a worst-case
 * guarantee, and the worst case needs an adversary choosing the sequence.
 */
function verify(input: number[], trace: Trace): string | null {
  const requests = input.map((b) => Math.max(1, Math.round(b)));
  const misses = (trace.steps.at(-1)!.hi as { misses?: number }).misses;
  if (misses === undefined) return 'the run reported no miss count';

  // Belady's optimum.
  const cache: number[] = [];
  let best = 0;
  for (let i = 0; i < requests.length; i++) {
    const block = requests[i]!;
    if (cache.includes(block)) continue;
    best++;
    if (cache.length < K) {
      cache.push(block);
      continue;
    }
    let victim = 0;
    let furthest = -1;
    for (let s = 0; s < cache.length; s++) {
      let next = requests.length;
      for (let j = i + 1; j < requests.length; j++) {
        if (requests[j] === cache[s]) {
          next = j;
          break;
        }
      }
      if (next > furthest) {
        furthest = next;
        victim = s;
      }
    }
    cache[victim] = block;
  }

  if (misses < best) {
    return `LRU took ${misses} misses, fewer than the offline optimum's ${best} — impossible`;
  }
  if (misses > K * best + K) {
    return `LRU took ${misses} misses against an optimum of ${best}, outside the ${K}-competitive bound`;
  }
  return null;
}

/**
 * A sequence with enough locality to be worth caching and enough churn to
 * force evictions — the same shape §15.4 generates, so the two players can be
 * compared on comparable inputs.
 */
function generate(n: number): number[] {
  const length = Math.max(6, Math.min(n, 16));
  const blocks = K + 2;
  const requests: number[] = [];
  for (let i = 0; i < length; i++) {
    if (requests.length > 1 && Math.random() < 0.45) {
      requests.push(requests[requests.length - 1 - Math.floor(Math.random() * 2)]!);
    } else {
      requests.push(1 + Math.floor(Math.random() * blocks));
    }
  }
  return requests;
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 3) return { error: 'Give at least three requests.' };
  if (parts.length > 18) return { error: 'At most 18 requests — the row stops fitting.' };
  const values: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 1 || v > 9) {
      return { error: `"${part}" is not a block number between 1 and 9.` };
    }
    values.push(v);
  }
  return { value: values };
}

export const onlineCaching: AlgorithmModule = {
  id: 'online-caching',
  name: 'Online Caching (LRU)',
  visualizer: 'cells',
  aux: [{ key: 'm', label: 'm', hint: 'misses so far, against requests served' }],
  procOrder: ['LRU'],
  procedures: {
    // A transcription of §27.3's prose. The book states the policy and spends
    // the section on its competitive ratio rather than on pseudocode.
    LRU: {
      title: 'LRU(σ, k)',
      indent: [0, 1, 2, 1, 2, 1, 2, 2, 0],
      lines: [
        'for each request b in σ',
        'if b is in the cache',
        'a hit — record that b was used now',
        'elseif the cache is not full',
        'bring b in',
        'else',
        'find the cached block used longest ago',
        'evict it, and bring b in',
        'return the number of misses',
      ],
    },
  },
  complexity: {
    best: 'Θ(1) per request',
    average: 'Θ(k) per request',
    worst: 'Θ(k) per request',
    space: 'Θ(k)',
    extra: [
      ['Competitive ratio', 'k — and no deterministic policy does better'],
      ['The adversary', 'ask for whatever was just evicted'],
      ['Against §15.4', 'the same problem, with the future removed'],
      ['Randomized policies', 'do better: O(lg k)-competitive is achievable'],
      ['What it assumes', 'locality — the same bet as move-to-front'],
    ],
  },
  input: {
    minSize: 6,
    maxSize: 16,
    noun: 'sequence',
    placeholder: '1, 2, 3, 4, 1, 2, 5, 1',
    note: 'a cache of 3; blocks are numbered 1 to 9',
    label: 'The sequence of requested blocks, separated by commas',
    generate,
    parse,
  },
  defaultSize: 12,
  result: { kind: 'transforms', verify },
  record,
};
