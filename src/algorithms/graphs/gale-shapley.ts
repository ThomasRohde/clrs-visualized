import {
  auxOf,
  createRecorder,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphData,
  type GraphEdge,
  type GraphInput,
  type ParsedInput,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, vid } from './graph-input.ts';

/**
 * THE STABLE-MARRIAGE PROBLEM — CLRS §25.2.
 *
 * A different question about a bipartite graph from §25.1's. Not "how many
 * pairs can we make" — here everyone gets a partner — but **"will the pairing
 * hold"**.
 *
 * Each of n proposers ranks all n receivers, and each receiver ranks all n
 * proposers. A matching is **unstable** if some pair not matched to each
 * other would *both* prefer each other to their current partners: they would
 * leave, and the matching would fall apart. A **stable** matching admits no
 * such pair.
 *
 * That such a matching always exists is not obvious. Gale and Shapley proved
 * it by giving an algorithm that finds one, which is the nicest kind of
 * existence proof.
 *
 * **The algorithm.** While someone is unmatched, they propose to the best
 * receiver who has not yet rejected them. A receiver holding no offer accepts;
 * a receiver holding one keeps whichever proposer they prefer and rejects the
 * other. Rejected proposers go on down their own list.
 *
 * It terminates because nobody ever proposes twice to the same person, so
 * there are at most n² proposals. It ends with everyone matched because a
 * receiver who has ever been proposed to never becomes free again — so if
 * some proposer were left over, they would have been rejected by all n
 * receivers, all of whom would be matched, which needs n + 1 proposers.
 *
 * And the result is stable: if `p` prefers `r` to their own partner, then `p`
 * proposed to `r` earlier and was rejected or later dropped — which only
 * happens in favour of somebody `r` prefers. So `r` does not want `p`.
 *
 * **The asymmetry is the thing to notice**, and it is a property of the
 * problem rather than a flaw in the algorithm: this is simultaneously the
 * **best** stable matching for every proposer and the **worst** for every
 * receiver. Which side proposes is a real decision with real consequences,
 * and it is why the medical residency match argued about it for years.
 *
 * Only proposals that have actually been made are drawn, so the picture is
 * the history of the round as well as its state.
 */

/** A proposer's preference order, and each receiver's ranking of proposers. */
interface Prefs {
  /** `pref[p]` is p's ranking of receivers, best first. */
  pref: number[][];
  /** `rankOf[r][p]` is how r ranks p — lower is better. */
  rankOf: number[][];
}

function preferencesFrom(g: GraphInput): Prefs {
  const k = (g.left ?? []).length;
  const pref: number[][] = [];
  const rankOf: number[][] = [];
  // Preferences are carried in the edge weights: w(p, r) is p's ranking of r
  // and doubles as r's ranking of p through the reverse lookup below. Two
  // orderings out of one edge list, so the reader can type a whole instance.
  for (let p = 1; p <= k; p++) {
    const list = g.edges
      .filter((e) => e.u === p)
      .sort((a, b) => (a.w ?? 0) - (b.w ?? 0))
      .map((e) => e.v);
    pref[p] = list;
  }
  for (let r = k + 1; r <= g.n; r++) {
    const list = g.edges
      .filter((e) => e.v === r)
      .sort((a, b) => ((a.w ?? 0) % 100) - ((b.w ?? 0) % 100) || a.u - b.u)
      .map((e) => e.u);
    rankOf[r] = [];
    list.forEach((p, i) => {
      rankOf[r]![p] = i;
    });
  }
  return { pref, rankOf };
}

export function record(input: GraphInput): Trace {
  const g = input;
  const left = g.left ?? [];
  const k = left.length;
  const right = Array.from({ length: g.n - k }, (_, i) => k + i + 1);
  const { pref, rankOf } = preferencesFrom(g);

  const { steps, stats, emit } = createRecorder();

  /** Who each side currently holds; 0 for nobody. */
  const heldBy = new Array<number>(g.n + 1).fill(0);
  const partner = new Array<number>(g.n + 1).fill(0);
  /** How far down their own list each proposer has got. */
  const at = new Array<number>(g.n + 1).fill(0);
  /** Every proposal ever made — the edges the picture draws. */
  const proposed = new Set<string>();
  let current = 0;

  function snapshot(): GraphData {
    const edges: GraphEdge[] = [];
    for (const key of proposed) {
      const [p, r] = key.replace(/v/g, '').split('>').map(Number) as [number, number];
      edges.push({
        from: vid(p),
        to: vid(r),
        weight: pref[p]!.indexOf(r) + 1,
        // A proposal that is not currently held is drawn dashed: it happened,
        // and it is not part of the matching now.
        ...(partner[p] === r ? {} : { ghost: true }),
      });
    }
    return {
      kind: 'graph',
      directed: false,
      vertices: [
        ...left.map((p, i) => ({
          id: vid(p),
          label: p,
          x: 0.08,
          y: left.length === 1 ? 0.5 : i / (left.length - 1),
          ...(partner[p] ? { attrs: { got: pref[p]!.indexOf(partner[p]!) + 1 } } : {}),
        })),
        ...right.map((r, i) => ({
          id: vid(r),
          label: r,
          x: 0.92,
          y: right.length === 1 ? 0.5 : i / (right.length - 1),
          ...(heldBy[r] ? { attrs: { got: rankOf[r]![heldBy[r]!]! + 1 } } : {}),
        })),
      ],
      edges,
    };
  }

  const matchedEdges = (): Record<string, Role> => {
    const out: Record<string, Role> = {};
    for (const p of left) if (partner[p]) out[ekey(p, partner[p]!)] = 'done';
    return out;
  };
  const free = (): number[] => left.filter((p) => !partner[p]);

  function base(): Record<string, unknown> {
    const settled: string[] = [];
    for (const p of left) if (partner[p]) settled.push(vid(p), vid(partner[p]!));
    return {
      edges: matchedEdges(),
      done: settled,
      ...(free().length > 0
        ? { scope: free().map(vid), scopeLabel: `still unmatched: ${free().join(', ')}` }
        : {}),
      aux: {
        // `at` has already advanced past the choice being proposed, so the
        // chip to point at is the one before it — otherwise the highlighted
        // entry is the next fallback rather than the offer on screen.
        list: current
          ? auxOf([null, ...pref[current]!], at[current]!, [
              null,
              ...pref[current]!.map((_, i) => `#${i + 1}`),
            ])
          : auxOf([null]),
      },
    };
  }

  emit(
    'GALE-SHAPLEY',
    1,
    snapshot(),
    { ...base() },
    `${k} proposers and ${k} receivers, each with a full ranking of the other side. Nobody is matched.`,
  );

  let proposals = 0;
  while (free().length > 0) {
    const p = free()[0]!;
    current = p;
    const r = pref[p]![at[p]!]!;
    at[p]!++;
    proposed.add(ekey(p, r));
    proposals++;
    stats.comparisons++;

    emit(
      'GALE-SHAPLEY',
      3,
      snapshot(),
      {
        ...base(),
        mark: vid(p),
        look: vid(r),
        edges: { ...matchedEdges(), [ekey(p, r)]: 'look' },
      },
      `${p} proposes to ${r}, their number ${pref[p]!.indexOf(r) + 1} choice — the best who has not rejected them.`,
    );

    const holder = heldBy[r]!;
    if (holder === 0) {
      heldBy[r] = p;
      partner[p] = r;
      stats.writes += 2;
      emit(
        'GALE-SHAPLEY',
        5,
        snapshot(),
        {
          ...base(),
          move: [vid(p), vid(r)],
          edges: { ...matchedEdges(), [ekey(p, r)]: 'move' },
        },
        `${r} was free, so the offer is held. Held, not settled — a better proposer can still arrive.`,
      );
      continue;
    }

    stats.comparisons++;
    const prefersNew = rankOf[r]![p]! < rankOf[r]![holder]!;
    if (prefersNew) {
      partner[holder] = 0;
      heldBy[r] = p;
      partner[p] = r;
      stats.writes += 3;
      emit(
        'GALE-SHAPLEY',
        7,
        snapshot(),
        {
          ...base(),
          move: [vid(p), vid(r)],
          look: vid(holder),
          edges: { ...matchedEdges(), [ekey(p, r)]: 'move', [ekey(holder, r)]: 'look' },
        },
        `${r} prefers ${p} to ${holder}, so ${holder} is dropped and goes back to proposing.`,
      );
    } else {
      emit(
        'GALE-SHAPLEY',
        8,
        snapshot(),
        {
          ...base(),
          mark: vid(p),
          look: vid(r),
          edges: { ...matchedEdges(), [ekey(p, r)]: 'look' },
        },
        `${r} prefers the offer they already hold, so ${p} is rejected and moves down their list.`,
      );
    }
  }

  current = 0;
  emit(
    'GALE-SHAPLEY',
    9,
    snapshot(),
    { ...base(), matching: left.map((p) => partner[p]!), proposals },
    `Everyone is matched after ${proposals} proposal${proposals === 1 ? '' : 's'}, and no pair would rather defect.`,
  );

  return { steps, output: { pairs: k, proposals } };
}

/**
 * Stability, checked by its definition.
 *
 * Every pair not matched to each other is tested directly: would both prefer
 * the other to what they have? One such pair anywhere means the matching is
 * unstable, and that check knows nothing about how it was built.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isGraphInput(input)) return 'not a graph input';
  const g = input;
  const left = g.left ?? [];
  const k = left.length;
  const { pref, rankOf } = preferencesFrom(g);

  const matching = (trace.steps.at(-1)!.hi as { matching?: number[] }).matching;
  if (!matching) return 'the run reported no matching';
  if (matching.length !== k) return `${matching.length} pairs for ${k} proposers`;
  if (new Set(matching).size !== k) return 'two proposers were matched to the same receiver';
  if (matching.some((r) => !r)) return 'somebody was left unmatched';

  const partnerOf = new Map<number, number>();
  left.forEach((p, i) => partnerOf.set(p, matching[i]!));
  const heldBy = new Map<number, number>();
  left.forEach((p, i) => heldBy.set(matching[i]!, p));

  for (const p of left) {
    const mine = partnerOf.get(p)!;
    const myRank = pref[p]!.indexOf(mine);
    for (const r of pref[p]!.slice(0, myRank)) {
      // p prefers r to their partner. If r also prefers p, the pair defects.
      const theirs = heldBy.get(r)!;
      if (rankOf[r]![p]! < rankOf[r]![theirs]!) {
        return `${p} and ${r} would both leave: ${p} prefers ${r} to ${mine}, and ${r} prefers ${p} to ${theirs}`;
      }
    }
  }
  return null;
}

/**
 * A complete bipartite instance with a random ranking on each side.
 *
 * The weight on an edge carries both rankings at once: its tens digit is the
 * proposer's ranking of the receiver, and the rest is the receiver's ranking
 * of the proposer, so a reader can type a whole instance as an edge list.
 */
function generate(n: number): GraphInput {
  const k = Math.max(2, Math.min(Math.floor(n / 2), 5));
  const left = Array.from({ length: k }, (_, i) => i + 1);
  const right = Array.from({ length: k }, (_, i) => k + i + 1);
  const shuffle = <T>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };

  const edges: Array<{ u: number; v: number; w: number }> = [];
  const byReceiver = new Map<number, number[]>();
  for (const r of right) byReceiver.set(r, shuffle([...left]));
  for (const p of left) {
    shuffle([...right]).forEach((r, i) => {
      const theirs = byReceiver.get(r)!.indexOf(p);
      edges.push({ u: p, v: r, w: (i + 1) * 100 + theirs });
    });
  }
  const pos: Array<{ x: number; y: number } | null> = [null];
  for (let v = 1; v <= 2 * k; v++) {
    const i = v <= k ? v - 1 : v - k - 1;
    pos[v] = { x: v <= k ? 0.08 : 0.92, y: k === 1 ? 0.5 : i / (k - 1) };
  }
  return {
    kind: 'graph',
    n: 2 * k,
    edges: edges.sort((a, b) => a.u - b.u || a.w - b.w),
    directed: false,
    left,
    pos,
  };
}

/**
 * Read a typed instance in the same encoding the generator writes.
 *
 * An instance needs a *complete* ranking on both sides, which is a lot to
 * type, so the format packs both into one weight: `p-r:crr` where `c` is the
 * proposer's choice number and `rr` is the receiver's ranking of them. The
 * validation below is what stops a half-typed instance producing a run that
 * looks sensible and is not.
 */
function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 4)
    return { error: 'Give at least four edges — two proposers and two receivers.' };

  const edges: Array<{ u: number; v: number; w: number }> = [];
  const proposers = new Set<number>();
  const receivers = new Set<number>();
  for (const part of parts) {
    const m = /^(\d+)\s*-\s*(\d+)\s*:\s*(\d+)$/.exec(part);
    if (!m) return { error: `"${part}" is not an edge — write 1-3:101.` };
    const [u, v, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (u === v) return { error: `${part}: a proposer cannot also be a receiver.` };
    if (w < 100 || w > 999) return { error: `${part}: the weight is choice×100 + their ranking.` };
    if (edges.some((e) => e.u === u && e.v === v)) return { error: `${u}-${v} is given twice.` };
    edges.push({ u, v, w });
    proposers.add(u);
    receivers.add(v);
  }

  for (const p of proposers) if (receivers.has(p)) return { error: `${p} is on both sides.` };
  const k = proposers.size;
  if (receivers.size !== k) return { error: 'The two sides must be the same size.' };
  if (edges.length !== k * k) {
    return { error: `A complete instance needs ${k * k} edges; there are ${edges.length}.` };
  }
  const left = [...proposers].sort((a, b) => a - b);
  const right = [...receivers].sort((a, b) => a - b);
  if (left.some((p, i) => p !== i + 1) || right.some((r, i) => r !== k + i + 1)) {
    return { error: `Number the proposers 1‥${k} and the receivers ${k + 1}‥${2 * k}.` };
  }

  const pos: Array<{ x: number; y: number } | null> = [null];
  for (let v = 1; v <= 2 * k; v++) {
    const i = v <= k ? v - 1 : v - k - 1;
    pos[v] = { x: v <= k ? 0.08 : 0.92, y: k === 1 ? 0.5 : i / (k - 1) };
  }
  return {
    value: {
      kind: 'graph',
      n: 2 * k,
      edges: edges.sort((a, b) => a.u - b.u || a.w - b.w),
      directed: false,
      left,
      pos,
    },
  };
}

export const galeShapley: AlgorithmModule = {
  id: 'gale-shapley',
  name: 'Gale-Shapley',
  visualizer: 'graph',
  aux: [{ key: 'list', label: 'prefs', hint: 'the current proposer’s list, best first' }],
  procOrder: ['GALE-SHAPLEY'],
  procedures: {
    // A transcription of §25.2's prose: the book develops the algorithm in
    // words and proves its three properties, rather than numbering it.
    'GALE-SHAPLEY': {
      title: 'GALE-SHAPLEY(proposers, receivers)',
      indent: [0, 1, 1, 1, 2, 2, 1, 2, 0],
      lines: [
        'every proposer and receiver starts free',
        'while some proposer p is free',
        'r = the best receiver who has not rejected p',
        'if r is free',
        'r holds p’s offer',
        'elseif r prefers p to the offer they hold',
        'r drops that proposer, who becomes free, and holds p',
        'else r rejects p, who moves down their list',
        'return the matching',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'O(n²)',
    worst: 'Θ(n²)',
    space: 'Θ(n²)',
    extra: [
      ['Proposals', 'at most n² — nobody proposes twice to the same receiver'],
      ['Always terminates', 'and always with everyone matched'],
      ['Optimal for', 'every proposer, simultaneously'],
      ['Pessimal for', 'every receiver, simultaneously'],
      ['Where it runs', 'the medical residency match, and school choice'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'instance',
    placeholder: '1-3:101, 1-4:200, 2-3:200, 2-4:101',
    note: 'the size is proposers plus receivers; rankings are in the weights',
    label: 'Edges as p-r:w, where w encodes both rankings',
    generate,
    parse,
    size: (value: GraphInput) => value.n,
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
