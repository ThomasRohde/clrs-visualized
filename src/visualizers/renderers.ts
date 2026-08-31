import type { Step, VisualizerKind } from '../algorithms/types.ts';
import type { Role } from './roles.ts';

/**
 * Which renderer draws which algorithm.
 *
 * A module declares a `VisualizerKind`; this is where that name turns into
 * code. One dynamic import per renderer, for the same reason `lazy.ts` does
 * it per algorithm: a chapter downloads the one renderer it uses, not all
 * six, so page weight stays flat as Parts III–VII arrive.
 *
 * **Adding a renderer means adding a line here and a member to
 * `VisualizerKind`** — the table below is the only place the player learns
 * that a renderer exists.
 */

/**
 * What every renderer is handed alongside the step.
 *
 * Deliberately one shared shape rather than a per-renderer options type:
 * renderers read the fields they understand and ignore the rest, exactly as
 * they already do with `Step.hi`. `maxValue` means nothing to a linked list,
 * and that costs the linked list nothing.
 */
export interface RenderOptions {
  /** Tallest value the run will reach, so bar heights are stable across steps. */
  maxValue: number;
  /**
   * Smallest value the run will reach, when that is below zero.
   *
   * Absent — and 0 — mean "the axis starts at the baseline", which is what
   * every algorithm on the site did until Problem 4-1 needed a maximum
   * subarray, a problem that is trivial unless the input has negative numbers
   * in it. Like `maxValue` it is computed over the whole trace and fixed for
   * its duration: an axis refitted per frame would move every bar on screen as
   * the algorithm ran, which is the rule `plot.ts` states at more length and
   * for exactly the same reason.
   */
  minValue?: number;
}

/**
 * The contract a renderer satisfies. `draw` paints one frame; `resize`
 * rebuilds the backing store for the current size and then draws.
 *
 * Both take `Step | undefined` because the player calls them before a trace
 * exists — on first layout, and from the `ResizeObserver` that fires on
 * observe.
 */
export interface Renderer {
  draw(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void;
  resize(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void;
  /**
   * Which coded role each thing on screen is painted in, keyed by the id it
   * belongs to — a bar's position, a vertex's id, `from>to` for an edge.
   *
   * This is the renderer's own colour decision, already written as the
   * `rolesFor…` exports that `tests/legends.test.ts` checks the key against.
   * Naming it in the contract is what lets `describe.ts` build the canvas's
   * text alternative out of exactly what is painted: a second reading of
   * `step.hi` would be a second vocabulary, and the two would drift the first
   * time a renderer learned a new highlight key.
   */
  roles(step: Step | undefined): Map<string | number, Role>;
}

/**
 * All six are written as of chapter 33, so this map is now total in practice
 * while staying `Partial` in type: the guard in `loadRenderer` is what a
 * seventh kind would meet, and a module pointed at a kind with no entry fails
 * loudly rather than drawing nothing — which is the failure that would
 * otherwise reach a reader.
 */
export const RENDERER_LOADERS: Partial<Record<VisualizerKind, () => Promise<Renderer>>> = {
  'array-bars': () => import('./array-bars.ts'),
  cells: () => import('./cells.ts'),
  tree: () => import('./tree.ts'),
  graph: () => import('./graph.ts'),
  grid: () => import('./grid.ts'),
  plot: () => import('./plot.ts'),
};

export async function loadRenderer(kind: VisualizerKind): Promise<Renderer> {
  const loader = RENDERER_LOADERS[kind];
  if (!loader) {
    throw new Error(
      `No renderer for visualizer kind "${kind}". Write src/visualizers/<kind>.ts exporting ` +
        `draw() and resize(), then register it in RENDERER_LOADERS (src/visualizers/renderers.ts).`,
    );
  }
  return loader();
}
