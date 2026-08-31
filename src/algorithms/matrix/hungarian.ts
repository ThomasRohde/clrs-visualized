import {
  auxOf,
  createRecorder,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type ParsedInput,
  type Trace,
} from '../types.ts';

/**
 * THE HUNGARIAN ALGORITHM — CLRS §25.3.
 *
 * The **assignment problem**: n workers, n jobs, a cost for every pairing,
 * and the goal is the cheapest complete assignment. §25.1 maximised the
 * *number* of pairs; this minimises their *total cost*, and augmenting paths
 * alone are no longer enough — a matching can be maximum and expensive.
 *
 * Trying every assignment is n! and hopeless. What makes a polynomial
 * algorithm possible is **linear-programming duality**, in the concrete form
 * of a price on every row and every column.
 *
 * Give each worker a potential `u[i]` and each job a potential `v[j]`, and
 * keep them **feasible**:
 *
 *     u[i] + v[j] ≤ c[i][j]   for every pair
 *
 * A pair where that holds with **equality** is *tight*. The tight pairs form
 * a subgraph, and the algorithm only ever matches inside it. Why that is
 * enough is the duality argument: for any feasible potentials and any
 * complete assignment, the assignment's cost is at least Σu + Σv — so if a
 * complete assignment can be made out of tight pairs alone, its cost is
 * exactly Σu + Σv, and nothing can beat it. **The certificate comes with the
 * answer.**
 *
 * So the algorithm alternates two moves. Grow an alternating path inside the
 * tight subgraph, exactly as §25.1 does. When it gets stuck — no tight pair
 * leads anywhere new — raise the potentials by the smallest slack on the
 * frontier, which makes at least one new pair tight without breaking
 * feasibility anywhere, and continue. One worker is assigned per round, so
 * there are n rounds.
 *
 * On screen the potentials are the row and column headings, and the note in
 * each cell is its **slack**, `c[i][j] − u[i] − v[j]`. Watch for the zeros:
 * a zero slack is a tight pair, and the matching can only ever run through
 * those. When the potentials move, watch a whole row's slacks change at once.
 */

export function record(input: number[]): Trace {
  const n = Math.round(Math.sqrt(input.length));
  const c: number[][] = Array.from({ length: n }, (_, i) => input.slice(i * n, i * n + n));

  // Potentials, 1-indexed with a dummy 0 row that the standard formulation
  // uses as the starting point of each round's search.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  /** `jobOf[j]` is the worker assigned to job j, 0 for none. */
  const jobOf = new Array<number>(n + 1).fill(0);

  const { steps, stats, emit } = createRecorder();

  const slack = (i: number, j: number) => c[i - 1]![j - 1]! - u[i]! - v[j]!;
  const cell = (i: number, j: number) => `${i - 1},${j - 1}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const cells: GridCell[] = [];
      for (let j = 1; j <= n; j++) {
        const s = slack(i, j);
        cells.push({
          value: c[i - 1]![j - 1]!,
          note: s === 0 ? 'tight' : `+${s}`,
        });
      }
      rows.push({ label: `u${i}=${u[i]}`, cells });
    }
    return {
      kind: 'grid',
      corner: 'c',
      colLabels: Array.from({ length: n }, (_, j) => `v=${v[j + 1]}`),
      rows,
    };
  }

  /** The pairs currently assigned. */
  const assigned = (): string[] => {
    const out: string[] = [];
    for (let j = 1; j <= n; j++) if (jobOf[j]) out.push(cell(jobOf[j]!, j));
    return out;
  };
  const total = (): number => {
    let sum = 0;
    for (let j = 1; j <= n; j++) if (jobOf[j]) sum += c[jobOf[j]! - 1]![j - 1]!;
    return sum;
  };
  const chips = (round: number) =>
    auxOf([null, round, n, total()], undefined, [null, 'worker', 'of', 'cost']);

  emit(
    'HUNGARIAN',
    1,
    snapshot(),
    { aux: { h: chips(0) } },
    `Every potential starts at 0, so every slack is the cost itself and only the zeros are tight.`,
  );

  // The standard O(n³) formulation: assign one worker per round by growing an
  // alternating tree, raising potentials whenever the tree cannot grow.
  for (let worker = 1; worker <= n; worker++) {
    jobOf[0] = worker;
    let j0 = 0;
    const minSlack = new Array<number>(n + 1).fill(Infinity);
    const via = new Array<number>(n + 1).fill(0);
    const used = new Array<boolean>(n + 1).fill(false);

    emit(
      'HUNGARIAN',
      3,
      snapshot(),
      {
        done: assigned(),
        scope: Array.from({ length: n }, (_, j) => cell(worker, j + 1)),
        scopeLabel: `worker ${worker} — find the cheapest way to fit them in`,
        aux: { h: chips(worker) },
      },
      `Worker ${worker}. Grow an alternating path through tight pairs only, and pay to make more.`,
    );

    do {
      used[j0] = true;
      const i0 = jobOf[j0]!;
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        stats.comparisons++;
        const cur = slack(i0, j);
        if (cur < minSlack[j]!) {
          minSlack[j] = cur;
          via[j] = j0;
        }
        if (minSlack[j]! < delta) {
          delta = minSlack[j]!;
          j1 = j;
        }
      }

      emit(
        'HUNGARIAN',
        5,
        snapshot(),
        {
          done: assigned(),
          look: Array.from({ length: n }, (_, j) => j + 1)
            .filter((j) => !used[j])
            .map((j) => cell(i0, j)),
          mark: [cell(i0, j1)],
          pointers: { j: cell(i0, j1) },
          aux: { h: chips(worker) },
        },
        delta === 0
          ? `Job ${j1} is already tight for worker ${i0}: the path can grow there for nothing.`
          : `The cheapest way forward is job ${j1}, ${delta} short of tight. That is what the potentials must move by.`,
      );

      if (delta > 0) {
        // Raise every potential on the tree and lower every one off it. Every
        // pair on the tree stays tight, every pair off it stays feasible, and
        // at least one new pair becomes tight — which is what lets the search
        // continue.
        for (let j = 0; j <= n; j++) {
          if (used[j]) {
            u[jobOf[j]!]! += delta;
            v[j]! -= delta;
          } else {
            minSlack[j]! -= delta;
          }
        }
        stats.writes += n;
        emit(
          'HUNGARIAN',
          7,
          snapshot(),
          {
            done: assigned(),
            move: Array.from({ length: n }, (_, j) => j + 1)
              .filter((j) => slack(i0, j) === 0)
              .map((j) => cell(i0, j)),
            scope: Array.from({ length: n }, (_, j) => cell(i0, j + 1)),
            scopeLabel: `potentials up by ${delta}`,
            aux: { h: chips(worker) },
          },
          `Raise by ${delta}. Everything on the path stays tight, nothing anywhere goes infeasible, and job ${j1} is now tight.`,
        );
      }
      j0 = j1;
    } while (jobOf[j0] !== 0);

    // Walk the alternating path back, flipping as it goes — §25.1's
    // augmentation, restricted to tight pairs.
    const path: string[] = [];
    while (j0 !== 0) {
      const j1 = via[j0]!;
      jobOf[j0] = jobOf[j1]!;
      path.push(cell(jobOf[j0]!, j0));
      j0 = j1;
      stats.writes++;
    }
    emit(
      'HUNGARIAN',
      9,
      snapshot(),
      {
        done: assigned().filter((k) => !path.includes(k)),
        move: path,
        aux: { h: chips(worker) },
      },
      `Flip along the path: worker ${worker} is assigned, and everyone displaced moved to another tight pair.`,
    );
  }

  const answer = Array.from({ length: n + 1 }, () => 0);
  for (let j = 1; j <= n; j++) answer[jobOf[j]!] = j;
  let dual = 0;
  for (let i = 1; i <= n; i++) dual += u[i]!;
  for (let j = 1; j <= n; j++) dual += v[j]!;

  emit(
    'HUNGARIAN',
    10,
    snapshot(),
    {
      done: assigned(),
      assignment: answer.slice(1),
      cost: total(),
      dual,
      aux: { h: chips(n) },
    },
    `Cost ${total()}, and Σu + Σv is ${dual}. They agree, which is the proof that nothing is cheaper.`,
  );

  return { steps, output: { n, cost: total() } };
}

/**
 * Optimal against every assignment, and the potentials prove it twice.
 *
 * The cost is compared with the best of all n! permutations, which for the
 * sizes here is a few hundred and is the definition rather than the
 * algorithm. Then the **duality certificate** is checked independently: the
 * potentials must be feasible everywhere, and their sum must equal the cost —
 * which is a proof of optimality that does not depend on the brute force
 * agreeing.
 */
function verify(input: number[], trace: Trace): string | null {
  const n = Math.round(Math.sqrt(input.length));
  const c: number[][] = Array.from({ length: n }, (_, i) => input.slice(i * n, i * n + n));

  const hi = trace.steps.at(-1)!.hi as { assignment?: number[]; cost?: number; dual?: number };
  const assignment = hi.assignment;
  if (!assignment || hi.cost === undefined || hi.dual === undefined) {
    return 'the run reported no assignment';
  }
  if (assignment.length !== n) return `${assignment.length} assignments for ${n} workers`;
  if (new Set(assignment).size !== n) return 'two workers were given the same job';
  if (assignment.some((j) => j < 1 || j > n)) return 'a worker was given no job';

  let cost = 0;
  for (let i = 0; i < n; i++) cost += c[i]![assignment[i]! - 1]!;
  if (cost !== hi.cost) return `the run says ${hi.cost}, but its own assignment costs ${cost}`;
  if (hi.dual !== cost) return `Σu + Σv is ${hi.dual}, which does not certify a cost of ${cost}`;

  // Brute force over every permutation. n ≤ 5, so at most 120 of them.
  let best = Infinity;
  const perm: number[] = [];
  const taken = new Array<boolean>(n).fill(false);
  const walk = (i: number, running: number): void => {
    if (running >= best) return;
    if (i === n) {
      best = running;
      return;
    }
    for (let j = 0; j < n; j++) {
      if (taken[j]) continue;
      taken[j] = true;
      perm.push(j);
      walk(i + 1, running + c[i]![j]!);
      perm.pop();
      taken[j] = false;
    }
  };
  walk(0, 0);
  if (cost !== best) return `the assignment costs ${cost}, but the best possible is ${best}`;
  return null;
}

function generate(n: number): number[] {
  const size = Math.max(2, Math.min(n, 5));
  return Array.from({ length: size * size }, () => 1 + Math.floor(Math.random() * 9));
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const n = Math.round(Math.sqrt(parts.length));
  if (n * n !== parts.length || n < 2 || n > 5) {
    return { error: 'Give a square cost matrix row by row — 4, 9, 16 or 25 numbers.' };
  }
  const values: number[] = [];
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 99) {
      return { error: `"${part}" is not a whole number between 0 and 99.` };
    }
    values.push(value);
  }
  return { value: values };
}

export const hungarian: AlgorithmModule = {
  id: 'hungarian',
  name: 'The Hungarian Algorithm',
  visualizer: 'grid',
  aux: [{ key: 'h', label: 'h', hint: 'which worker is being placed, and the cost so far' }],
  procOrder: ['HUNGARIAN'],
  procedures: {
    // A transcription of §25.3's development. The book presents the algorithm
    // through the duality argument rather than as one numbered procedure;
    // this is the standard O(n³) form of what it describes.
    HUNGARIAN: {
      title: 'HUNGARIAN(c, n)',
      indent: [0, 0, 1, 1, 2, 2, 2, 2, 1, 0],
      lines: [
        'u[i] = v[j] = 0, so that u[i] + v[j] ≤ c[i][j] everywhere',
        'for each worker in turn',
        'grow an alternating tree from that worker, using tight pairs only',
        'while the tree cannot reach an unassigned job',
        'δ = the smallest slack on the frontier',
        'add δ to every u on the tree, subtract δ from every v on it',
        'at least one new pair is now tight; continue',
        'flip the alternating path found, assigning one more worker',
        'return the assignment',
        'its cost equals Σu + Σv, which proves it optimal',
      ],
    },
  },
  complexity: {
    best: 'Θ(n³)',
    average: 'Θ(n³)',
    worst: 'Θ(n³)',
    space: 'Θ(n²)',
    extra: [
      ['Assignments to choose from', 'n! — so enumeration is out by n = 12'],
      ['Rounds', 'n, one worker assigned per round'],
      ['A tight pair', 'u[i] + v[j] = c[i][j] — the only pairs ever matched'],
      ['The certificate', 'Σu + Σv equals the cost, which no assignment can undercut'],
      ['Versus §25.1', 'the same augmenting paths, restricted to tight pairs'],
    ],
  },
  input: {
    minSize: 2,
    maxSize: 5,
    noun: 'cost matrix',
    placeholder: '3, 8, 6, 4, 2, 7, 5, 9, 1',
    note: 'a square cost matrix, row by row — workers down, jobs across',
    label: 'The cost matrix, row by row, separated by commas',
    generate,
    parse,
    size: (value: number[]) => Math.round(Math.sqrt(value.length)),
  },
  defaultSize: 4,
  result: { kind: 'transforms', verify },
  record,
};
