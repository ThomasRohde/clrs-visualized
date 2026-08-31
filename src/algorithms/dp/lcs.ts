import {
  auxOf,
  createRecorder,
  isTextInput,
  type AlgorithmInput,
  type AlgorithmModule,
  type GridCell,
  type GridData,
  type ParsedInput,
  type TextInput,
  type Trace,
} from '../types.ts';

/**
 * LONGEST COMMON SUBSEQUENCE — CLRS §14.4.
 *
 * A **subsequence** keeps the order but not the adjacency: `BCDB` is a
 * subsequence of `ABCBDAB`, because you can strike letters out and be left
 * with it. The longest one two sequences share is a measure of how alike they
 * are, and it is the measure `diff` uses — every line-by-line file comparison
 * you have ever read is this table.
 *
 * Brute force is hopeless in the usual way: a sequence of m letters has 2^m
 * subsequences, and checking each against the other sequence is 2^m·n.
 *
 * The recurrence comes from looking at the **last letter of each**:
 *
 *   - if `x_i == y_j`, that letter is in some longest common subsequence, and
 *     the rest of the answer is the LCS of what comes before both;
 *   - if not, at least one of the two last letters is not in the answer, so
 *     the answer is the better of dropping `x_i` or dropping `y_j`.
 *
 * Three cases, three places an entry can come from, and the whole table is
 * that. Watch the arrow into each cell: **diagonal** means the letters
 * matched and the count went up; **up** or **left** means one sequence gave
 * up a letter and the count stayed the same.
 *
 * The corner mark in each cell is `b[i, j]` — which of the three it was.
 * Following those marks back from the bottom-right corner spells out an
 * actual longest common subsequence, which the run does at the end. The
 * length is in the corner cell; the subsequence itself is only recoverable
 * because the choice was written down.
 */

const DIAG = '↖';
const UP = '↑';
const LEFT = '←';

export function record(input: TextInput): Trace {
  const X = input.text;
  const Y = input.pattern;
  const m = X.length;
  const n = Y.length;

  const c: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const b: Array<Array<string | null>> = Array.from({ length: m + 1 }, () =>
    new Array<string | null>(n + 1).fill(null),
  );
  /** Which entries have actually been computed — the rest draw as empty. */
  const set: boolean[][] = Array.from({ length: m + 1 }, () =>
    new Array<boolean>(n + 1).fill(false),
  );

  const { steps, stats, emit } = createRecorder();

  const key = (i: number, j: number) => `${i},${j}`;

  function snapshot(): GridData {
    const rows = [];
    for (let i = 0; i <= m; i++) {
      const cells: GridCell[] = [];
      for (let j = 0; j <= n; j++) {
        cells.push({
          value: set[i]![j] ? c[i]![j]! : null,
          ...(b[i]![j] ? { note: b[i]![j]! } : {}),
        });
      }
      rows.push({ label: i === 0 ? '·' : X[i - 1]!, cells });
    }
    return {
      kind: 'grid',
      corner: 'c',
      colLabels: ['·', ...Y.split('')],
      rows,
    };
  }

  const filled = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i <= m; i++) {
      for (let j = 0; j <= n; j++) if (set[i]![j]) out.push(key(i, j));
    }
    return out;
  };

  const chips = (i?: number, j?: number) => ({
    xy: auxOf([null, i === undefined ? null : i, j === undefined ? null : j], undefined, [
      null,
      i ? `x=${X[i - 1]}` : 'i',
      j ? `y=${Y[j - 1]}` : 'j',
    ]),
  });

  for (let i = 0; i <= m; i++) set[i]![0] = true;
  for (let j = 0; j <= n; j++) set[0]![j] = true;
  stats.writes += m + n + 1;
  emit(
    'LCS-LENGTH',
    3,
    snapshot(),
    {
      done: filled(),
      scope: [
        ...Array.from({ length: m + 1 }, (_, i) => key(i, 0)),
        ...Array.from({ length: n + 1 }, (_, j) => key(0, j)),
      ],
      scopeLabel: 'an empty sequence shares nothing',
      aux: chips(),
    },
    `Row 0 and column 0 are all zero: nothing is common with an empty sequence.`,
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      stats.comparisons++;
      const match = X[i - 1] === Y[j - 1];
      const from = match
        ? key(i - 1, j - 1)
        : c[i - 1]![j]! >= c[i]![j - 1]!
          ? key(i - 1, j)
          : key(i, j - 1);

      emit(
        'LCS-LENGTH',
        8,
        snapshot(),
        {
          done: filled(),
          look: match ? [key(i - 1, j - 1)] : [key(i - 1, j), key(i, j - 1)],
          move: key(i, j),
          pointers: { j: key(i, j) },
          aux: chips(i, j),
        },
        match
          ? `x${i} and y${j} are both ${X[i - 1]}. A match extends the answer diagonally above-left.`
          : `${X[i - 1]} ≠ ${Y[j - 1]}, so one of them is not in the answer: take the better neighbour.`,
      );

      if (match) {
        c[i]![j] = c[i - 1]![j - 1]! + 1;
        b[i]![j] = DIAG;
      } else if (c[i - 1]![j]! >= c[i]![j - 1]!) {
        c[i]![j] = c[i - 1]![j]!;
        b[i]![j] = UP;
      } else {
        c[i]![j] = c[i]![j - 1]!;
        b[i]![j] = LEFT;
      }
      set[i]![j] = true;
      stats.writes += 2;

      emit(
        'LCS-LENGTH',
        match ? 10 : b[i]![j] === UP ? 13 : 15,
        snapshot(),
        {
          done: filled().filter((k) => k !== key(i, j)),
          move: key(i, j),
          arrows: [{ from, to: key(i, j), role: 'look' as const }],
          pointers: { j: key(i, j) },
          aux: chips(i, j),
        },
        match
          ? `c[${i},${j}] = ${c[i]![j]} — one more than the diagonal. The arrow records the match.`
          : `c[${i},${j}] = ${c[i]![j]}, carried over. The arrow records which way it came.`,
      );
    }
  }

  // PRINT-LCS: walk the stored choices back from the corner.
  const path: string[] = [];
  const arrows: Array<{ from: string; to: string; role: 'mark' }> = [];
  const letters: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    path.push(key(i, j));
    const mark = b[i]![j]!;
    const next = mark === DIAG ? key(i - 1, j - 1) : mark === UP ? key(i - 1, j) : key(i, j - 1);
    arrows.push({ from: key(i, j), to: next, role: 'mark' });
    if (mark === DIAG) letters.unshift(X[i - 1]!);
    emit(
      'PRINT-LCS',
      mark === DIAG ? 3 : mark === UP ? 5 : 6,
      snapshot(),
      {
        done: filled().filter((k) => !path.includes(k)),
        mark: [...path],
        arrows: [...arrows],
        aux: chips(i, j),
      },
      mark === DIAG
        ? `A diagonal step: ${X[i - 1]} is in the subsequence, and both sequences step back.`
        : `A ${mark === UP ? 'vertical' : 'horizontal'} step adds no letter — it only drops one.`,
    );
    if (mark === DIAG) {
      i--;
      j--;
    } else if (mark === UP) i--;
    else j--;
  }

  emit(
    'PRINT-LCS',
    1,
    snapshot(),
    {
      done: filled().filter((k) => !path.includes(k)),
      mark: [...path],
      arrows: [...arrows],
      lcs: letters.join(''),
      length: c[m]![n]!,
      aux: chips(),
    },
    `The corner says ${c[m]![n]}, and the path back spells "${letters.join('')}".`,
  );

  return { steps, output: { length: c[m]![n]!, m, n } };
}

/**
 * The length matches an independent computation, and the string that came out
 * really is a common subsequence of that length.
 *
 * The second half is the one that matters: a table can be right and its
 * back-pointers wrong, and only re-checking the letters against both inputs
 * catches that.
 */
function verify(input: AlgorithmInput, trace: Trace): string | null {
  if (!isTextInput(input)) return 'not a text input';
  const { text: X, pattern: Y } = input;

  const hi = trace.steps.at(-1)!.hi as { lcs?: string; length?: number };
  if (hi.lcs === undefined || hi.length === undefined) return 'the run reported no result';

  // A second, independent table — rolling rows only, so it shares no code
  // with the recorder's.
  let prev = new Array<number>(Y.length + 1).fill(0);
  for (let i = 1; i <= X.length; i++) {
    const row = new Array<number>(Y.length + 1).fill(0);
    for (let j = 1; j <= Y.length; j++) {
      row[j] = X[i - 1] === Y[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, row[j - 1]!);
    }
    prev = row;
  }
  const expected = prev[Y.length]!;
  if (hi.length !== expected)
    return `the table says ${hi.length}, an independent fill says ${expected}`;
  if (hi.lcs.length !== expected) {
    return `the reconstructed "${hi.lcs}" is ${hi.lcs.length} long, not ${expected}`;
  }

  /** Is `s` a subsequence of `t`? */
  const inside = (s: string, t: string): boolean => {
    let at = 0;
    for (const ch of t) if (at < s.length && s[at] === ch) at++;
    return at === s.length;
  };
  if (!inside(hi.lcs, X)) return `"${hi.lcs}" is not a subsequence of "${X}"`;
  if (!inside(hi.lcs, Y)) return `"${hi.lcs}" is not a subsequence of "${Y}"`;
  return null;
}

const ALPHABET = 'ABCD';

/** Two strings over a four-letter alphabet, so matches are frequent enough to see. */
function generate(n: number): TextInput {
  const size = Math.max(2, Math.min(n, 9));
  const draw = (len: number) =>
    Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!).join(
      '',
    );
  return { kind: 'text', text: draw(size), pattern: draw(Math.max(2, size - 1)) };
}

function parse(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  if (parts.length !== 2) return { error: 'Give two sequences, separated by a comma.' };
  for (const part of parts) {
    if (!/^[A-Z]+$/.test(part)) return { error: `"${part}" should be letters only.` };
    if (part.length > 10) return { error: 'At most 10 letters each — the table is (m+1)×(n+1).' };
  }
  return { value: { kind: 'text', text: parts[0]!, pattern: parts[1]! } };
}

export const lcs: AlgorithmModule = {
  id: 'lcs',
  name: 'Longest Common Subsequence',
  visualizer: 'grid',
  aux: [{ key: 'xy', label: 'at', hint: 'the two letters being compared' }],
  procOrder: ['LCS-LENGTH', 'PRINT-LCS'],
  procedures: {
    'LCS-LENGTH': {
      title: 'LCS-LENGTH(X, Y, m, n)',
      indent: [0, 0, 1, 0, 1, 0, 1, 2, 3, 3, 2, 3, 3, 2, 3, 0],
      lines: [
        'let b[1:m, 1:n] and c[0:m, 0:n] be new tables',
        'for i = 1 to m',
        'c[i, 0] = 0',
        'for j = 0 to n',
        'c[0, j] = 0',
        'for i = 1 to m',
        'for j = 1 to n',
        'if x_i == y_j',
        'c[i, j] = c[i−1, j−1] + 1',
        'b[i, j] = "↖"',
        'elseif c[i−1, j] ≥ c[i, j−1]',
        'c[i, j] = c[i−1, j]',
        'b[i, j] = "↑"',
        'else c[i, j] = c[i, j−1]',
        'b[i, j] = "←"',
        'return c and b',
      ],
    },
    'PRINT-LCS': {
      title: 'PRINT-LCS(b, X, i, j)',
      indent: [0, 1, 1, 2, 1, 1],
      lines: [
        'if i == 0 or j == 0',
        'return',
        'if b[i, j] == "↖"  print x_i after recursing on (i−1, j−1)',
        'elseif b[i, j] == "↑"',
        'PRINT-LCS(b, X, i−1, j)',
        'else PRINT-LCS(b, X, i, j−1)',
      ],
    },
  },
  complexity: {
    best: 'Θ(m n)',
    average: 'Θ(m n)',
    worst: 'Θ(m n)',
    space: 'Θ(m n)',
    extra: [
      ['Brute force', 'Θ(n · 2ᵐ) — every subsequence of X, checked against Y'],
      ['Subproblems', '(m + 1)(n + 1), each solved once in O(1)'],
      ['Length alone', 'Θ(min(m, n)) space — two rows at a time'],
      ['The subsequence itself', 'needs the b table, or a cleverer Θ(m + n) trick'],
      ['Where you have met it', 'diff, and every merge conflict it produces'],
    ],
  },
  input: {
    minSize: 3,
    maxSize: 9,
    noun: 'pair',
    placeholder: 'ABCBDAB, BDCABA',
    note: 'two sequences, comma separated',
    label: 'Two sequences of letters, separated by a comma',
    generate,
    parse,
    size: (value: TextInput) => value.text.length,
  },
  defaultSize: 7,
  result: { kind: 'transforms', verify },
  record,
};
