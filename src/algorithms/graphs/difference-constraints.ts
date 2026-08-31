import {
  auxOf,
  createRecorder,
  fmt,
  isGraphInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GraphData,
  type GraphInput,
  type GraphVertex,
  type ParsedInput,
  type Trace,
} from '../types.ts';
import type { Role } from '../../visualizers/roles.ts';
import { ekey, negativeCycleVertices, vid } from './graph-input.ts';

/**
 * DIFFERENCE-CONSTRAINTS — CLRS §22.4.
 *
 * A numbered, unstarred section, and so Tier 1 by this site's own rule; it was
 * written as prose in chapter 22 because it is a **reduction** rather than an
 * algorithm, and a player that only re-ran Bellman-Ford would have taught
 * nothing chapter 22 had not. This one is about the translation instead: the
 * input box takes *inequalities*, and the picture is the graph they turn into.
 *
 * The reduction is the whole content. Given constraints of the form
 * `x_j − x_i ≤ b`, make a vertex per variable and an edge `(v_i, v_j)` of
 * weight `b` for each one — because that is exactly the triangle inequality
 * `d[j] ≤ d[i] + b` that RELAX enforces. Add a source `v₀` with a 0-weight
 * edge to every variable so the graph is connected and nothing is unreachable.
 * Then the shortest-path estimates *are* a solution, and a negative cycle is
 * exactly a set of constraints that add up to `0 ≤ (something negative)`.
 *
 * Two consequences worth watching for, both of which the narration calls out:
 *
 *   - **The solution is not unique.** Adding a constant to every `x_i` leaves
 *     every difference alone, so the answer this produces is one of infinitely
 *     many — the one where the largest value is 0, since every path from `v₀`
 *     starts with a 0-weight edge.
 *   - **Infeasibility is a cycle, not a stuck variable.** The constraints that
 *     conflict are a closed chain whose bounds sum below zero, and no single
 *     one of them is at fault.
 */
export function record(input: GraphInput): Trace {
  const g = input;
  const source = g.n;
  const numVars = g.n - 1;
  const { steps, stats, emit } = createRecorder();

  const d = new Array<number>(g.n + 1).fill(Infinity);
  const pi = new Array<number>(g.n + 1).fill(0);
  /** Edges added to the picture so far — the translation is drawn as it happens. */
  let shown = 0;

  const name = (v: number): string => (v === source ? 'v₀' : `x${v}`);

  function vertices(): GraphVertex[] {
    const out: GraphVertex[] = [];
    for (let v = 1; v <= g.n; v++) {
      const p = g.pos?.[v];
      out.push({
        id: vid(v),
        label: name(v),
        ...(p ? { x: p.x, y: p.y } : {}),
        ...(Number.isFinite(d[v]) ? { attrs: { d: String(d[v]) } } : {}),
      });
    }
    return out;
  }

  function snapshot(): GraphData {
    return {
      kind: 'graph',
      directed: true,
      vertices: vertices(),
      edges: g.edges.slice(0, shown).map((e) => ({
        from: vid(e.u),
        to: vid(e.v),
        weight: e.w ?? 0,
      })),
    };
  }

  /** The solution as it stands, as one chip per variable. */
  function solution(ptr?: number): Record<string, unknown> {
    const values: Array<number | null> = [null];
    const labels: Array<string | null> = [null];
    for (let v = 1; v <= numVars; v++) {
      values.push(Number.isFinite(d[v]) ? d[v]! : null);
      labels.push(`x${v}`);
    }
    return { x: auxOf(values, ptr, labels) };
  }

  // ── The translation ──────────────────────────────────────────────────────
  emit(
    'DIFFERENCE-CONSTRAINTS',
    1,
    snapshot(),
    { aux: solution() },
    `One vertex per variable, plus a source v₀. Nothing is decided yet — the graph is what the constraints will be written into.`,
  );

  for (let i = 0; i < g.edges.length; i++) {
    const e = g.edges[i]!;
    shown = i + 1;
    const isZero = e.u === source;
    emit(
      'DIFFERENCE-CONSTRAINTS',
      isZero ? 5 : 3,
      snapshot(),
      {
        aux: solution(),
        edges: { [ekey(e.u, e.v)]: 'move' as Role },
        look: [vid(e.u), vid(e.v)],
      },
      isZero
        ? `A 0-weight edge from v₀ to ${name(e.v)}, so every variable is reachable and nothing is left at ∞.`
        : `${name(e.v)} − ${name(e.u)} ≤ ${e.w} becomes an edge ${name(e.u)} → ${name(e.v)} of weight ${e.w}. Relaxing it enforces d[${name(e.v)}] ≤ d[${name(e.u)}] + ${e.w}, which is the constraint written the other way round.`,
    );
  }

  // ── Bellman-Ford ─────────────────────────────────────────────────────────
  d[source] = 0;
  emit(
    'BELLMAN-FORD',
    1,
    snapshot(),
    { aux: solution(), mark: [vid(source)] },
    `Every estimate starts at ∞ except v₀'s, which is 0.`,
  );

  const relaxed = (): Record<string, Role> => {
    const out: Record<string, Role> = {};
    for (let v = 1; v <= g.n; v++) {
      if (pi[v]) out[ekey(pi[v]!, v)] = 'done';
    }
    return out;
  };

  for (let pass = 1; pass <= g.n - 1; pass++) {
    let changed = false;
    for (const e of g.edges) {
      const w = e.w ?? 0;
      stats.comparisons++;
      const better = d[e.u]! + w < d[e.v]!;
      if (better) {
        d[e.v] = d[e.u]! + w;
        pi[e.v] = e.u;
        changed = true;
        stats.writes++;
      }
      emit(
        'BELLMAN-FORD',
        4,
        snapshot(),
        {
          aux: solution(better ? e.v : undefined),
          edges: { ...relaxed(), [ekey(e.u, e.v)]: better ? 'move' : 'look' },
          look: [vid(e.u)],
          ...(better ? { move: [vid(e.v)] } : {}),
        },
        better
          ? `Pass ${pass}: ${name(e.u)} + ${w} = ${fmt(d[e.v])} beats ${name(e.v)}'s old estimate, so it drops to ${fmt(d[e.v])}.`
          : `Pass ${pass}: ${name(e.u)} + ${w} = ${fmt(d[e.u]! + w)} does not beat ${name(e.v)}'s ${fmt(d[e.v])}, so nothing changes.`,
      );
    }
    if (!changed) {
      emit(
        'BELLMAN-FORD',
        2,
        snapshot(),
        { aux: solution(), edges: relaxed() },
        `Pass ${pass} changed nothing, so no later pass can either — the estimates have settled.`,
      );
      break;
    }
  }

  // ── The feasibility test ─────────────────────────────────────────────────
  const violated = g.edges.find((e) => d[e.u]! + (e.w ?? 0) < d[e.v]!);
  stats.comparisons += g.edges.length;

  if (violated) {
    const cycle = negativeCycleVertices(g);
    emit(
      'BELLMAN-FORD',
      7,
      snapshot(),
      {
        aux: solution(),
        edges: { ...relaxed(), [ekey(violated.u, violated.v)]: 'mark' },
        mark: cycle.length > 0 ? cycle.map(vid) : [vid(violated.u), vid(violated.v)],
      },
      `${name(violated.v)} − ${name(violated.u)} ≤ ${violated.w ?? 0} still gives a shorter path after ${g.n - 1} passes, so there is a negative cycle.`,
    );
    emit(
      'DIFFERENCE-CONSTRAINTS',
      7,
      snapshot(),
      {
        aux: solution(),
        edges: { ...relaxed(), [ekey(violated.u, violated.v)]: 'mark' },
        mark: cycle.length > 0 ? cycle.map(vid) : [vid(violated.u), vid(violated.v)],
      },
      `The system is infeasible. A closed chain of these constraints adds up to 0 ≤ a negative number, and no single one of them is at fault — they conflict as a set.`,
    );
    const last = steps.at(-1)!;
    (last.hi as { result?: unknown }).result = { feasible: false, x: [] as number[] };
    return { steps, output: { vars: numVars, feasible: 0 } };
  }

  emit(
    'BELLMAN-FORD',
    8,
    snapshot(),
    { aux: solution(), edges: relaxed() },
    `No edge can be relaxed further, so there is no negative cycle and the system has a solution.`,
  );

  const x: number[] = [];
  for (let v = 1; v <= numVars; v++) {
    x.push(d[v]!);
    emit(
      'DIFFERENCE-CONSTRAINTS',
      9,
      snapshot(),
      { aux: solution(v), edges: relaxed(), mark: [vid(v)] },
      `x${v} = δ(v₀, x${v}) = ${d[v]}.`,
    );
  }

  emit(
    'DIFFERENCE-CONSTRAINTS',
    10,
    snapshot(),
    {
      aux: solution(),
      edges: relaxed(),
      done: Array.from({ length: numVars }, (_, i) => vid(i + 1)),
    },
    `A feasible solution: ${x.map((v, i) => `x${i + 1} = ${v}`).join(', ')}. Add any constant to all of them and it is still feasible — only the differences were ever constrained.`,
  );

  const last = steps.at(-1)!;
  (last.hi as { result?: unknown }).result = { feasible: true, x };
  return { steps, output: { vars: numVars, feasible: 1 } };
}

/** Lay v₀ at the left, the variables round a ring to the right of it. */
function positions(numVars: number): Array<{ x: number; y: number } | null> {
  const pos: Array<{ x: number; y: number } | null> = [null];
  for (let i = 0; i < numVars; i++) {
    const t = (i / numVars) * Math.PI * 2 - Math.PI / 2;
    pos.push({ x: 0.63 + 0.3 * Math.cos(t), y: 0.5 + 0.36 * Math.sin(t) });
  }
  pos.push({ x: 0.08, y: 0.5 });
  return pos;
}

function systemOf(
  numVars: number,
  constraints: Array<{ u: number; v: number; w: number }>,
): GraphInput {
  const source = numVars + 1;
  const zero = Array.from({ length: numVars }, (_, i) => ({ u: source, v: i + 1, w: 0 }));
  return {
    kind: 'graph',
    n: numVars + 1,
    edges: [...constraints, ...zero],
    directed: true,
    source,
    pos: positions(numVars),
  };
}

/** Does this system have a solution? Asked of the graph, not of the run. */
function feasible(g: GraphInput): boolean {
  return negativeCycleVertices(g).length === 0;
}

export const differenceConstraints: AlgorithmModule = {
  id: 'difference-constraints',
  name: 'Difference Constraints',
  visualizer: 'graph',
  aux: [
    { key: 'x', label: 'x', hint: 'the solution as it stands — each x is its own shortest path' },
  ],
  procOrder: ['DIFFERENCE-CONSTRAINTS', 'BELLMAN-FORD'],
  procedures: {
    'DIFFERENCE-CONSTRAINTS': {
      title: 'DIFFERENCE-CONSTRAINTS(A, b)',
      indent: [0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      lines: [
        'make a vertex vᵢ for each xᵢ, plus a source v₀',
        'for each constraint xⱼ - xᵢ ≤ b',
        'add edge (vᵢ, vⱼ) with weight b',
        'for i = 1 to n',
        'add edge (v₀, vᵢ) with weight 0',
        'if BELLMAN-FORD(G, w, v₀) == FALSE',
        'return "no solution"',
        'for i = 1 to n',
        'xᵢ = δ(v₀, vᵢ)',
        'return x',
      ],
    },
    'BELLMAN-FORD': {
      title: 'BELLMAN-FORD(G, w, s)',
      indent: [0, 0, 1, 2, 0, 1, 2, 0],
      lines: [
        'INITIALIZE-SINGLE-SOURCE(G, s)',
        'for i = 1 to |G.V| - 1',
        'for each edge (u, v) ∈ G.E',
        'RELAX(u, v, w)',
        'for each edge (u, v) ∈ G.E',
        'if v.d > u.d + w(u, v)',
        'return FALSE',
        'return TRUE',
      ],
    },
  },
  complexity: {
    best: 'Θ(V·E)',
    average: 'Θ(V·E)',
    worst: 'Θ(V·E)',
    space: 'Θ(V + E)',
    extra: [
      ['Vertices', 'n + 1 — one per variable, plus v₀'],
      ['Edges', 'm + n — one per constraint, plus n from v₀'],
      ['The solution', 'xᵢ = δ(v₀, vᵢ), and xᵢ + c is a solution too'],
      ['No solution', 'exactly when the constraint graph has a negative cycle'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 7,
    noun: 'system',
    placeholder: 'x2 - x1 <= 3, x3 - x2 <= -1, x1 - x3 <= 2',
    note: 'inequalities of the form xj - xi <= b',
    label: 'Constraints of the form xj - xi <= b, separated by commas',
    /**
     * A system of `n` variables, feasible about three times in four.
     *
     * Built the honest way round: draw a solution first, then write
     * constraints that hold for it, which guarantees feasibility without
     * checking. The infeasible case is built by closing a chain of strictly
     * negative bounds, which is the only way a system can fail.
     */
    generate(n: number): GraphInput {
      const numVars = Math.max(3, Math.min(n, 7));
      const constraints: Array<{ u: number; v: number; w: number }> = [];

      if (Math.random() < 0.25) {
        // A cycle x1 → x2 → ‥ → x1 whose bounds sum below zero.
        for (let i = 1; i <= numVars; i++) {
          const j = (i % numVars) + 1;
          constraints.push({ u: i, v: j, w: -1 - Math.floor(Math.random() * 2) });
        }
        return systemOf(numVars, constraints);
      }

      const truth = Array.from({ length: numVars + 1 }, () => Math.floor(Math.random() * 11) - 5);
      const wanted = numVars + 2;
      const seen = new Set<string>();
      for (let guard = 0; constraints.length < wanted && guard < 200; guard++) {
        const i = 1 + Math.floor(Math.random() * numVars);
        const j = 1 + Math.floor(Math.random() * numVars);
        if (i === j || seen.has(`${i}>${j}`)) continue;
        seen.add(`${i}>${j}`);
        // Slack of 0‥2 above the true difference: tight enough that the bound
        // matters, loose enough that the system is not one rigid answer.
        constraints.push({
          u: i,
          v: j,
          w: truth[j]! - truth[i]! + Math.floor(Math.random() * 3),
        });
      }
      return systemOf(numVars, constraints);
    },
    parse(text: string): ParsedInput {
      const parts = text
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length === 0) return { error: 'Give at least one constraint.' };
      if (parts.length > 14) return { error: 'Keep it to 14 constraints or fewer.' };

      const constraints: Array<{ u: number; v: number; w: number }> = [];
      let numVars = 0;
      for (const part of parts) {
        const m = /^x(\d+)\s*-\s*x(\d+)\s*<=?\s*(-?\d+)$/i.exec(part.replace(/≤/g, '<='));
        if (!m) return { error: `"${part}" is not of the form xj - xi <= b.` };
        const j = Number(m[1]);
        const i = Number(m[2]);
        const b = Number(m[3]);
        if (i === j) return { error: `"${part}" constrains a variable against itself.` };
        if (i < 1 || j < 1 || i > 8 || j > 8) return { error: 'Variables run from x1 to x8.' };
        if (Math.abs(b) > 40) return { error: 'Keep the bounds between −40 and 40.' };
        numVars = Math.max(numVars, i, j);
        constraints.push({ u: i, v: j, w: b });
      }
      return { value: systemOf(numVars, constraints) };
    },
    size: (input: GraphInput) => input.n - 1,
  },
  defaultSize: 4,
  result: {
    kind: 'transforms',
    /**
     * §22.4's two claims, checked against the constraints themselves.
     *
     * A feasible answer has to satisfy every inequality that was typed — not
     * the shortest-path estimates it was read off, which would be checking the
     * run against itself. An infeasible verdict has to be backed by a genuine
     * negative cycle, found by `negativeCycleVertices`, which is a
     * per-source Bellman-Ford that shares no code with the run above.
     */
    verify(input: AlgorithmInput, trace: Trace): string | null {
      if (!isGraphInput(input)) return 'not a graph input';
      const g = input;
      const source = g.n;
      const answer = (trace.steps.at(-1)?.hi as { result?: { feasible: boolean; x: number[] } })
        ?.result;
      if (!answer) return 'the run recorded no answer';

      const shouldSolve = feasible(g);
      if (answer.feasible !== shouldSolve) {
        return shouldSolve
          ? 'reported no solution, but the constraint graph has no negative cycle'
          : 'reported a solution, but the constraint graph has a negative cycle';
      }
      if (!answer.feasible) return null;

      if (answer.x.length !== g.n - 1) {
        return `reported ${answer.x.length} values for ${g.n - 1} variables`;
      }
      for (const e of g.edges) {
        if (e.u === source) continue;
        const xi = answer.x[e.u - 1]!;
        const xj = answer.x[e.v - 1]!;
        if (xj - xi > (e.w ?? 0)) {
          return `x${e.v} − x${e.u} = ${xj - xi}, which breaks the constraint ≤ ${e.w}`;
        }
      }
      return null;
    },
  },
  record,
};
