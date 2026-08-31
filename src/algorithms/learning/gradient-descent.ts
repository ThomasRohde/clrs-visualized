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
 * GRADIENT DESCENT — CLRS §33.3.
 *
 * Almost every algorithm in this book computes an answer. This one *searches*
 * for one, and the rule it searches by is a single line: **go downhill.**
 *
 * From wherever you are, the derivative says which way the ground falls and
 * how steeply. Take a step proportional to it in the opposite direction, and
 * repeat until the ground is flat.
 *
 * Two things decide whether that works, and both are visible here.
 *
 * **The step size η.** Too small and the descent crawls — the trail is a
 * dense line of dots barely moving. Too large and each step overshoots the
 * bottom and lands further up the far side; the iterate oscillates, and past
 * η = 2/f″ it oscillates *outwards* and never comes back. The slider is η, so
 * this is one drag rather than a paragraph. There is no safe default: the
 * threshold depends on the curvature of the function you happen to be on.
 *
 * **Where you start.** Gradient descent finds a point where the derivative is
 * zero. On a convex function that is the global minimum and there is nothing
 * more to say, which is why §33.3's guarantees are all stated for convex
 * functions. This one is not convex, deliberately: it has two valleys, and
 * **which one you end up in is decided entirely by where you began.** Start
 * to the right of the ridge and the algorithm will contentedly settle into
 * the shallower minimum, having done nothing wrong, with no way of knowing a
 * better one exists.
 *
 * The tangent drawn at each step is the gradient itself — the step taken is
 * that slope times η, and the chord back to the previous point is what it
 * actually bought.
 */

/**
 * f(x) = x⁴/20 − x²/2 + x/5 + 3, chosen for having two unequal valleys.
 *
 * f′(x) = x³/5 − x + 1/5, whose roots are the roots of x³ − 5x + 1: a minimum
 * at −2.3301, a ridge at 0.2016, and a shallower minimum at 2.1284.
 */
const f = (x: number): number => x ** 4 / 20 - x ** 2 / 2 + x / 5 + 3;
const df = (x: number): number => x ** 3 / 5 - x + 1 / 5;
const d2f = (x: number): number => (3 * x ** 2) / 5 - 1;

const GLOBAL_MIN = -2.3301;
const LOCAL_MIN = 2.1284;
/**
 * The ridge between the two valleys, where f′ is also zero.
 *
 * Gradient descent stops wherever the ground is flat, and flat includes the
 * top of a hill. Landing here needs a start that is already on it, which is a
 * measure-zero accident on a real problem and a one-line demonstration here.
 */
const RIDGE = 0.2016;
const X_RANGE: [number, number] = [-4, 4];
const Y_RANGE: [number, number] = [0, 9];
/** Flat enough to stop. */
const EPSILON = 0.02;
const MAX_STEPS = 40;

const round2 = (v: number): number => Math.round(v * 100) / 100;
const iid = (i: number): string => `x${i}`;

/** The landscape, sampled once: it is the same on every frame. */
const CURVE: PlotSeries = {
  id: 'f',
  points: Array.from({ length: 161 }, (_, i) => {
    const x = X_RANGE[0] + (i / 160) * (X_RANGE[1] - X_RANGE[0]);
    return { x, y: f(x) };
  }),
};

export function record(input: number[]): Trace {
  const x0 = input[0]!;
  const eta = input[1]!;

  const { steps, stats, emit } = createRecorder();
  const visited: number[] = [x0];
  let x = x0;
  let diverged = false;

  function snapshot(tangentAt: number | null): PlotData {
    const points: PlotPoint[] = visited.map((v, i): PlotPoint => ({
      id: iid(i),
      x: v,
      y: f(v),
      ...(i === visited.length - 1 ? { anchor: true } : {}),
    }));
    const series: PlotSeries[] = [CURVE];
    if (tangentAt !== null) {
      const g = df(tangentAt);
      const d = 0.55;
      series.push({
        id: 'tangent',
        points: [
          { x: tangentAt - d, y: f(tangentAt) - d * g },
          { x: tangentAt + d, y: f(tangentAt) + d * g },
        ],
      });
    }
    return {
      kind: 'plot',
      xRange: X_RANGE,
      yRange: Y_RANGE,
      xLabel: 'x',
      yLabel: 'f(x)',
      points,
      series,
      rules: [
        { axis: 'x', at: GLOBAL_MIN, label: 'global min' },
        { axis: 'x', at: LOCAL_MIN, label: 'local min' },
      ],
      // The chord from the last position to this one: what the step bought.
      links:
        visited.length > 1 ? [{ from: iid(visited.length - 2), to: iid(visited.length - 1) }] : [],
    };
  }

  const settled = () => visited.slice(0, -1).map((_, i) => iid(i));
  const chips = () =>
    auxOf([null, eta, round2(x), round2(f(x)), round2(df(x))], undefined, [
      null,
      'η',
      'x',
      'f(x)',
      "f'(x)",
    ]);

  emit(
    'GRADIENT-DESCENT',
    1,
    snapshot(null),
    { mark: iid(0), aux: { g: chips() } },
    `Starting at x = ${round2(x0)}, with a step size of ${eta}. The only rule is: go downhill.`,
  );

  let taken = 0;
  while (taken < MAX_STEPS) {
    const g = df(x);
    stats.comparisons++;
    if (Math.abs(g) < EPSILON) break;

    emit(
      'GRADIENT-DESCENT',
      3,
      snapshot(x),
      {
        mark: iid(visited.length - 1),
        done: settled(),
        series: { tangent: 'look' as Role },
        aux: { g: chips() },
      },
      `The tangent slopes ${g > 0 ? 'up' : 'down'} to the right at ${round2(g)}, so the step goes ${g > 0 ? 'left' : 'right'}.`,
    );

    const before = f(x);
    x = x - eta * g;
    visited.push(x);
    taken++;
    stats.writes++;

    if (!Number.isFinite(x) || x < X_RANGE[0] || x > X_RANGE[1]) {
      diverged = true;
      emit(
        'GRADIENT-DESCENT',
        4,
        snapshot(null),
        {
          move: iid(visited.length - 1),
          done: settled(),
          aux: { g: chips() },
        },
        `The step of ${round2(eta * g)} overshot the valley entirely: x is off the chart. η is too big.`,
      );
      break;
    }

    emit(
      'GRADIENT-DESCENT',
      4,
      snapshot(null),
      {
        move: iid(visited.length - 1),
        done: settled(),
        links: { [`${iid(visited.length - 2)}>${iid(visited.length - 1)}`]: 'move' as Role },
        aux: { g: chips() },
      },
      f(x) > before
        ? `x moves ${round2(Math.abs(eta * g))} — and f went *up*, from ${round2(before)} to ${round2(f(x))}. Overshot.`
        : `x moves ${round2(Math.abs(eta * g))} and f falls from ${round2(before)} to ${round2(f(x))}.`,
    );
  }

  const converged = !diverged && Math.abs(df(x)) < EPSILON;
  const onRidge = converged && Math.abs(x - RIDGE) < 0.1;
  const which = Math.abs(x - GLOBAL_MIN) < Math.abs(x - LOCAL_MIN) ? 'deeper' : 'shallower';
  emit(
    'GRADIENT-DESCENT',
    6,
    snapshot(null),
    {
      ...(converged ? { done: visited.map((_, i) => iid(i)) } : { done: settled() }),
      mark: iid(visited.length - 1),
      aux: { g: chips() },
      path: [...visited],
      converged,
      diverged,
      steps: taken,
    },
    diverged
      ? `Gone, after ${taken} steps. A step size past 2/f″ does not converge slowly — it leaves.`
      : onRidge
        ? `Flat at x = ${round2(x)} — but this is the *top* of the ridge. Flat is all it can test for.`
        : converged
          ? `Flat after ${taken} steps, at x = ${round2(x)}: the ${which} of the two valleys.`
          : `Still going after ${MAX_STEPS} steps, at x = ${round2(x)}. A small η is safe and slow.`,
  );

  return { steps, output: { steps: taken, x: Math.round(x * 1000) } };
}

/**
 * What §33.3 actually promises, and nothing more.
 *
 * The trace is first checked for **truthfulness**: every recorded position
 * must follow from the one before it by exactly one gradient step, which is
 * what stops a recorder from drawing a pretty descent it did not perform.
 *
 * Then the guarantee, in its conditional form. Gradient descent does not
 * promise to find a minimum — this function is not convex and it has no
 * chance of promising that. It promises that with a small enough step **f
 * decreases every time**, and that if it stops, it stops somewhere flat. Both
 * are asserted; the second only when the run reported convergence, because a
 * run that hit the step limit has not claimed to have arrived.
 */
function verify(input: number[], trace: Trace): string | null {
  const x0 = input[0]!;
  const eta = input[1]!;
  const hi = trace.steps.at(-1)!.hi as {
    path?: number[];
    converged?: boolean;
    diverged?: boolean;
    steps?: number;
  };
  if (!hi.path || hi.converged === undefined) return 'the run reported no path';
  if (hi.path[0] !== x0) return `the path starts at ${hi.path[0]}, not at the given x₀ of ${x0}`;

  for (let i = 1; i < hi.path.length; i++) {
    const expected = hi.path[i - 1]! - eta * df(hi.path[i - 1]!);
    if (Math.abs(expected - hi.path[i]!) > 1e-9) {
      return `step ${i} went to ${hi.path[i]}, but x − η·f′(x) is ${expected} — that is not a gradient step`;
    }
  }

  // The descent guarantee is **conditional**, and asserting it unconditionally
  // would be asserting something false: a step is only guaranteed to go
  // downhill when η is small against the curvature it crosses. So the
  // condition is computed per step — L is the largest |f″| over the interval
  // the step traverses, and f″ = 3x²/5 − 1 is extremal at the ends or at 0 —
  // and the decrease is required only where the theorem applies. A run with a
  // large η is allowed to overshoot, which is the whole reason to offer one.
  if (!hi.diverged) {
    for (let i = 1; i < hi.path.length; i++) {
      const a = hi.path[i - 1]!;
      const b = hi.path[i]!;
      const spansZero = Math.min(a, b) <= 0 && Math.max(a, b) >= 0;
      const L = Math.max(Math.abs(d2f(a)), Math.abs(d2f(b)), spansZero ? 1 : 0);
      if (eta * L > 1) continue;
      if (f(b) > f(a) + 1e-9) {
        return `f rose from ${f(a).toFixed(3)} to ${f(b).toFixed(3)} at step ${i}, with η = ${eta} and ηL = ${(eta * L).toFixed(2)} ≤ 1`;
      }
    }
  }

  const last = hi.path[hi.path.length - 1]!;
  if (hi.converged) {
    if (Math.abs(df(last)) >= EPSILON) {
      return `the run claims it converged at x = ${last}, where f′ is ${df(last).toFixed(4)}`;
    }
    // A flat point of *this* function is one of its three stationary points —
    // and the third is a maximum. Asserting it lands in a minimum would be
    // asserting something gradient descent does not do: start it on the ridge
    // and it stops there, correctly by its own rule and wrong by any other.
    const nearest = Math.min(
      Math.abs(last - GLOBAL_MIN),
      Math.abs(last - LOCAL_MIN),
      Math.abs(last - RIDGE),
    );
    if (nearest > 0.1) {
      return `it stopped at x = ${last.toFixed(3)}, which is not a stationary point of f`;
    }
  }
  return null;
}

/**
 * A start somewhere on the slopes, and the slider as the step size.
 *
 * η is what the size control means here, which is unusual and is the point:
 * it is the one parameter of the algorithm, the reader can drag it, and the
 * behaviour changes qualitatively across the range. The generated range stops
 * below 2/f″ at both minima, so a generated run always converges — a reader
 * who wants to watch it fail can type a larger one, and the narration says so
 * when it happens.
 */
function generate(n: number): number[] {
  const eta = Math.max(3, Math.min(n, 20)) / 25;
  let x0 = Math.round((Math.random() * 6.6 - 3.3) * 10) / 10;
  // Not on the ridge. Starting there is a real and instructive case — the
  // gradient is already zero, so the run stops on a *maximum* without taking a
  // step — but it makes a two-frame player, so it is left for a reader to type.
  if (Math.abs(x0 - RIDGE) < 0.4) x0 = x0 < RIDGE ? -1.6 : 1.6;
  return [x0, eta];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== 2) return { error: 'Give a start and a step size: -3.2, 0.3.' };
  const x0 = Number(parts[0]);
  const eta = Number(parts[1]);
  if (!Number.isFinite(x0) || x0 < X_RANGE[0] || x0 > X_RANGE[1]) {
    return { error: `The starting x runs from ${X_RANGE[0]} to ${X_RANGE[1]}.` };
  }
  if (!Number.isFinite(eta) || eta <= 0 || eta > 2) {
    return {
      error: 'The step size η runs from just above 0 to 2. Past about 0.9 it stops settling.',
    };
  }
  return { value: [x0, eta] };
}

export const gradientDescent: AlgorithmModule = {
  id: 'gradient-descent',
  name: 'Gradient Descent',
  visualizer: 'plot',
  aux: [
    { key: 'g', label: 'state', hint: 'the step size, where it is, and how steep it is there' },
  ],
  procOrder: ['GRADIENT-DESCENT'],
  procedures: {
    'GRADIENT-DESCENT': {
      title: 'GRADIENT-DESCENT(f, x₀, η, ε)',
      indent: [0, 0, 1, 1, 0, 0],
      lines: ['x = x₀', 'repeat', 'g = ∇f(x)', 'x = x − η · g', 'until ‖g‖ < ε', 'return x'],
    },
  },
  complexity: {
    best: 'Θ(1) per step, plus the cost of ∇f',
    average: 'O(1/ε) steps for a convex f',
    worst: 'does not terminate if η is too large',
    space: 'Θ(1) beyond x',
    extra: [
      ['What it finds', 'a point where the gradient is zero — not necessarily a minimum'],
      ['On a convex f', 'that point is the global minimum, and §33.3 bounds the rate'],
      ['The step size', 'converges when η < 2/f″; oscillates outwards above it'],
      ['Where you start', 'decides which valley you land in, and nothing corrects it'],
      ['In practice', 'this loop, on millions of parameters, is how models are trained'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 20,
    noun: 'run',
    placeholder: '-3.2, 0.3',
    note: 'the slider is η × 25; Randomize moves the start',
    label: 'The starting x and the step size η, separated by a comma',
    generate,
    parse,
    size: (value: number[]) => Math.round(value[1]! * 25),
  },
  defaultSize: 8,
  result: { kind: 'transforms', verify },
  record,
};
