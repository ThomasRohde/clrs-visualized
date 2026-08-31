/**
 * Core types shared by every algorithm in the book.
 *
 * The central idea: an algorithm does not animate itself. It *records* a
 * complete trace of what it did — one `Step` per meaningful event — and a
 * separate visualizer plays that trace back. This keeps the algorithms
 * readable (they still look like the pseudocode in CLRS), makes them
 * testable in plain Node with no DOM, and lets one player UI drive every
 * chapter of the book.
 */

/** Running tally shown under the visualization. */
export interface Stats {
  comparisons: number;
  swaps: number;
  writes: number;
}

/**
 * Highlight payload for a single step. The shape varies per algorithm — a
 * sorting step marks indices, a graph step will mark vertices and edges — so
 * this is deliberately open. Visualizers read the keys they understand and
 * ignore the rest.
 */
export interface Highlight {
  [key: string]: unknown;
}

/**
 * One row of the auxiliary strip: values that live *outside* the array while
 * the algorithm runs. Merge sort's L and R, insertion sort's `key`, counting
 * sort's C — a reader cannot find any of them in the chart, so they get their
 * own chips above it.
 *
 * Indexing follows `Step.array`: position 0 is an unused dummy, so the row is
 * 1-indexed like the book's pseudocode.
 */
export interface AuxBuffer {
  /** Chip values. `null` renders as an empty slot, keeping the row's width. */
  values: Array<number | null>;
  /** 1-based position of the chip being read or written right now. */
  ptr?: number;
  /** Captions under the chips, for when position is not index — C[0‥k]. */
  labels?: Array<string | number | null>;
}

/**
 * One cell of the `cells` renderer — a box holding a value, with an optional
 * caption and an optional pointer out of it.
 *
 * `id` is what links refer to, and what a highlight names. Positions cannot
 * do that job: a linked list splices, so the third box is not the third
 * element for long.
 */
export interface Cell {
  id: string;
  /** `null` renders as an empty box, keeping the row's width. */
  value: number | string | null;
  /** Caption under the box: an index, a bucket number, a bit position. */
  label?: string | number;
  /**
   * Id this cell points at — a list's `next`, a chain's head. `null` is NIL
   * and is drawn as a terminator; `undefined` means this structure has no
   * such pointer, and nothing is drawn.
   */
  next?: string | null;
  /** The back pointer, for a doubly linked list. Same null/undefined rule. */
  prev?: string | null;
}

/**
 * A labelled row of cells.
 *
 * Rows are what make one renderer serve the whole of R2: a linked list is one
 * row, a hash table with chaining is one row per bucket, and string matching
 * is the text over the pattern.
 */
export interface CellRow {
  /** Caption at the left of the row, e.g. "T[3]", "pattern". */
  label?: string;
  cells: Cell[];
  /** Shifts the row right by this many cell widths — the pattern's offset s. */
  offset?: number;
}

/** Snapshot for the `cells` renderer. */
export interface CellsData {
  kind: 'cells';
  rows: CellRow[];
}

/**
 * One node of the `tree` renderer.
 *
 * `keys` is a list rather than a single value so that a B-tree node fits the
 * same shape as a binary one, and `children` may hold `null` for an absent
 * child whose *slot* still matters — a BST node with only a right child has
 * to be drawn leaning right.
 */
export interface TreeNode {
  id: string;
  keys: Array<number | string>;
  children?: Array<string | null>;
  /**
   * Facts about the node that are data rather than visual state: a red-black
   * node's colour, a disjoint-set node's rank, a Huffman node's character.
   * These must never be drawn in a coded role colour — see E6 in
   * docs/PROGRESS.md, which decides the second channel before chapter 13.
   */
  attrs?: Record<string, string | number | boolean>;
}

/** Snapshot for the `tree` renderer. */
export interface TreeData {
  kind: 'tree';
  root: string | null;
  nodes: TreeNode[];
  /**
   * Further trees standing alongside `root`, drawn left to right after it.
   *
   * Two algorithms in Part IV–V are about a **forest** rather than a tree, and
   * both need the trees on screen at once: Huffman's queue holds a stand of
   * separate trees that merge two at a time, and a disjoint-set forest is
   * exactly one tree per set. A recorder with a single tree leaves this out.
   */
  roots?: string[];
}

/**
 * One vertex of the `graph` renderer.
 *
 * `x`/`y` are normalized to 0‥1 and are the recorder's business, not the
 * renderer's: a graph has no canonical layout, and the thing that makes a
 * flow network readable is source-left/sink-right, which only the code that
 * built the network knows. A snapshot whose vertices carry no position is
 * laid out on a circle instead, which is what a graph the reader typed gets.
 */
export interface GraphVertex {
  id: string;
  /** What is drawn inside the vertex. */
  label: string | number;
  x?: number;
  y?: number;
  /**
   * Facts about the vertex that are data rather than visual state: a
   * shortest-path estimate, a discovery time, a BFS distance. Drawn as
   * neutral badges, never in a coded colour — see E6 in docs/PROGRESS.md.
   */
  attrs?: Record<string, string | number | boolean>;
}

/**
 * One edge. `weight` is drawn in a chip on the line, and carries whatever the
 * chapter is about — a weight, a capacity, a flow over a capacity.
 */
export interface GraphEdge {
  from: string;
  to: string;
  weight?: number | string;
  /**
   * Drawn dashed rather than solid: an edge that exists but is not part of
   * the thing being built. A residual edge in chapter 24 is the case this
   * was added for — it is in G_f and not in G, and drawing it like a real
   * edge would make the network look like it has capacity it does not.
   */
  ghost?: boolean;
}

/** Snapshot for the `graph` renderer. */
export interface GraphData {
  kind: 'graph';
  vertices: GraphVertex[];
  edges: GraphEdge[];
  /** Directed edges get arrowheads and are one-way. */
  directed?: boolean;
}

/**
 * One cell of the `grid` renderer.
 *
 * `note` is the corner mark — the arrow a back-pointer table stores, the
 * split point a matrix-chain table records, the state a transition table
 * moves to. It is a second piece of information in the same cell, and it is
 * deliberately *not* a colour: a table where the value and the choice are two
 * hues is unreadable, and the choice is data (E6) rather than visual state.
 */
export interface GridCell {
  /** `null` renders as an empty dashed box, keeping the column's width. */
  value: number | string | null;
  note?: string;
}

/**
 * One row of the grid.
 *
 * `offset` shifts the row right by that many columns, which is what makes a
 * pattern slide along a text in chapter 32 — the same primitive `CellRow`
 * has, for the same reason.
 */
export interface GridRow {
  label?: string | number;
  cells: GridCell[];
  offset?: number;
}

/** Snapshot for the `grid` renderer. */
export interface GridData {
  kind: 'grid';
  rows: GridRow[];
  /** Headings along the top, one per column. */
  colLabels?: Array<string | number | null>;
  /** Caption in the top-left corner, e.g. "i \ j". */
  corner?: string;
}

/**
 * One plotted point — a datum, a centroid, an iterate.
 *
 * `x` and `y` are in the data's own units, not pixels. The renderer maps them
 * through the axis ranges the snapshot declares, which is what keeps a point
 * in the same place from one frame to the next.
 */
export interface PlotPoint {
  id: string;
  x: number;
  y: number;
  /**
   * Drawn larger and hollow, as a thing the algorithm *placed* rather than a
   * thing it was given: a k-means centroid, the current iterate of a descent.
   */
  anchor?: boolean;
  /** Caption beside the point. Use sparingly — a scatter of them is noise. */
  label?: string;
  /**
   * Facts about the point that are data rather than visual state — which
   * cluster it belongs to, how many points a centroid owns. Drawn as neutral
   * badges, never in a coded colour. See E6 in docs/PROGRESS.md.
   */
  attrs?: Record<string, string | number | boolean>;
}

/**
 * A polyline: a function's curve, one expert's cumulative loss, a growth rate.
 *
 * Points are joined in the order given, so a series is also how a *path* is
 * drawn — the trail an iterate has taken is a series through its own history.
 */
export interface PlotSeries {
  id: string;
  points: Array<{ x: number; y: number }>;
  /** Caption drawn at the series' last point, where a legend would go. */
  label?: string;
  dashed?: boolean;
}

/** A straight reference line across the whole plot, in the neutral ramp. */
export interface PlotRule {
  axis: 'x' | 'y';
  at: number;
  label?: string;
}

/**
 * Snapshot for the `plot` renderer.
 *
 * **The axis ranges belong to the recorder and are fixed for the whole
 * trace.** This is the same decision the graph renderer took about layout,
 * for the same reason and with more force: axes fitted to each frame's data
 * would move every point on screen as the algorithm ran, and the reader is
 * being asked to watch points converge. A centroid that appeared to move
 * because the axes rescaled would be a lie about the algorithm.
 */
export interface PlotData {
  kind: 'plot';
  xRange: [number, number];
  yRange: [number, number];
  xLabel?: string;
  yLabel?: string;
  points?: PlotPoint[];
  series?: PlotSeries[];
  rules?: PlotRule[];
  /**
   * Segments joining two points by id — a datum to the centroid it is
   * assigned to. In k-means the total length of these *is* the objective
   * function, which is why they are drawn rather than left implied.
   */
  links?: Array<{ from: string; to: string }>;
}

/**
 * A snapshot of something that is not an array.
 *
 * One member per non-array renderer, added as that renderer's phase arrives
 * rather than all at once — the shapes below were written for R2 and R3 and
 * will firm up when those renderers actually draw them. `kind` matches the
 * module's `VisualizerKind`, which is what the player dispatches on.
 */
export type StepData = CellsData | TreeData | GraphData | GridData | PlotData;

/** What a step can carry as its snapshot: the array, or a structure. */
export type StepPayload = Array<number | null> | StepData;

/**
 * One recorded moment in an algorithm's execution.
 *
 * Exactly one of `array` and `data` is set, and `emit` is what guarantees
 * that. Everything else here is shape-independent, which is the point: the
 * trace tape, the narration, the stats and the pseudocode highlight work the
 * same whether the step is showing bars or a tree.
 */
export interface Step {
  /** Which procedure is executing, e.g. "MERGE" — matches a key in `procedures`. */
  proc: string;
  /** 1-based line number within that procedure, for the pseudocode highlight. */
  line: number;
  /**
   * Snapshot of the array, for array-shaped algorithms. Index 0 is an unused
   * dummy so the array is 1-indexed like the book. Absent when the algorithm
   * is showing a structure instead — read `data` then.
   */
  array?: Array<number | null>;
  /** Snapshot of a non-array structure. Absent when `array` is set. */
  data?: StepData;
  /** What to emphasize on screen this step. */
  hi: Highlight;
  /** Counters as of this step. */
  stats: Stats;
  /** Plain-English narration of what just happened. */
  note: string;
}

/** A block of pseudocode, transcribed from the book. */
export interface Procedure {
  /** Signature line, e.g. "MERGE(A, p, q, r)". */
  title: string;
  /** Body lines, without numbers — numbering is generated. */
  lines: string[];
  /** Indent level per line, in units of one nesting step. Same length as `lines`. */
  indent: number[];
}

/** The result of recording a run. */
export interface Trace {
  steps: Step[];
  /**
   * The array as the run left it. Absent for an algorithm that has no array
   * to leave — a tree or a graph — in which case its `result.kind` must be
   * `transforms`, and `verify` carries the whole correctness claim.
   */
  finalArray?: number[];
  /**
   * Whatever the algorithm *returned*, when that is not the array itself —
   * the i-th order statistic, the number of hires, the final heap size. Only
   * a module's own `verify` knows what the keys mean.
   */
  output?: Record<string, number>;
}

/**
 * Which player/renderer drives this algorithm.
 *
 * These are R1–R6 in docs/PROGRESS.md, named there against the chapters each
 * one serves. Only `array-bars` exists so far; a module cannot usefully claim
 * one of the others until its renderer lands, and the player says so rather
 * than drawing nothing.
 */
export type VisualizerKind = 'array-bars' | 'cells' | 'tree' | 'graph' | 'grid' | 'plot';

/**
 * What a correct run of this algorithm looks like.
 *
 * Not everything in the book sorts. `RANDOMIZE-IN-PLACE` permutes, `MINIMUM`
 * leaves the array exactly as it found it, and a priority queue inserts keys
 * that were never in the input at all. The test suite asserts the structural
 * claim named here and nothing more; anything sharper goes in `verify`.
 */
export type ResultKind =
  /** `finalArray` is the input in ascending order. The default. */
  | 'sorts'
  /** `finalArray` holds exactly the input's values, in some order. */
  | 'permutes'
  /** `finalArray` is the input, untouched. */
  | 'preserves'
  /** No structural claim — `verify` carries the whole contract. */
  | 'transforms';

export interface ResultContract {
  kind: ResultKind;
  /**
   * Extra correctness check, run on every generated input. Return `null` when
   * the run was correct, or a message naming what went wrong.
   *
   * Declared as a method, not a `(input, trace) => …` property, for the
   * bivariance `AlgorithmInput` relies on — see the note there.
   */
  verify?(input: AlgorithmInput, trace: Trace): string | null;
}

/** The contract assumed for a module that does not declare one. */
export const DEFAULT_RESULT: ResultContract = { kind: 'sorts' };

export function resultOf(algo: AlgorithmModule): ResultContract {
  return algo.result ?? DEFAULT_RESULT;
}

/**
 * Complexity facts shown in the summary card.
 *
 * The first four rows are asked of every algorithm. `stable` and `inPlace`
 * are sorting questions, and are simply meaningless for `RANDOMIZED-SELECT`
 * or for a priority queue, so they are optional and the card omits the rows
 * it has no answer for. `extra` carries the fact that actually matters in
 * this algorithm — the expected number of hires, the assumption on the keys.
 */
export interface Complexity {
  best: string;
  average: string;
  worst: string;
  space: string;
  stable?: string;
  inPlace?: string;
  /** Additional rows, appended after the standard ones: `[term, value]`. */
  extra?: Array<[string, string]>;
}

/**
 * What a module is run on.
 *
 * A list of numbers covers everything the book does through Part III — the
 * array to sort, the keys to insert into a tree, the sequence of operations
 * to replay against a stack. Part VI needs a graph and chapter 32 needs a
 * text and a pattern; **add a member when its phase arrives**, which is the
 * rule `StepData` follows too.
 *
 * Widening this union will cost one line rather than fifteen, because
 * `record`, `verify` and the `InputSpec` hooks are all declared as *methods*.
 * TypeScript compares method parameters bivariantly, so a recorder that only
 * handles `number[]` still satisfies the interface once a graph joins the
 * union. That is deliberately unsound, and the player is what keeps it
 * honest: a module is only ever handed an input that its own `generate` or
 * `parse` produced.
 *
 * **Phase D is where that promise was called in**, and it did cost one line.
 * A graph is not a list of numbers between two bounds and cannot be made into
 * one without an encoding the reader would then have to type; `GraphInput` is
 * the shape every chapter of Part VI is run on.
 */
export type AlgorithmInput = number[] | GraphInput | TextInput;

/**
 * A pair of strings — the second shape Part VII and chapter 14 need.
 *
 * Longest common subsequence is run on two sequences; string matching is run
 * on a text and a pattern. Both are "two strings" and neither is a list of
 * numbers, so they share one member rather than each inventing an encoding
 * the reader would have to type.
 */
export interface TextInput {
  kind: 'text';
  /** The longer string: the text, or X. */
  text: string;
  /** The shorter one: the pattern, or Y. */
  pattern: string;
}

/** Narrows the widened input union. */
export function isTextInput(input: AlgorithmInput): input is TextInput {
  return !Array.isArray(input) && input.kind === 'text';
}

/**
 * A graph, as Part VI's twelve algorithms are handed one.
 *
 * Vertices are named `1‥n` for the same reason every array on the site is
 * 1-indexed: it matches how the book numbers things, and it means a vertex
 * can be a chip in the aux strip without a second naming scheme to keep
 * straight.
 */
export interface GraphInput {
  kind: 'graph';
  /** Vertex count. Vertices are 1‥n. */
  n: number;
  /** `w` is the weight or the capacity; absent on an unweighted graph. */
  edges: Array<{ u: number; v: number; w?: number }>;
  directed: boolean;
  /** Where a single-source algorithm starts. */
  source?: number;
  /** Where a flow network ends. */
  sink?: number;
  /** The left side of a bipartite graph; every other vertex is on the right. */
  left?: number[];
  /**
   * Normalized 0‥1 positions, 1-indexed like everything else, index 0 unused.
   * Absent means "lay it out on a circle" — which is what a graph the reader
   * typed gets, since there is nothing to infer a layout from.
   */
  pos?: Array<{ x: number; y: number } | null>;
}

/** Narrows the widened input union. */
export function isGraphInput(input: AlgorithmInput): input is GraphInput {
  return !Array.isArray(input) && input.kind === 'graph';
}

/** A custom input the reader typed: the parsed value, or why it was refused. */
export type ParsedInput = { value: AlgorithmInput } | { error: string };

/**
 * How the player builds an input for this module.
 *
 * Two layers. The **value** fields describe a list of numbers and are what
 * chapter 8 needed: counting sort wants small keys or its count array is
 * mostly zeroes, radix sort wants three digits, bucket sort wants values it
 * can read as a uniform fraction. The **shape** hooks below them replace the
 * comma-separated list outright, which is what a graph needs — it cannot be
 * described by two bounds at all.
 *
 * Every field defaults to what the player has always done, so a module that
 * says nothing behaves exactly as before.
 */
export interface InputSpec {
  /** Smallest generated value. Default 5. Ignored when `generate` is supplied. */
  min?: number;
  /** Largest generated value. Default 78. Ignored when `generate` is supplied. */
  max?: number;
  /** Placeholder for the custom-input box. */
  placeholder?: string;
  /** One-line caption beside the input controls, e.g. "keys 0–9". */
  note?: string;
  /** Ends of the size slider. Default 4 and 24. */
  minSize?: number;
  maxSize?: number;
  /** What this input is called on the button: "array", "keys", "graph". Default "array". */
  noun?: string;
  /** Accessible description of the custom-input box. Defaults to the numeric one. */
  label?: string;

  /**
   * Build a fresh input of size `n`, for the size slider and Randomize.
   * Supply this when a uniform draw between `min` and `max` is not what the
   * algorithm should be shown on — a graph, a BST insertion order chosen to
   * make the tree lean.
   */
  generate?(n: number): AlgorithmInput;
  /**
   * Parse what the reader typed. Supply this alongside `generate`: the box is
   * the only way to hand the algorithm a specific case, and a reader who can
   * generate a graph but not type one cannot ask a question of it.
   */
  parse?(text: string): ParsedInput;
  /**
   * How big an input is, for the `n` readout after a custom input is applied.
   * Defaults to its length, which is right for every list of numbers.
   */
  size?(input: AlgorithmInput): number;
}

/** Declaration of one auxiliary row, rendered above the chart. */
export interface AuxRow {
  /** Key inside `step.hi.aux` that fills this row. */
  key: string;
  /** Caption at the left of the row, e.g. "L", "C", "key". */
  label: string;
  /** Optional trailing note, e.g. "held in a variable, not in the array". */
  hint?: string;
}

/** Everything the site needs to know to teach one algorithm. */
export interface AlgorithmModule {
  /** Stable id, referenced from chapter frontmatter. */
  id: string;
  /** Display name, e.g. "Merge Sort". */
  name: string;
  /** Which renderer to use. */
  visualizer: VisualizerKind;
  /** Procedures keyed by name, in the order they should be displayed. */
  procedures: Record<string, Procedure>;
  procOrder: string[];
  /** Complexity facts. */
  complexity: Complexity;
  /** Run the algorithm on `input`, recording every step. */
  record(input: AlgorithmInput): Trace;
  /** Default input size when the page loads. */
  defaultSize?: number;
  /** What a correct run produces. Defaults to `{ kind: 'sorts' }`. */
  result?: ResultContract;
  /** Auxiliary rows to show above the chart. */
  aux?: AuxRow[];
  /** How the player generates and validates input. */
  input?: InputSpec;
}

/**
 * Helper used by every recorder: accumulates steps and counters so the
 * algorithm body stays close to the pseudocode.
 *
 * `payload` is either the array — the case for all of Parts I–II — or a
 * structure snapshot. Either way it is copied on the way in: a recorder hands
 * over the live buffer it is still mutating, and a step that stored it by
 * reference would show every earlier frame the final contents.
 */
export function createRecorder() {
  const steps: Step[] = [];
  const stats: Stats = { comparisons: 0, swaps: 0, writes: 0 };

  function emit(
    proc: string,
    line: number,
    payload: StepPayload,
    hi: Highlight,
    note: string,
  ): void {
    const snapshot = Array.isArray(payload)
      ? { array: payload.slice() }
      : // A tree's nodes and a list's cells nest, so a shallow copy is not
        // enough. `structuredClone` is the right depth and rejects anything
        // that is not plain data, which a snapshot never should be.
        { data: structuredClone(payload) };
    steps.push({
      proc,
      line,
      ...snapshot,
      hi: hi ?? {},
      stats: { ...stats },
      note: note ?? '',
    });
  }

  return { steps, stats, emit };
}

/** Formats a value for narration, rendering the sentinels as ∞ and −∞. */
export function fmt(v: number | null | undefined): string {
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  if (v === null || v === undefined) return '—';
  return String(v);
}

/**
 * Snapshots a working buffer into an aux row.
 *
 * The copy matters: `emit` slices `array` but stores `hi` by reference, so a
 * buffer handed over live would show every earlier step its final contents.
 */
export function auxOf(
  values: Array<number | null>,
  ptr?: number,
  labels?: Array<string | number | null>,
): AuxBuffer {
  return { values: values.slice(), ptr, labels };
}
