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
 * ACTIVITY SELECTION — CLRS §15.1: GREEDY-ACTIVITY-SELECTOR, the first
 * problem in the book where being greedy is provably right.
 *
 * n activities want one hall. Each has a start and a finish, two of them can
 * both run only if they do not overlap, and the goal is the **largest**
 * compatible set — not the busiest hall, not the longest activities, the most
 * activities.
 *
 * The greedy rule is one line long: **always take the compatible activity
 * that finishes first.** No lookahead, no backtracking, no comparing of
 * alternatives — and the answer it gives is optimal, which is not obvious and
 * is what §15.1's exchange argument proves. Sort by finish time and the whole
 * algorithm is a single pass.
 *
 * That is worth contrasting with what chapter 14 does to problems like this.
 * Dynamic programming would consider both choices at every step and combine
 * subproblem answers; greedy commits to one and never looks back. It works
 * here because of the **greedy-choice property**: some optimal solution
 * contains the first-finishing activity, so choosing it throws nothing away.
 *
 * The picture is a timeline. Each row is one activity, drawn across the
 * columns it occupies, so two activities overlap exactly when their bars share
 * a column — the compatibility test is something you can see rather than
 * compute. Activities arrive sorted by finish time, which is why the bars end
 * further right as you go down.
 */

/** One activity: `[start, finish)`, half-open so touching is not overlapping. */
interface Activity {
  id: string;
  start: number;
  finish: number;
}

/** The input is flat pairs — s₁, f₁, s₂, f₂, … — so it stays a list of numbers. */
export function activitiesOf(input: number[]): Activity[] {
  const out: Activity[] = [];
  for (let i = 0; i + 1 < input.length; i += 2) {
    const start = Math.max(0, Math.round(input[i]!));
    const finish = Math.max(start + 1, Math.round(input[i + 1]!));
    out.push({ id: `a${out.length + 1}`, start, finish });
  }
  // The algorithm assumes finish times are in order; the book sorts first and
  // so does the player, so the reader can type them in any order they like.
  return out.sort((a, b) => a.finish - b.finish || a.start - b.start);
}

export function record(input: number[]): Trace {
  const acts = activitiesOf(input).map((a, i) => ({ ...a, id: `a${i + 1}` }));
  const n = acts.length;
  const { steps, stats, emit } = createRecorder();

  /**
   * The timeline: one row per activity, each drawn from its start column to
   * its finish column. `CellRow.offset` is what puts the bar where the
   * activity is in time — every row shares the column grid, so a column is a
   * unit of time and an overlap is two bars in the same column.
   *
   * Only the first cell of a bar carries the number; the rest hold an empty
   * string, which draws as part of the bar rather than as an empty slot.
   */
  function snapshot(): CellsData {
    return {
      kind: 'cells',
      rows: acts.map((a, i) => {
        const cells: Cell[] = [];
        for (let t = a.start; t < a.finish; t++) {
          cells.push({
            id: `${a.id}`.concat(t === a.start ? '' : `-${t}`),
            value: t === a.start ? i + 1 : '',
          });
        }
        return { label: a.id, offset: a.start, cells };
      }),
    };
  }

  /** Every cell of one activity's bar, so a highlight covers the whole thing. */
  const barOf = (i: number): string[] => {
    const a = acts[i]!;
    const ids: string[] = [];
    for (let t = a.start; t < a.finish; t++) ids.push(t === a.start ? a.id : `${a.id}-${t}`);
    return ids;
  };
  const barsOf = (list: number[]): string[] => list.flatMap((i) => barOf(i));
  /** The hall is free from here; the activity under test starts here. */
  const chips = (free: number, start: number | null) => ({
    times: auxOf([null, free, start], 1, [null, 'f[k]', 's[m]']),
  });

  if (n === 0) {
    emit('GREEDY-ACTIVITY-SELECTOR', 1, snapshot(), { aux: chips(0, null) }, `No activities.`);
    return { steps, output: { chosen: 0, activities: 0 } };
  }

  const chosen: number[] = [0];
  let k = 0;
  emit(
    'GREEDY-ACTIVITY-SELECTOR',
    1,
    snapshot(),
    { done: barOf(0), mark: barOf(0), aux: chips(acts[0]!.finish, null) },
    `A = {a1}. The activity that finishes first is always in some optimal answer — that is the greedy choice.`,
  );

  for (let m = 1; m < n; m++) {
    const a = acts[m]!;
    stats.comparisons++;
    const compatible = a.start >= acts[k]!.finish;
    emit(
      'GREEDY-ACTIVITY-SELECTOR',
      4,
      snapshot(),
      {
        done: barsOf(chosen),
        mark: barOf(k),
        look: barOf(m),
        aux: chips(acts[k]!.finish, a.start),
      },
      compatible
        ? `a${m + 1} starts at ${a.start}, and the hall is free from ${acts[k]!.finish}. No overlap, so take it.`
        : `a${m + 1} starts at ${a.start}, before a${k + 1} finishes at ${acts[k]!.finish}. The bars share a column, so it cannot run.`,
    );

    if (!compatible) continue;
    chosen.push(m);
    k = m;
    stats.writes++;
    emit(
      'GREEDY-ACTIVITY-SELECTOR',
      6,
      snapshot(),
      {
        done: barsOf(chosen),
        mark: barOf(k),
        aux: chips(acts[k]!.finish, a.start),
      },
      `A = A ∪ {a${m + 1}}, and k = ${m + 1}. Only the finish time of the last one chosen matters from here on.`,
    );
  }

  emit(
    'GREEDY-ACTIVITY-SELECTOR',
    7,
    snapshot(),
    {
      done: barsOf(chosen),
      selected: chosen.map((i) => i + 1),
      aux: chips(acts[k]!.finish, null),
    },
    `Return A: ${chosen.length} of ${n} activities, chosen in one pass with no backtracking.`,
  );

  return { steps, output: { chosen: chosen.length, activities: n } };
}

/**
 * A day of activities that overlap enough to be interesting: random
 * half-open intervals inside a fixed window, sorted by finish time.
 */
function generate(n: number): number[] {
  const count = Math.max(1, Math.min(n, 12));
  const span = Math.max(8, Math.min(16, count + 6));
  const acts: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(Math.random() * (span - 2));
    const length = 1 + Math.floor(Math.random() * 3);
    acts.push([start, Math.min(span, start + length)]);
  }
  // Pin one activity to each end of the day. Two of them are then certainly
  // compatible, so a generated input always has something to choose — a
  // generator that only usually shows the interesting case makes a test that
  // only usually passes.
  if (count >= 2) {
    acts[0] = [0, 1];
    acts[count - 1] = [span - 1, span];
  }
  acts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return acts.flat();
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: 'Give at least one activity, as start-finish.' };
  if (parts.length > 12) return { error: 'At most 12 activities — one row each has to fit.' };

  const out: number[] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
    if (!m)
      return { error: `"${part}" is not an activity. Write each one as start-finish, e.g. 3-7.` };
    const start = Number(m[1]);
    const finish = Number(m[2]);
    if (finish <= start) return { error: `"${part}" finishes before it starts.` };
    if (finish > 16) return { error: `"${part}" runs past 16, and the timeline stops there.` };
    out.push(start, finish);
  }
  return { value: out };
}

/** The best possible answer, by brute force — small n, and worth knowing exactly. */
function optimum(acts: Activity[]): number {
  const n = acts.length;
  if (n === 0 || n > 14) return -1;
  let best = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    let ok = true;
    let count = 0;
    let last = -1;
    for (let i = 0; i < n && ok; i++) {
      if (!(mask & (1 << i))) continue;
      if (last >= 0 && acts[i]!.start < acts[last]!.finish) ok = false;
      last = i;
      count++;
    }
    if (ok && count > best) best = count;
  }
  return best;
}

export const activitySelection: AlgorithmModule = {
  id: 'activity-selection',
  name: 'Activity Selection',
  visualizer: 'cells',
  aux: [
    {
      key: 'times',
      label: 'time',
      hint: 'when the hall comes free, and when the activity under test starts',
    },
  ],
  procOrder: ['GREEDY-ACTIVITY-SELECTOR'],
  procedures: {
    'GREEDY-ACTIVITY-SELECTOR': {
      title: 'GREEDY-ACTIVITY-SELECTOR(s, f, n)',
      indent: [0, 0, 0, 1, 2, 2, 0],
      lines: [
        'A = {a₁}',
        'k = 1',
        'for m = 2 to n',
        'if s[m] ≥ f[k]',
        'A = A ∪ {aₘ}',
        'k = m',
        'return A',
      ],
    },
  },
  complexity: {
    best: 'Θ(n)',
    average: 'Θ(n)',
    worst: 'Θ(n)',
    space: 'Θ(1)',
    extra: [
      ['Given sorted finish times', 'Θ(n) — one pass'],
      ['Including the sort', 'Θ(n lg n)'],
      ['Choices reconsidered', 'none — greedy never backtracks'],
      ['Why it is optimal', 'the greedy-choice property, §15.1'],
      ['Compare', 'dynamic programming would weigh both branches'],
    ],
  },
  input: {
    minSize: 4,
    maxSize: 10,
    noun: 'day',
    placeholder: '1-4, 3-5, 0-6, 5-7',
    note: 'each activity as start-finish',
    label: 'The activities, each written start-finish, separated by commas',
    generate,
    parse,
    // The input is pairs, so its length is twice the number of activities.
    size: (value: number[]) => Math.floor(value.length / 2),
  },
  defaultSize: 8,
  result: {
    // Two claims, and the second is the chapter's whole point: the set is
    // compatible, and it is as large as any compatible set — checked against
    // brute force rather than against the same greedy rule that produced it.
    kind: 'transforms',
    verify: (input: number[], trace) => {
      const acts = activitiesOf(input);
      let selected: number[] | null = null;
      for (const step of trace.steps) {
        const hi = step.hi as { selected?: number[] };
        if (hi.selected) selected = hi.selected;
      }
      if (acts.length === 0) return null;
      if (!selected) return 'the run never reported a selection';

      const picked = selected.map((i) => acts[i - 1]!);
      for (let i = 1; i < picked.length; i++) {
        if (picked[i]!.start < picked[i - 1]!.finish) {
          return `a${selected[i]} starts at ${picked[i]!.start}, before a${selected[i - 1]} finishes at ${picked[i - 1]!.finish}`;
        }
      }
      const best = optimum(acts);
      if (best >= 0 && picked.length !== best) {
        return `the greedy choice took ${picked.length} activities, but ${best} can run`;
      }
      return null;
    },
  },
  record,
};
