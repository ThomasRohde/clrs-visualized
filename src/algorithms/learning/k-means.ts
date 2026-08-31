import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type PlotData,
  type PlotPoint,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';

/**
 * K-MEANS CLUSTERING — CLRS §33.1.
 *
 * Given points and a number k, split the points into k groups so that each is
 * tight. "Tight" is made precise as the objective the algorithm minimises:
 * the sum, over every point, of the squared distance to its group's centre.
 *
 * Finding the *best* such split is NP-hard, so this is chapter 35's situation
 * again — except that the algorithm here comes with no approximation ratio at
 * all. What it guarantees is weaker and stranger: **it never makes things
 * worse.** Two steps, alternating:
 *
 * **Assign** every point to the nearest centroid. Nothing moves, so the only
 * thing that can change is a point joining a closer centre — which cannot
 * increase the total.
 *
 * **Update** every centroid to the mean of its points. The mean is exactly
 * the point minimising the sum of squared distances to a set, so this cannot
 * increase the total either.
 *
 * Neither step can raise the cost and there are finitely many assignments, so
 * the algorithm terminates. That is the whole convergence proof, and it says
 * nothing whatever about the answer being good.
 *
 * **The spokes are the cost.** Each point is drawn joined to the centroid it
 * belongs to, and the sum of the squares of those lengths *is* the objective
 * function. Watching them shorten is watching the algorithm work; when they
 * stop shortening it has finished.
 *
 * The initial centroids are chosen by **k-means++**: the first at random,
 * then each subsequent one with probability proportional to its squared
 * distance from the nearest centre already chosen. Seeding this way is worth
 * a paragraph of its own in §33.1 because uniform random seeding routinely
 * puts two centres in one blob and leaves another empty, and the algorithm
 * has no way to recover from that — every step after it only ever goes
 * downhill from where it started.
 */

/** The plot's frame, fixed for the whole trace so nothing drifts. */
const SPAN = 100;
const K = 3;

const pid = (i: number): string => `p${i}`;
const cid = (j: number): string => `c${j}`;

interface Pt {
  x: number;
  y: number;
}

const dist2 = (a: Pt, b: Pt): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function record(input: number[]): Trace {
  const k = input[0]!;
  const pts: Pt[] = [];
  for (let i = 1; i + 1 < input.length; i += 2) pts.push({ x: input[i]!, y: input[i + 1]! });
  const n = pts.length;

  const { steps, stats, emit } = createRecorder();

  // k-means++ seeding: spread the initial centres out on purpose.
  const centroids: Pt[] = [{ ...pts[Math.floor(Math.random() * n)]! }];
  while (centroids.length < k) {
    const weights = pts.map((p) => Math.min(...centroids.map((c) => dist2(p, c))));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push({ ...pts[pick]! });
  }

  /** Which centroid each point belongs to; −1 until the first assignment. */
  let owner = new Array<number>(n).fill(-1);

  const cost = (): number =>
    pts.reduce((sum, p, i) => sum + (owner[i]! < 0 ? 0 : dist2(p, centroids[owner[i]!]!)), 0);

  function snapshot(links: Array<{ from: string; to: string }>): PlotData {
    const points: PlotPoint[] = pts.map((p, i): PlotPoint => ({ id: pid(i), x: p.x, y: p.y }));
    centroids.forEach((c, j) => {
      const owned = owner.filter((o) => o === j).length;
      points.push({
        id: cid(j),
        x: c.x,
        y: c.y,
        anchor: true,
        // How many points a centre owns is a fact about the answer, so it is a
        // neutral badge rather than a colour. E6.
        ...(owner.some((o) => o >= 0) ? { attrs: { n: owned } } : {}),
      });
    });
    return {
      kind: 'plot',
      xRange: [0, SPAN],
      yRange: [0, SPAN],
      points,
      links,
    };
  }

  /** Every point joined to the centre it currently belongs to. */
  const spokes = () => owner.flatMap((o, i) => (o < 0 ? [] : [{ from: pid(i), to: cid(o) }]));

  const chips = (moved: number | null) =>
    auxOf(
      // Nothing is assigned before the first round, and a cost of 0 there
      // would read as "perfect" rather than "not yet asked".
      [null, owner.some((o) => o >= 0) ? Math.round(cost()) : null, moved],
      undefined,
      [null, 'cost', 'moved'],
    );

  const centres = () => centroids.map((_, j) => cid(j));

  emit(
    'K-MEANS',
    1,
    snapshot([]),
    {
      mark: centres(),
      aux: { c: chips(null) },
    },
    `${n} points and ${k} centres, seeded by k-means++ so no two start in the same clump.`,
  );

  // One point, measured against every centre — the rule stated once, in the
  // picture, rather than repeated for all n on every iteration.
  const sample = 0;
  const sampleTo = centroids
    .map((c, j) => ({ j, d: dist2(pts[sample]!, c) }))
    .sort((a, b) => a.d - b.d);
  emit(
    'K-MEANS',
    4,
    snapshot(centroids.map((_, j) => ({ from: pid(sample), to: cid(j) }))),
    {
      mark: pid(sample),
      look: centres(),
      links: Object.fromEntries(
        centroids.map((_, j) => [
          `${pid(sample)}>${cid(j)}`,
          (j === sampleTo[0]!.j ? 'move' : 'look') as Role,
        ]),
      ),
      aux: { c: chips(null) },
    },
    `Every point measures to all ${k} centres and joins the nearest. Here that is the short one.`,
  );

  let iterations = 0;
  /** The cost after every step, for the verify to check it never rises. */
  const history: number[] = [];

  while (iterations < 12) {
    iterations++;

    const next = pts.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centroids.forEach((c, j) => {
        const d = dist2(p, c);
        stats.comparisons++;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      return best;
    });
    const changed = next.filter((o, i) => o !== owner[i]).length;
    const changedIds = next.flatMap((o, i) => (o !== owner[i] ? [pid(i)] : []));
    owner = next;
    stats.writes += changed;
    history.push(cost());

    emit(
      'K-MEANS',
      4,
      snapshot(spokes()),
      {
        ...(changedIds.length > 0 ? { move: changedIds } : {}),
        mark: centres(),
        aux: { c: chips(changed) },
      },
      changed === 0
        ? `No point changed centre. The assignment is stable, so the algorithm is finished.`
        : `${changed} ${changed === 1 ? 'point moves' : 'points move'} to a nearer centre. The total can only fall.`,
    );

    if (changed === 0) break;

    // Update: the mean is exactly the point that minimises the sum of squared
    // distances to a set, which is why this step cannot make things worse.
    const before = centroids.map((c) => ({ ...c }));
    centroids.forEach((c, j) => {
      const mine = pts.filter((_, i) => owner[i] === j);
      if (mine.length === 0) return;
      c.x = mine.reduce((s, p) => s + p.x, 0) / mine.length;
      c.y = mine.reduce((s, p) => s + p.y, 0) / mine.length;
      stats.writes++;
    });
    const shifted = centroids
      .map((c, j) => (dist2(c, before[j]!) > 1e-9 ? cid(j) : ''))
      .filter(Boolean);
    history.push(cost());

    let far = 0;
    let biggest = 0;
    centroids.forEach((c, j) => {
      const moved = dist2(c, before[j]!);
      if (moved > biggest) {
        biggest = moved;
        far = j;
      }
    });
    emit(
      'K-MEANS',
      6,
      snapshot(spokes()),
      {
        move: shifted.length > 0 ? shifted : centres(),
        // The cluster whose centre moved furthest: the one where this step
        // actually did something.
        scope: pts
          .map((_, i) => (owner[i] === far ? pid(i) : ''))
          .filter(Boolean)
          .concat(cid(far)),
        scopeLabel: 'one cluster, and the mean it pulls its centre to',
        aux: { c: chips(0) },
      },
      `Each centre slides to the mean of its own points — the furthest moved ${Math.sqrt(biggest).toFixed(1)}.`,
    );
  }

  const finalCost = cost();
  emit(
    'K-MEANS',
    8,
    snapshot(spokes()),
    {
      done: pts.map((_, i) => pid(i)),
      mark: centres(),
      aux: { c: chips(0) },
      owner: [...owner],
      centroids: centroids.map((c) => ({ ...c })),
      history: [...history],
      cost: finalCost,
    },
    `Settled after ${iterations} rounds, at a cost of ${Math.round(finalCost)}. A local optimum, not the best one.`,
  );

  return { steps, output: { cost: Math.round(finalCost), rounds: iterations } };
}

/**
 * Three claims, and none of them is "the clustering is good".
 *
 * §33.1 promises nothing about the quality of the answer, so asserting
 * anything about it would be inventing a theorem. What it does promise is
 * that the run reached a **fixed point** and that it got there **downhill**,
 * and that is exactly what is checked: every point is assigned to its nearest
 * centre, every centre is the mean of the points assigned to it, and the cost
 * never rose at any step of the run.
 *
 * The first two conditions together are the definition of a local optimum of
 * Lloyd's algorithm, and the third is the whole convergence argument.
 */
function verify(input: number[], trace: Trace): string | null {
  const pts: Pt[] = [];
  for (let i = 1; i + 1 < input.length; i += 2) pts.push({ x: input[i]!, y: input[i + 1]! });

  const hi = trace.steps.at(-1)!.hi as {
    owner?: number[];
    centroids?: Pt[];
    history?: number[];
    cost?: number;
  };
  if (!hi.owner || !hi.centroids || !hi.history || hi.cost === undefined) {
    return 'the run reported no clustering';
  }

  for (let i = 0; i < pts.length; i++) {
    const mine = hi.owner[i]!;
    const d = dist2(pts[i]!, hi.centroids[mine]!);
    for (let j = 0; j < hi.centroids.length; j++) {
      if (dist2(pts[i]!, hi.centroids[j]!) < d - 1e-9) {
        return `point ${i + 1} belongs to centre ${mine + 1} but centre ${j + 1} is nearer — not a fixed point`;
      }
    }
  }

  for (let j = 0; j < hi.centroids.length; j++) {
    const mine = pts.filter((_, i) => hi.owner![i] === j);
    if (mine.length === 0) continue;
    const mx = mine.reduce((s, p) => s + p.x, 0) / mine.length;
    const my = mine.reduce((s, p) => s + p.y, 0) / mine.length;
    if (Math.abs(mx - hi.centroids[j]!.x) > 1e-6 || Math.abs(my - hi.centroids[j]!.y) > 1e-6) {
      return `centre ${j + 1} is not the mean of its own ${mine.length} points`;
    }
  }

  for (let i = 1; i < hi.history.length; i++) {
    if (hi.history[i]! > hi.history[i - 1]! + 1e-6) {
      return `the cost rose from ${hi.history[i - 1]!.toFixed(1)} to ${hi.history[i]!.toFixed(1)} — neither step can do that`;
    }
  }

  const recomputed = pts.reduce((s, p, i) => s + dist2(p, hi.centroids![hi.owner![i]!]!), 0);
  if (Math.abs(recomputed - hi.cost) > 1e-6) {
    return `the run reported a cost of ${hi.cost.toFixed(1)}, but its own clustering costs ${recomputed.toFixed(1)}`;
  }
  return null;
}

/**
 * Three blobs with a little overlap.
 *
 * Uniformly scattered points have no clustering to find, and the run would be
 * a picture of an algorithm dividing noise into three arbitrary pieces —
 * which is a true thing about k-means but a poor first thing to show. Blobs
 * that touch slightly leave a handful of points genuinely on the boundary,
 * and those are the ones that change hands between rounds.
 */
function generate(nRequested: number): number[] {
  const n = Math.max(9, Math.min(nRequested, 30));
  const spread = 13;
  const seeds: Pt[] = [
    { x: 26, y: 30 },
    { x: 72, y: 26 },
    { x: 52, y: 74 },
  ];
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
  const out: number[] = [K];
  for (let i = 0; i < n; i++) {
    const s = seeds[i % seeds.length]!;
    out.push(
      Math.round(Math.max(3, Math.min(SPAN - 3, s.x + gauss() * spread))),
      Math.round(Math.max(3, Math.min(SPAN - 3, s.y + gauss() * spread))),
    );
  }
  return out;
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length < 6) return { error: 'Give at least six points, like 10,20; 30,40; 55,12.' };
  if (parts.length > 30) return { error: 'At most thirty points — the plot stops being readable.' };
  const out: number[] = [K];
  for (const part of parts) {
    const m = /^(\d{1,3})\s*[, ]\s*(\d{1,3})$/.exec(part);
    if (!m) return { error: `"${part}" is not a point — write it as 40,75.` };
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x > SPAN || y > SPAN) return { error: `Coordinates run from 0 to ${SPAN}.` };
    out.push(x, y);
  }
  return { value: out };
}

export const kMeans: AlgorithmModule = {
  id: 'k-means',
  name: 'k-Means Clustering',
  visualizer: 'plot',
  aux: [{ key: 'c', label: 'state', hint: 'the objective, and how many points changed hands' }],
  procOrder: ['K-MEANS'],
  procedures: {
    // §33.1 develops k-means in prose around the objective function; this is
    // that development written as the loop the section describes.
    'K-MEANS': {
      title: 'K-MEANS(X, k)',
      indent: [0, 0, 1, 2, 1, 2, 0, 0],
      lines: [
        'choose k initial centres μ₁ … μ_k  // by k-means++',
        'repeat',
        'for each point x ∈ X',
        'assign x to the cluster of the nearest μⱼ',
        'for j = 1 to k',
        'μⱼ = the mean of the points assigned to j',
        'until no assignment changed',
        'return the clusters and their centres',
      ],
    },
  },
  complexity: {
    best: 'Θ(n k d) per round',
    average: 'Θ(n k d) per round',
    worst: 'Θ(n k d) per round',
    space: 'Θ(n + k d)',
    extra: [
      ['What it guarantees', 'the cost never rises, so it terminates'],
      ['What it does not', 'anything at all about how good the answer is'],
      ['Finding the true optimum', 'NP-hard, even for k = 2'],
      ['Why k-means++', 'seeding badly is unrecoverable — every later step goes downhill'],
      ['Rounds in practice', 'a handful; the worst case is exponential'],
    ],
  },
  input: {
    minSize: 9,
    maxSize: 30,
    noun: 'set of points',
    placeholder: '20,25; 30,35; 70,20; 78,32; 50,70; 58,80',
    note: `k is fixed at ${K}; points live in a ${SPAN} × ${SPAN} box`,
    label: 'Points, as 40,75 separated by semicolons',
    generate,
    parse,
    size: (value: number[]) => (value.length - 1) / 2,
  },
  defaultSize: 21,
  result: { kind: 'transforms', verify },
  record,
};
