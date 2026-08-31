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
 * OFFLINE CACHING — CLRS §15.4: the cache manager, and the one eviction rule
 * that is provably optimal.
 *
 * A cache holds k blocks out of a much larger memory. A request for a block
 * already in the cache is a **hit** and costs nothing; a request for one that
 * is not is a **miss**, and if the cache is full something has to be thrown
 * out to make room. Which one?
 *
 * Online — not knowing what will be asked for next — this is a guessing game,
 * and every policy has inputs that defeat it. **Offline**, with the whole
 * request sequence in hand, there is a greedy rule that cannot be beaten:
 * evict the block **whose next request is furthest in the future**. That is
 * the greedy choice, and §15.4's exchange argument proves it optimal.
 *
 * Watching it is what makes the rule stick, because the decision is always
 * made by looking *forward* along the request row rather than backward at
 * what has been used recently. The bracket over the requests still to come is
 * the only thing the eviction consults. Least-recently-used, which is what
 * real caches run, is the backwards-looking approximation of exactly this.
 *
 * `verify` does not re-run the same rule to check it: it searches every
 * possible sequence of evictions and asserts that no other one produces fewer
 * misses.
 */

/** Blocks in the cache. Three is enough to have to make a real choice. */
const K = 3;

const reqId = (i: number): string => `r${i}`;
const slotId = (i: number): string => `c${i}`;

export function record(input: number[]): Trace {
  const requests = input.map((b) => Math.max(1, Math.round(b)));
  const n = requests.length;
  /** The cache: K slots, each holding a block or nothing. */
  const cache: Array<number | null> = Array.from({ length: K }, () => null);

  const { steps, stats, emit } = createRecorder();

  /**
   * Two rows: the request sequence across the top, the cache underneath.
   *
   * They share the column grid, which means nothing here — a cache slot is not
   * a point in time — but the labels say which row is which, and keeping the
   * requests on one line is what lets the reader look ahead the way the
   * algorithm does.
   */
  function snapshot(): CellsData {
    const reqs: Cell[] = requests.map((b, i) => ({ id: reqId(i), value: b }));
    const slots: Cell[] = cache.map((b, i) => ({ id: slotId(i), value: b }));
    return {
      kind: 'cells',
      rows: [
        { label: 'req', cells: reqs },
        { label: 'C', cells: slots },
      ],
    };
  }

  /** When is block `b` next asked for, at or after index `from`? */
  const nextUse = (b: number, from: number): number => {
    for (let i = from; i < n; i++) if (requests[i] === b) return i;
    return Infinity;
  };

  const chips = (hits: number, misses: number) => ({
    tally: auxOf([null, hits, misses], 2, [null, 'hits', 'misses']),
  });

  let hits = 0;
  let misses = 0;
  const served = (i: number): string[] => Array.from({ length: i }, (_, j) => reqId(j));
  const future = (i: number): string[] =>
    Array.from({ length: Math.max(0, n - i - 1) }, (_, j) => reqId(i + 1 + j));

  emit(
    'CACHE-MANAGER',
    1,
    snapshot(),
    { aux: chips(0, 0), ...(n > 1 ? { scope: future(-1) } : {}) },
    `C is empty, with room for ${K} blocks. The whole request sequence is known in advance — that is what "offline" means.`,
  );

  for (let i = 0; i < n; i++) {
    const b = requests[i]!;
    const held = cache.indexOf(b);
    stats.comparisons++;

    if (held >= 0) {
      hits++;
      emit(
        'CACHE-MANAGER',
        4,
        snapshot(),
        {
          done: served(i),
          mark: reqId(i),
          look: slotId(held),
          ...(future(i).length ? { scope: future(i), scopeLabel: 'still to come' } : {}),
          aux: chips(hits, misses),
        },
        `Block ${b} is already in C: a hit, and nothing has to move.`,
      );
      continue;
    }

    const free = cache.indexOf(null);
    if (free >= 0) {
      misses++;
      cache[free] = b;
      stats.writes++;
      emit(
        'CACHE-MANAGER',
        6,
        snapshot(),
        {
          done: served(i),
          mark: reqId(i),
          move: slotId(free),
          ...(future(i).length ? { scope: future(i), scopeLabel: 'still to come' } : {}),
          aux: chips(hits, misses),
        },
        `Block ${b} is not in C, but there is room. A compulsory miss — no policy could avoid it.`,
      );
      continue;
    }

    // The greedy choice: of the blocks held, throw out the one that will not
    // be wanted for longest. Ties, and blocks never wanted again, go first.
    let victim = 0;
    let furthest = -1;
    for (let s = 0; s < K; s++) {
      const when = nextUse(cache[s]!, i + 1);
      if (when > furthest) {
        furthest = when;
        victim = s;
      }
    }
    const evicted = cache[victim]!;
    stats.comparisons += K;
    emit(
      'CACHE-MANAGER',
      8,
      snapshot(),
      {
        done: served(i),
        mark: reqId(i),
        look: slotId(victim),
        ...(future(i).length ? { scope: future(i), scopeLabel: 'still to come' } : {}),
        aux: chips(hits, misses),
      },
      furthest === Infinity
        ? `C is full. Block ${evicted} is never asked for again, so it is the one to lose.`
        : `C is full. Of the three, block ${evicted} is wanted last — not until request ${furthest + 1}.`,
    );

    misses++;
    cache[victim] = b;
    stats.writes++;
    emit(
      'CACHE-MANAGER',
      9,
      snapshot(),
      {
        done: served(i),
        mark: reqId(i),
        move: slotId(victim),
        evictedBlock: evicted,
        ...(future(i).length ? { scope: future(i), scopeLabel: 'still to come' } : {}),
        aux: chips(hits, misses),
      },
      `Block ${b} takes its place. A capacity miss, and the decision looked only forwards.`,
    );
  }

  emit(
    'CACHE-MANAGER',
    9,
    snapshot(),
    { done: served(n), misses, aux: chips(hits, misses) },
    `${n} requests: ${hits} hits and ${misses} misses. No sequence of evictions could have done better.`,
  );

  return { steps, output: { requests: n, hits, misses } };
}

/**
 * A request sequence over a small set of blocks, with enough repetition that
 * the cache is worth having and enough pressure that it has to evict.
 */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 14));
  const blocks = Math.min(6, Math.max(K + 1, Math.ceil(count / 2)));
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * blocks));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one request.' };
  if (parts.length > 14) return { error: 'At most 14 requests — the row has to fit.' };

  const out: number[] = [];
  for (const part of parts) {
    const v = Number(part);
    if (!Number.isInteger(v) || v < 1 || v > 9) {
      return { error: `"${part}" is not a block number between 1 and 9.` };
    }
    out.push(v);
  }
  return { value: out };
}

/**
 * The fewest misses any eviction policy could achieve, by trying all of them.
 *
 * Memoised on (position, cache contents), which is small enough to search
 * exhaustively at these sizes — and it is a genuinely different computation
 * from the greedy rule, which is the point of checking it this way.
 */
function optimalMisses(requests: number[], k: number): number {
  const seen = new Map<string, number>();
  const solve = (i: number, cache: number[]): number => {
    if (i === requests.length) return 0;
    const key = `${i}|${[...cache].sort((a, b) => a - b).join(',')}`;
    const memo = seen.get(key);
    if (memo !== undefined) return memo;

    const b = requests[i]!;
    let best: number;
    if (cache.includes(b)) {
      best = solve(i + 1, cache);
    } else if (cache.length < k) {
      best = 1 + solve(i + 1, [...cache, b]);
    } else {
      best = Infinity;
      for (let s = 0; s < cache.length; s++) {
        const next = [...cache];
        next[s] = b;
        best = Math.min(best, 1 + solve(i + 1, next));
      }
    }
    seen.set(key, best);
    return best;
  };
  return solve(0, []);
}

export const offlineCaching: AlgorithmModule = {
  id: 'offline-caching',
  name: 'Offline Caching',
  visualizer: 'cells',
  aux: [{ key: 'tally', label: 'cost', hint: 'hits and misses so far' }],
  procOrder: ['CACHE-MANAGER'],
  procedures: {
    'CACHE-MANAGER': {
      title: 'CACHE-MANAGER(C, k, n)',
      indent: [0, 0, 1, 2, 1, 2, 1, 2, 2],
      lines: [
        'C = ∅',
        'for i = 1 to n',
        'if b_i is in C',
        '"cache hit"',
        'elseif |C| < k',
        'C = C ∪ {b_i}',
        'else',
        'let b be the block in C whose next access is furthest in the future',
        'C = C − {b} ∪ {b_i}',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n·k)',
    worst: 'Θ(n·k)',
    space: 'Θ(k)',
    extra: [
      ['Per request', 'O(k) to find the block wanted last'],
      ['Cache size here', 'k = 3'],
      ['Compulsory misses', 'unavoidable — the block was never loaded'],
      ['Capacity misses', 'what the eviction rule is judged on'],
      ['Online equivalent', 'LRU — the same rule, looking backwards'],
    ],
  },
  input: {
    minSize: 6,
    maxSize: 14,
    noun: 'sequence',
    placeholder: '1, 2, 3, 4, 1, 2, 5',
    note: 'the blocks requested, in order',
    label: 'The sequence of block numbers requested, separated by commas',
    generate,
    parse,
  },
  defaultSize: 12,
  result: {
    // The claim is optimality, so it is checked against an exhaustive search
    // over every eviction any policy could make — not against the greedy rule
    // that produced the answer.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      if (input.length === 0) return null;
      const requests = input.map((b) => Math.max(1, Math.round(b)));
      let reported: number | null = null;
      for (const step of trace.steps) {
        const hi = step.hi as { misses?: number };
        if (typeof hi.misses === 'number') reported = hi.misses;
      }
      if (reported === null) return 'the run never reported its miss count';

      const hits = trace.output?.hits ?? -1;
      if (hits + reported !== requests.length) {
        return `${hits} hits and ${reported} misses do not account for ${requests.length} requests`;
      }

      const best = optimalMisses(requests, K);
      if (reported !== best) {
        return `furthest-in-future took ${reported} misses, but ${best} is achievable`;
      }
      return null;
    },
  },
  record,
};
