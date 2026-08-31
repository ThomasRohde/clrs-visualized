import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type ParsedInput,
  type PlotData,
  type PlotPoint,
  type PlotSeries,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';

/**
 * MULTIPLICATIVE WEIGHTS — CLRS §33.2.
 *
 * A room of n advisors. Every round each of them tells you what to do, you
 * commit, and then the world reveals which of them were wrong. You have no
 * idea in advance which advisor is any good, and the good one may change.
 *
 * You cannot beat the best advisor — they know things you do not. The
 * question §33.2 answers is how close you can come to the best one **in
 * hindsight**, without ever being told who that is.
 *
 * The rule is one line: keep a weight per advisor, bet in proportion to the
 * weights, and after each round **multiply down the weight of everyone who
 * was wrong**. Nothing is ever set to zero, so an advisor who has a bad week
 * can recover; but repeated failure costs exponentially, so the room's
 * opinion concentrates fast on whoever is actually right.
 *
 * The guarantee, with η ≤ 1/2:
 *
 *     L_MW  ≤  (1 + η) · min_i L_i  +  ln(n)/η
 *
 * Read the second term carefully, because it is the surprising part. The
 * price of not knowing which of n advisors to trust is **logarithmic in n**.
 * Going from ten advisors to a thousand roughly doubles it. That is why this
 * one idea keeps reappearing far from its origin — it is behind boosting in
 * machine learning, the fastest approximate solvers for packing linear
 * programs, and several results in game theory, all as the same argument.
 *
 * **The picture is the whole theorem.** Every line is somebody's running
 * total of mistakes. The faint ones are the advisors; the marked one is you.
 * You never dip below the best line — you cannot — but you track it, even
 * though at the start you had no way to tell which line that would be. The
 * gap at the right-hand edge is the regret, and the theorem is a promise
 * about how wide it can get.
 */

/** Losses are 0 or 1 here: an advisor was right, or wrong. */
const eid = (i: number): string => `e${i}`;
const epid = (i: number): string => `pe${i}`;
const US = 'us';
const USP = 'pus';

/**
 * The standard tuning, η = √(ln n / T), capped at the ½ the bound needs.
 *
 * It is the value that balances the two terms of the guarantee: a larger η
 * forgets slowly-accumulating evidence too fast, a smaller one takes too long
 * to notice a bad advisor at all.
 */
function etaFor(n: number, T: number): number {
  return Math.min(0.5, Math.sqrt(Math.log(Math.max(2, n)) / Math.max(1, T)));
}

export function record(input: number[]): Trace {
  const n = input[0]!;
  const bits = input.slice(1);
  const T = Math.floor(bits.length / n);
  const loss = (t: number, i: number): number => bits[t * n + i]!;
  const eta = etaFor(n, T);

  const { steps, stats, emit } = createRecorder();
  const weights = new Array<number>(n).fill(1);
  /** Cumulative mistakes, per advisor and for us, indexed by round. */
  const expertTotals: number[][] = Array.from({ length: n }, () => [0]);
  const ourTotals: number[] = [0];
  const perRound: number[] = [];

  // Fixed axes: every one of these totals is known before the run starts, so
  // there is no excuse for a chart that rescales while the reader watches.
  let worst = 1;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let t = 0; t < T; t++) s += loss(t, i);
    worst = Math.max(worst, s);
  }
  const yMax = Math.ceil(worst) + 1;

  function snapshot(): PlotData {
    const series: PlotSeries[] = expertTotals.map((totals, i) => ({
      id: eid(i),
      points: totals.map((y, t) => ({ x: t, y })),
      label: `#${i + 1}`,
    }));
    series.push({ id: US, points: ourTotals.map((y, t) => ({ x: t, y })), label: 'us' });

    const points: PlotPoint[] = expertTotals.map((totals, i): PlotPoint => ({
      id: epid(i),
      x: totals.length - 1,
      y: totals[totals.length - 1]!,
      // The weight is a fact about the state, not a visual one: E6's badge.
      attrs: { w: Math.round(weights[i]! * 100) / 100 },
    }));
    points.push({
      id: USP,
      x: ourTotals.length - 1,
      y: ourTotals[ourTotals.length - 1]!,
      anchor: true,
    });

    return {
      kind: 'plot',
      xRange: [0, T],
      yRange: [0, yMax],
      xLabel: 'round',
      yLabel: 'mistakes',
      points,
      series,
    };
  }

  const chips = (ptr?: number) =>
    auxOf(
      [null, ...weights.map((w) => Math.round(w * 100) / 100)],
      ptr === undefined ? undefined : ptr + 1,
      [null, ...weights.map((_, i) => `#${i + 1}`)],
    );

  emit(
    'MULTIPLICATIVE-WEIGHTS',
    1,
    snapshot(),
    { aux: { w: chips() } },
    `${n} advisors, ${T} rounds, and every weight starts at 1. You do not know which one is good.`,
  );

  for (let t = 0; t < T; t++) {
    const W = weights.reduce((a, b) => a + b, 0);
    const p = weights.map((w) => w / W);
    let ours = 0;
    for (let i = 0; i < n; i++) ours += p[i]! * loss(t, i);
    perRound.push(ours);
    stats.comparisons += n;

    for (let i = 0; i < n; i++) {
      expertTotals[i]!.push(expertTotals[i]![t]! + loss(t, i));
      weights[i]! *= 1 - eta * loss(t, i);
      if (loss(t, i) === 1) stats.writes++;
    }
    ourTotals.push(ourTotals[t]! + ours);

    const wrong = Array.from({ length: n }, (_, i) => i).filter((i) => loss(t, i) === 1);
    const heaviest = weights.indexOf(Math.max(...weights));

    emit(
      'MULTIPLICATIVE-WEIGHTS',
      7,
      snapshot(),
      {
        mark: USP,
        look: Array.from({ length: n }, (_, i) => epid(i)),
        ...(wrong.length > 0 ? { move: wrong.map(epid) } : {}),
        series: { [US]: 'mark' as Role },
        aux: { w: chips(heaviest) },
      },
      wrong.length === 0
        ? `Round ${t + 1}: every advisor was right, so nothing is penalised and you paid nothing.`
        : `Round ${t + 1}: ${wrong.length} of ${n} were wrong. Their weights drop by a factor of ${(1 - eta).toFixed(2)}.`,
    );
  }

  const totals = expertTotals.map((e) => e[T]!);
  const best = totals.indexOf(Math.min(...totals));
  const ourLoss = ourTotals[T]!;
  const bound = (1 + eta) * totals[best]! + Math.log(n) / eta;

  emit(
    'MULTIPLICATIVE-WEIGHTS',
    8,
    snapshot(),
    {
      done: [epid(best)],
      mark: USP,
      series: { [US]: 'mark' as Role, [eid(best)]: 'done' as Role },
      aux: { w: chips(best) },
      ourLoss,
      totals: [...totals],
      perRound: [...perRound],
      eta,
      bound,
    },
    `You made ${ourLoss.toFixed(1)} mistakes; the best advisor made ${totals[best]}. The bound allowed ${bound.toFixed(1)}.`,
  );

  return { steps, output: { rounds: T, best: totals[best]! } };
}

/**
 * The regret bound, and the two things it rests on.
 *
 * The bound itself is what §33.2 exists to prove, so it is asserted directly:
 * `L_MW ≤ (1 + η)·min L_i + ln(n)/η`. But a bound is only as good as the run
 * it describes, so the run is checked first — every round's loss is
 * recomputed as the weighted average it is supposed to be, from weights
 * re-derived from scratch by replaying the update rule. A recorder that
 * quietly bet on the best advisor would satisfy the inequality and fail this.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = input[0]!;
  const bits = input.slice(1);
  const T = Math.floor(bits.length / n);
  const loss = (t: number, i: number): number => bits[t * n + i]!;
  const eta = etaFor(n, T);

  const hi = trace.steps.at(-1)!.hi as {
    ourLoss?: number;
    totals?: number[];
    perRound?: number[];
    eta?: number;
    bound?: number;
  };
  if (hi.ourLoss === undefined || !hi.totals || !hi.perRound) return 'the run reported no losses';
  if (hi.eta === undefined || Math.abs(hi.eta - eta) > 1e-12) {
    return `the run used η = ${hi.eta}, not the √(ln n / T) = ${eta} it should have`;
  }

  // Replay the weights independently and re-derive what each round cost.
  const weights = new Array<number>(n).fill(1);
  let ours = 0;
  for (let t = 0; t < T; t++) {
    const W = weights.reduce((a, b) => a + b, 0);
    let round = 0;
    for (let i = 0; i < n; i++) round += (weights[i]! / W) * loss(t, i);
    if (Math.abs(round - hi.perRound[t]!) > 1e-9) {
      return `round ${t + 1} was recorded as costing ${hi.perRound[t]}, but the weighted average is ${round}`;
    }
    ours += round;
    for (let i = 0; i < n; i++) weights[i]! *= 1 - eta * loss(t, i);
  }
  if (Math.abs(ours - hi.ourLoss) > 1e-9) {
    return `the total is ${hi.ourLoss}, but the rounds add to ${ours}`;
  }

  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let t = 0; t < T; t++) s += loss(t, i);
    if (s !== hi.totals[i]) return `advisor ${i + 1}'s total is ${hi.totals[i]}, not ${s}`;
  }

  const best = Math.min(...hi.totals);
  const bound = (1 + eta) * best + Math.log(n) / eta;
  if (ours > bound + 1e-9) {
    return `you made ${ours.toFixed(2)} mistakes against a best advisor's ${best}, over the bound of ${bound.toFixed(2)}`;
  }
  return null;
}

/**
 * One advisor who is usually right, and several who are not.
 *
 * Advisors of equal quality make a picture in which nothing is learned,
 * because there is nothing to learn: the weights stay level and the algorithm
 * has correctly concluded that the room is uniform. The interesting run is
 * the one where a good advisor exists and has to be *found*, which is what
 * the theorem is about.
 */
function generate(nRequested: number): number[] {
  const n = 4;
  const T = Math.max(8, Math.min(nRequested, 26));
  const rates = [0.12, 0.34, 0.52, 0.42];
  const out: number[] = [n];
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < n; i++) out.push(Math.random() < rates[i]! ? 1 : 0);
  }
  return out;
}

function parse(text: string): ParsedInput {
  const rounds = text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (rounds.length < 4) return { error: 'Give at least four rounds, like 0100, 1000, 0010.' };
  if (rounds.length > 26) return { error: 'At most 26 rounds — the plot stops being readable.' };
  const n = rounds[0]!.length;
  if (n < 2 || n > 6) return { error: 'Each round is 2 to 6 digits, one per advisor.' };
  const out: number[] = [n];
  for (const round of rounds) {
    if (round.length !== n) {
      return { error: `"${round}" has ${round.length} digits; the first round has ${n}.` };
    }
    for (const ch of round) {
      if (ch !== '0' && ch !== '1') {
        return { error: `"${round}" is not 0s and 1s — 1 means that advisor was wrong.` };
      }
      out.push(Number(ch));
    }
  }
  return { value: out };
}

export const multiplicativeWeights: AlgorithmModule = {
  id: 'multiplicative-weights',
  name: 'Multiplicative Weights',
  visualizer: 'plot',
  aux: [{ key: 'w', label: 'w', hint: 'one weight per advisor — the room’s opinion, so far' }],
  procOrder: ['MULTIPLICATIVE-WEIGHTS'],
  procedures: {
    'MULTIPLICATIVE-WEIGHTS': {
      title: 'MULTIPLICATIVE-WEIGHTS(ℓ, T, η)',
      indent: [0, 0, 1, 1, 1, 1, 1, 0],
      lines: [
        'wᵢ = 1  for i = 1 to n',
        'for t = 1 to T',
        'W = Σᵢ wᵢ',
        'pᵢ = wᵢ / W       // bet in proportion to weight',
        'observe the losses ℓᵢ(t) ∈ [0, 1]',
        'pay Σᵢ pᵢ · ℓᵢ(t)',
        'wᵢ = wᵢ · (1 − η · ℓᵢ(t))',
        'return the total paid',
      ],
    },
  },
  complexity: {
    best: 'Θ(n) per round',
    average: 'Θ(n) per round',
    worst: 'Θ(n) per round',
    space: 'Θ(n)',
    extra: [
      ['The guarantee', 'L ≤ (1 + η)·min Lᵢ + ln(n)/η, for η ≤ ½'],
      ['Cost of not knowing', 'logarithmic in the number of advisors'],
      ['Tuning', 'η = √(ln n / T) balances the two terms'],
      ['Why nothing hits zero', 'an advisor with a bad week has to be able to recover'],
      ['Where else', 'boosting, packing LPs, and equilibria in game theory'],
    ],
  },
  input: {
    minSize: 8,
    maxSize: 26,
    noun: 'run of rounds',
    placeholder: '0100, 1010, 0110, 1000',
    note: 'one group per round, one digit per advisor; 1 means wrong',
    label: 'Rounds of losses, as 0100 separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.floor((value.length - 1) / value[0]!),
  },
  defaultSize: 18,
  result: { kind: 'transforms', verify },
  record,
};
