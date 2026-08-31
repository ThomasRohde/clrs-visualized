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

/**
 * Θ, WITH THE QUANTIFIERS DRAWN — CLRS §3.2.
 *
 * The formal definition is four lines and is where most readers first get
 * lost, because it is dense with quantifiers in an order that matters:
 *
 *     f(n) = Θ(g(n))  means  there exist positive constants c₁, c₂ and n₀
 *                            such that for all n ≥ n₀,
 *                            0 ≤ c₁·g(n) ≤ f(n) ≤ c₂·g(n)
 *
 * **You choose the constants; the adversary does not.** They are existentially
 * quantified, so any three that work will do, and they never have to be the
 * best ones. **And nothing before n₀ counts at all** — f may do whatever it
 * likes for the first thousand inputs.
 *
 * Both of those are hard to believe from the symbols and obvious from the
 * picture. Two curves, c₁·g and c₂·g, make a band that opens up as n grows;
 * f wanders into it and never gets out again. n₀ is the last place it
 * escaped, plus one.
 *
 * The constants here are picked without cleverness — c₁ = a/2 and c₂ = 2a for
 * the leading coefficient a — precisely to show that cleverness is not
 * required. §3.2's own worked example takes ½n² − 3n with c₁ = 1/14 and
 * c₂ = 1/2 and gets n₀ = 7; these constants get 12 on the same function. Both
 * are correct. **There is no such thing as _the_ n₀**, and a reader who has
 * seen two different ones for the same function will not go looking for it.
 *
 * What makes the band inescapable is the ratio f(n)/g(n), which is on the aux
 * strip between its two bounds. It equals a + b/n + c/n², so it is dragged to
 * a at a rate of 1/n no matter how large b and c are. That is the whole
 * content of "lower-order terms do not matter": they do matter, enormously,
 * for small n — and they are the only thing n₀ is measuring.
 */

const pid = (n: number): string => `f${n}`;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function record(input: number[]): Trace {
  const [a, b, c, rawN] = input as [number, number, number, number];
  const N = Math.max(12, Math.min(Math.round(rawN), 40));
  const f = (n: number): number => a * n * n + b * n + c;
  const g = (n: number): number => n * n;
  const c1 = a / 2;
  const c2 = 2 * a;

  const inside = (n: number): boolean => f(n) >= c1 * g(n) && f(n) <= c2 * g(n);

  // n₀ is the first n from which nothing escapes again — found from the right,
  // because that is what "for all n ≥ n₀" actually asks.
  let n0 = 1;
  for (let n = N; n >= 1; n--) {
    if (!inside(n)) {
      n0 = n + 1;
      break;
    }
  }

  const { steps, stats, emit } = createRecorder();
  const shown = (v: number) => (Number.isInteger(v) ? v : round2(v));

  /**
   * What is plotted is the **ratio** f(n)/n², not f itself.
   *
   * §3.2's own figure draws f between the two curves c₁·n² and c₂·n², and it
   * is the right picture on paper. It is the wrong one here: over the two
   * dozen values of n needed to see f settle down, a quadratic grows by a
   * factor of 600, so the crossing — the entire point — happens in the bottom
   * few pixels and is invisible. Dividing through by n² is the same statement
   * with the scale taken out. The band becomes two horizontal lines, the
   * limit becomes a third, and where f enters the band for good is exactly
   * where n₀ is.
   */
  const ratio = (n: number): number => f(n) / g(n);

  const span = c2 - c1;
  let yLo = c1 - span * 0.6;
  let yHi = c2 + span * 0.4;
  for (let n = 2; n <= N; n++) {
    yLo = Math.min(yLo, ratio(n) - span * 0.2);
    yHi = Math.max(yHi, ratio(n) + span * 0.2);
  }

  const band: PlotSeries[] = [
    {
      id: 'upper',
      points: [
        { x: 0, y: c2 },
        { x: N + 1, y: c2 },
      ],
      label: 'c₂',
    },
    {
      id: 'lower',
      points: [
        { x: 0, y: c1 },
        { x: N + 1, y: c1 },
      ],
      label: 'c₁',
    },
  ];

  function snapshot(showN0: boolean): PlotData {
    const points: PlotPoint[] = Array.from({ length: N }, (_, i) => ({
      id: pid(i + 1),
      x: i + 1,
      y: ratio(i + 1),
    }));
    return {
      kind: 'plot',
      xRange: [0, N + 1],
      yRange: [yLo, yHi],
      xLabel: 'n',
      yLabel: 'f(n)/n²',
      points,
      series: band.map((b) => ({ ...b, dashed: true })),
      rules: [
        { axis: 'y', at: a, label: `a = ${shown(a)}` },
        ...(showN0 ? [{ axis: 'x' as const, at: n0, label: `n₀ = ${n0}` }] : []),
      ],
    };
  }

  const tested = (upto: number, want: boolean): string[] => {
    const out: string[] = [];
    for (let n = 1; n <= upto; n++) if (inside(n) === want) out.push(pid(n));
    return out;
  };

  const chips = (n: number | null, showN0: boolean) =>
    auxOf(
      [null, round2(c1), n === null ? null : round2(f(n) / g(n)), round2(c2), showN0 ? n0 : null],
      n === null ? undefined : 2,
      [null, 'c₁', 'f/n²', 'c₂', 'n₀'],
    );

  const term = (coeff: number, s: string) =>
    coeff === 0 ? '' : `${coeff > 0 ? ' + ' : ' − '}${shown(Math.abs(coeff))}${s}`;
  const fName = `${shown(a)}n²${term(b, 'n')}${term(c, '')}`;

  emit(
    'THETA',
    1,
    snapshot(false),
    { aux: { t: chips(null, false) } },
    `f(n) = ${fName}, and a band between ${shown(c1)}n² and ${shown(c2)}n². Does f end up inside it?`,
  );

  for (let n = 1; n <= N; n++) {
    const ok = inside(n);
    stats.comparisons += 2;
    // Whichever bound is nearer is the one doing the work at this n, so that
    // is the line the highlight points at.
    const lowerSlack = f(n) - c1 * g(n);
    const upperSlack = c2 * g(n) - f(n);
    emit(
      'THETA',
      lowerSlack <= upperSlack ? 3 : 4,
      snapshot(false),
      {
        look: pid(n),
        done: tested(n - 1, true),
        move: tested(n - 1, false),
        aux: { t: chips(n, false) },
      },
      ok
        ? `n = ${n}: f/n² is ${round2(f(n) / g(n))}, inside [${shown(c1)}, ${shown(c2)}]. So far so good.`
        : `n = ${n}: f/n² is ${round2(f(n) / g(n))}, outside the band. Every escape pushes n₀ higher.`,
    );
  }

  const found = n0 <= N;
  emit(
    'THETA',
    2,
    snapshot(true),
    {
      mark: pid(n0),
      done: tested(N, true).filter((id) => id !== pid(n0)),
      move: tested(N, false),
      scope: Array.from({ length: N - n0 + 1 }, (_, i) => pid(n0 + i)),
      scopeLabel: `n ≥ ${n0}: f never leaves the band again`,
      aux: { t: chips(N, true) },
      n0,
      c1,
      c2,
    },
    found
      ? `From n = ${n0} on, f stays between them. So f(n) = Θ(n²), with these constants and this n₀.`
      : `f is still outside the band at n = ${N}. n₀ exists — push the slider until it comes into view.`,
  );

  return { steps, output: { n0, N } };
}

/**
 * The definition, and the reason it can always be satisfied.
 *
 * `n₀` is checked to be both **sufficient** (nothing escapes at or after it)
 * and **minimal** for these constants (something escaped just before it), so a
 * run cannot pass by reporting a lazily large n₀.
 *
 * Then the thing that makes Θ work at all, as an exact inequality rather than
 * a hand wave: the ratio f(n)/n² is a + b/n + c/n², so it differs from the
 * leading coefficient by at most (|b| + |c|)/n. That is why the band always
 * closes, whatever the lower-order terms are, and why "lower-order terms do
 * not matter" is a statement about the limit rather than about small n — where
 * they are in fact the only thing that matters, and are precisely what n₀ is
 * measuring.
 */
function verify(input: number[], trace: Trace): string | null {
  const [a, b, c, rawN] = input as [number, number, number, number];
  const N = Math.max(12, Math.min(Math.round(rawN), 40));
  const f = (n: number): number => a * n * n + b * n + c;
  const hi = trace.steps.at(-1)!.hi as { n0?: number; c1?: number; c2?: number };
  if (hi.n0 === undefined || hi.c1 === undefined || hi.c2 === undefined) {
    return 'the run reported no constants';
  }
  if (!(hi.c1 > 0) || !(hi.c2 > 0)) return 'c₁ and c₂ must both be positive';
  if (!(hi.c1 < a && a < hi.c2)) {
    return `the band [${hi.c1}, ${hi.c2}] does not contain the leading coefficient ${a}, so it can never close`;
  }

  for (let n = hi.n0; n <= N; n++) {
    if (f(n) < hi.c1 * n * n - 1e-9 || f(n) > hi.c2 * n * n + 1e-9) {
      return `f(${n}) = ${f(n)} is outside the band, but n₀ was reported as ${hi.n0}`;
    }
  }
  if (hi.n0 > 1) {
    const before = hi.n0 - 1;
    if (f(before) >= hi.c1 * before * before && f(before) <= hi.c2 * before * before) {
      return `n₀ = ${hi.n0} is not the smallest that works — f(${before}) is already inside`;
    }
  }

  // |f(n)/n² − a| = |b/n + c/n²| ≤ (|b| + |c|)/n, for n ≥ 1.
  for (let n = 1; n <= N; n++) {
    if (Math.abs(f(n) / (n * n) - a) > (Math.abs(b) + Math.abs(c)) / n + 1e-9) {
      return `at n = ${n} the ratio is further from ${a} than (|b| + |c|)/n allows`;
    }
  }
  return null;
}

/**
 * A quadratic whose lower-order terms are big enough to matter, for a while.
 *
 * b and c are kept in proportion to a so that n₀ lands inside the range the
 * plot shows: coefficients ten times the leading one would be perfectly valid
 * Θ(n²) and would put n₀ off the right-hand edge, which teaches the lesson by
 * hiding it. They are also biased negative, because a function that
 * approaches the band from below is the case §3.2's own example uses and the
 * one where the *lower* bound is what n₀ is really about.
 */
function generate(nRequested: number): number[] {
  const N = Math.max(12, Math.min(nRequested, 40));
  for (let attempt = 0; attempt < 80; attempt++) {
    const a = [0.5, 1, 2][Math.floor(Math.random() * 3)]!;
    const b = Math.round((Math.random() * 4 - 3.2) * a * 2) / 2;
    const c = Math.round((Math.random() * 10 - 6) * a);
    const f = (n: number) => a * n * n + b * n + c;
    const ok = (n: number) => f(n) >= (a / 2) * n * n && f(n) <= 2 * a * n * n;
    let n0 = 1;
    for (let n = N; n >= 1; n--) {
      if (!ok(n)) {
        n0 = n + 1;
        break;
      }
    }
    // A run with nothing to find, or with n₀ off the edge, shows nothing —
    // and one whose ratio starts far below the band squashes the band into a
    // sliver, which shows nothing either.
    const floor = a / 2 - 3 * (2 * a - a / 2);
    if (n0 >= 3 && n0 <= N - 4 && f(1) >= floor) return [a, b, c, N];
  }
  return [0.5, -3, 0, N];
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== 3) {
    return { error: 'Give the three coefficients of a·n² + b·n + c: 0.5, -3, 0.' };
  }
  const [a, b, c] = parts.map(Number) as [number, number, number];
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    return { error: `"${text.trim()}" is not three numbers.` };
  }
  if (a <= 0) return { error: 'The leading coefficient must be positive, or f is not Θ(n²).' };
  if (a > 20 || Math.abs(b) > 60 || Math.abs(c) > 200) {
    return { error: 'Keep |a| ≤ 20, |b| ≤ 60 and |c| ≤ 200 so the plot stays readable.' };
  }
  return { value: [a, b, c, 24] };
}

export const asymptoticBound: AlgorithmModule = {
  id: 'asymptotic-bound',
  name: 'Asymptotic Bounds',
  visualizer: 'plot',
  aux: [{ key: 't', label: 'band', hint: 'the two constants, the ratio between them, and n₀' }],
  procOrder: ['THETA'],
  procedures: {
    // §3.2 states this as a set definition rather than a procedure; these are
    // its clauses, in the order the run checks them.
    THETA: {
      title: 'f(n) = Θ(g(n))',
      indent: [0, 0, 1, 1],
      lines: [
        'there exist positive constants c₁, c₂ and n₀',
        'such that for all n ≥ n₀:',
        '0 ≤ c₁·g(n) ≤ f(n)',
        'and f(n) ≤ c₂·g(n)',
      ],
    },
  },
  complexity: {
    best: 'Θ(n²) — the claim being checked',
    average: 'Θ(n²)',
    worst: 'Θ(n²)',
    space: '—',
    extra: [
      ['What you get to choose', 'c₁, c₂ and n₀ — any three that work will do'],
      ['What n₀ measures', 'how long the lower-order terms go on mattering'],
      ['Is n₀ unique', 'no. Different constants give different n₀, all correct'],
      ['Why the band always closes', 'f/n² is a + b/n + c/n², within (|b|+|c|)/n of a'],
      ['O and Ω', 'the same picture with one of the two curves removed'],
    ],
  },
  input: {
    minSize: 12,
    maxSize: 40,
    noun: 'function',
    placeholder: '0.5, -3, 0',
    note: 'coefficients of a·n² + b·n + c; the slider is how far n runs',
    label: 'The coefficients a, b and c of f(n) = a·n² + b·n + c',
    generate,
    parse,
    size: (value: number[]) => value[3]!,
  },
  defaultSize: 24,
  result: { kind: 'transforms', verify },
  record,
};
