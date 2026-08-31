/**
 * The legend and the bars must agree.
 *
 * Every player draws its key from `LEGENDS` in roles.ts, and the renderer
 * decides a bar's colour from the step's highlight keys. Those are two
 * separate pieces of code, and nothing but care keeps them in step: a legend
 * can promise a colour the renderer never paints, or a recorder can paint one
 * the key never mentions. Both are invisible until someone opens the page.
 *
 * `rolesForStep` is the renderer's actual colour decision and is free of DOM
 * code, so it can be run here over a real trace and compared with the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import { LEGENDS, DEFAULT_LEGEND, type Role } from '../src/visualizers/roles.ts';
import { rolesForStep } from '../src/visualizers/array-bars.ts';
import { rolesForCells, rolesForLinks } from '../src/visualizers/cells.ts';
import { rolesForTree, rolesForEdges } from '../src/visualizers/tree.ts';
import { rolesForGraph, rolesForGraphEdges } from '../src/visualizers/graph.ts';
import { rolesForGrid, rolesForArrows } from '../src/visualizers/grid.ts';
import { rolesForPlot, rolesForPlotLines } from '../src/visualizers/plot.ts';
import type { AlgorithmInput, AlgorithmModule, Step } from '../src/algorithms/types.ts';

function inputFor(algo: AlgorithmModule, n: number): AlgorithmInput {
  if (algo.input?.generate) return algo.input.generate(n);
  const min = algo.input?.min ?? 1;
  const max = algo.input?.max ?? 99;
  const span = Math.max(1, max - min + 1);
  return Array.from({ length: n }, () => min + Math.floor(Math.random() * span));
}

/**
 * Does this step put `scope` on screen?
 *
 * `scope` is the one role the renderer never applies to a bar: it draws the
 * owning-subarray bracket and its wash, and the labelled heap boundary. Both
 * read their colour from ROLE_VAR.scope, so both count as the colour
 * appearing. This mirrors the two conditions in `draw()`.
 */
function paintsScopeChrome(step: Step): boolean {
  if (!step.array) return false;
  const hi = step.hi as { range?: unknown; heapSize?: unknown };
  if (Array.isArray(hi.range)) return true;
  const n = step.array.length - 1;
  return typeof hi.heapSize === 'number' && hi.heapSize > 0 && hi.heapSize < n;
}

/**
 * Which roles this algorithm actually paints. Several runs, because a single
 * random input may never take the branch that paints a given role.
 */
function rolesPainted(algo: AlgorithmModule): Set<Role> {
  const painted = new Set<Role>();
  for (const n of [4, 7, 10, 15, 20]) {
    for (let trial = 0; trial < 5; trial++) {
      const { steps } = algo.record(inputFor(algo, n));
      for (const step of steps as Step[]) {
        for (const role of rolesForStep(step).values()) painted.add(role);
        if (paintsScopeChrome(step)) painted.add('scope');
        // `rest` is the fallback for any bar no rule claims, so it is painted
        // by omission rather than being set explicitly.
        const claimed = rolesForStep(step);
        for (let k = 1; k < (step.array?.length ?? 0); k++) {
          if (!claimed.has(k)) {
            painted.add('rest');
            break;
          }
        }
      }
    }
  }
  return painted;
}

/**
 * The same question for the cells renderer.
 *
 * `rolesForCells` is its colour decision for the boxes and `rolesForLinks` is
 * the one for the pointer arcs — a linked list's key has to answer for both,
 * since an assigned pointer is drawn in a role colour with no cell under it.
 * `scope` is chrome there too — the bracket over the run of cells currently
 * inside the structure, which is a different mark from a coloured cell and so
 * is worded differently in the key.
 */
function cellRolesPainted(algo: AlgorithmModule): Set<Role> {
  const painted = new Set<Role>();
  for (const n of [2, 5, 9, 14]) {
    const { steps } = algo.record(inputFor(algo, n));
    for (const step of steps as Step[]) {
      const claimed = rolesForCells(step);
      for (const role of claimed.values()) painted.add(role);
      for (const role of rolesForLinks(step).values()) painted.add(role);
      const scope = (step.hi as { scope?: unknown }).scope;
      if (Array.isArray(scope) && scope.length > 0) painted.add('scope');
      // `rest` is what any cell no rule claims falls back to.
      if (step.data?.kind === 'cells') {
        for (const row of step.data.rows) {
          if (row.cells.some((cell) => !claimed.has(cell.id))) {
            painted.add('rest');
            break;
          }
        }
      }
    }
  }
  return painted;
}

/**
 * The same question for the tree renderer.
 *
 * Nodes and edges both take role colours — following a pointer *is* the step
 * in a tree search, so an edge is often the only thing coloured — and the
 * subtree hull is the tree's `scope`. Node **attributes** are deliberately not
 * counted: a red-black node's colour is data, drawn as a neutral badge, and a
 * key that listed it would be claiming a coded colour that no step paints.
 */
function treeRolesPainted(algo: AlgorithmModule): Set<Role> {
  const painted = new Set<Role>();
  for (const n of [2, 5, 9, 14]) {
    const { steps } = algo.record(inputFor(algo, n));
    for (const step of steps as Step[]) {
      const claimed = rolesForTree(step);
      for (const role of claimed.values()) painted.add(role);
      for (const role of rolesForEdges(step).values()) painted.add(role);
      const scope = (step.hi as { scope?: unknown }).scope;
      if (Array.isArray(scope) && scope.length > 0) painted.add('scope');
      if (step.data?.kind === 'tree' && step.data.nodes.some((node) => !claimed.has(node.id))) {
        painted.add('rest');
      }
    }
  }
  return painted;
}

/**
 * And for the graph renderer.
 *
 * Edges carry more of the meaning here than anywhere else on the site — half
 * of Part VI is about which edges are in the answer — so a key that named
 * only vertex colours would be describing the smaller half of the picture.
 * `scope` is the ring round a named set of vertices: the queue, the cut, the
 * vertices already in the tree.
 */
function graphRolesPainted(algo: AlgorithmModule): Set<Role> {
  const painted = new Set<Role>();
  for (const n of [4, 6, 9, 12]) {
    for (let trial = 0; trial < 3; trial++) {
      const { steps } = algo.record(inputFor(algo, n));
      for (const step of steps as Step[]) {
        const claimed = rolesForGraph(step);
        for (const role of claimed.values()) painted.add(role);
        for (const role of rolesForGraphEdges(step).values()) painted.add(role);
        const scope = (step.hi as { scope?: unknown }).scope;
        if (Array.isArray(scope) && scope.length > 0) painted.add('scope');
        if (step.data?.kind === 'graph' && step.data.vertices.some((v) => !claimed.has(v.id))) {
          painted.add('rest');
        }
      }
    }
  }
  return painted;
}

/**
 * And for the grid renderer.
 *
 * Arrows carry the dependency — "this entry came from that one" — and take a
 * coded colour, so a key that answered only for cells would be describing a
 * table without the thing that makes it a dynamic program. `scope` is the
 * rectangle round a contiguous region: a row, a diagonal, a subproblem.
 */
function gridRolesPainted(algo: AlgorithmModule): Set<Role> {
  const painted = new Set<Role>();
  for (const n of [3, 5, 7, 9]) {
    for (let trial = 0; trial < 3; trial++) {
      const { steps } = algo.record(inputFor(algo, n));
      for (const step of steps as Step[]) {
        const claimed = rolesForGrid(step);
        for (const role of claimed.values()) painted.add(role);
        for (const role of rolesForArrows(step).values()) painted.add(role);
        const scope = (step.hi as { scope?: unknown }).scope;
        if (Array.isArray(scope) && scope.length > 0) painted.add('scope');
        // A cell no rule claims falls back to `rest` — but only if it holds a
        // value. An empty cell is drawn as a dashed outline in the neutral
        // ramp and is not painted in any coded colour at all.
        if (step.data?.kind === 'grid') {
          for (let r = 0; r < step.data.rows.length; r++) {
            const row = step.data.rows[r]!;
            if (row.cells.some((cell, c) => cell.value !== null && !claimed.has(`${r},${c}`))) {
              painted.add('rest');
              break;
            }
          }
        }
      }
    }
  }
  return painted;
}

// `rolesForStep` is the *array* renderer's colour decision, so an array
// module is checked against it and a cells module against `rolesForCells`.
// A module on a renderer with no checker here is a gap rather than a pass,
// so the split is asserted below rather than left implicit.
/**
 * And for the plot renderer.
 *
 * Lines carry as much of the meaning here as edges do on a graph: a link from
 * a point to its centroid *is* k-means' cost, and a series is a whole
 * algorithm's history. `scope` is the box round a named set of points.
 * Point **attributes** are deliberately not counted — a cluster number is a
 * neutral badge, and a key that listed it would promise a colour no step
 * paints.
 */
function plotRolesPainted(algo: AlgorithmModule): Set<Role> {
  const painted = new Set<Role>();
  for (const n of [3, 5, 8, 12]) {
    for (let trial = 0; trial < 3; trial++) {
      const { steps } = algo.record(inputFor(algo, n));
      for (const step of steps as Step[]) {
        const claimed = rolesForPlot(step);
        for (const role of claimed.values()) painted.add(role);
        for (const role of rolesForPlotLines(step).values()) painted.add(role);
        const scope = (step.hi as { scope?: unknown }).scope;
        if (Array.isArray(scope) && scope.length > 0) painted.add('scope');
        if (
          step.data?.kind === 'plot' &&
          (step.data.points ?? []).some((p) => !claimed.has(p.id))
        ) {
          painted.add('rest');
        }
      }
    }
  }
  return painted;
}

const ARRAY_ALGORITHMS = ALGORITHMS.filter((a) => a.visualizer === 'array-bars');
const CELL_ALGORITHMS = ALGORITHMS.filter((a) => a.visualizer === 'cells');
const TREE_ALGORITHMS = ALGORITHMS.filter((a) => a.visualizer === 'tree');
const GRAPH_ALGORITHMS = ALGORITHMS.filter((a) => a.visualizer === 'graph');
const GRID_ALGORITHMS = ALGORITHMS.filter((a) => a.visualizer === 'grid');
const PLOT_ALGORITHMS = ALGORITHMS.filter((a) => a.visualizer === 'plot');

test('every registered algorithm is checked by one of the renderers below', () => {
  const checked = new Set(
    [
      ...ARRAY_ALGORITHMS,
      ...CELL_ALGORITHMS,
      ...TREE_ALGORITHMS,
      ...GRAPH_ALGORITHMS,
      ...GRID_ALGORITHMS,
      ...PLOT_ALGORITHMS,
    ].map((a) => a.id),
  );
  for (const algo of ALGORITHMS) {
    assert.ok(
      checked.has(algo.id),
      `${algo.id} uses the "${algo.visualizer}" renderer, which has no legend check in this ` +
        `file — add one alongside its renderer rather than letting its key go unverified`,
    );
  }
});

for (const algo of CELL_ALGORITHMS) {
  test(`${algo.name}: its legend matches what the cells renderer paints`, () => {
    const legend = LEGENDS[algo.id] ?? DEFAULT_LEGEND;
    const listed = new Set(legend.map(([role]) => role));
    const painted = cellRolesPainted(algo);

    for (const role of listed) {
      assert.ok(
        painted.has(role),
        `${algo.id}: the key promises "${role}" but the renderer never paints it — ` +
          `either drop the legend entry or emit the highlight that produces it`,
      );
    }
    for (const role of painted) {
      assert.ok(
        listed.has(role),
        `${algo.id}: the renderer paints "${role}" but the key never mentions it — ` +
          `add it to LEGENDS in roles.ts, worded for this algorithm`,
      );
    }
  });
}

for (const algo of TREE_ALGORITHMS) {
  test(`${algo.name}: its legend matches what the tree renderer paints`, () => {
    const legend = LEGENDS[algo.id] ?? DEFAULT_LEGEND;
    const listed = new Set(legend.map(([role]) => role));
    const painted = treeRolesPainted(algo);

    for (const role of listed) {
      assert.ok(
        painted.has(role),
        `${algo.id}: the key promises "${role}" but the renderer never paints it — ` +
          `either drop the legend entry or emit the highlight that produces it`,
      );
    }
    for (const role of painted) {
      assert.ok(
        listed.has(role),
        `${algo.id}: the renderer paints "${role}" but the key never mentions it — ` +
          `add it to LEGENDS in roles.ts, worded for this algorithm`,
      );
    }
  });
}

for (const algo of GRAPH_ALGORITHMS) {
  test(`${algo.name}: its legend matches what the graph renderer paints`, () => {
    const legend = LEGENDS[algo.id] ?? DEFAULT_LEGEND;
    const listed = new Set(legend.map(([role]) => role));
    const painted = graphRolesPainted(algo);

    for (const role of listed) {
      assert.ok(
        painted.has(role),
        `${algo.id}: the key promises "${role}" but the renderer never paints it — ` +
          `either drop the legend entry or emit the highlight that produces it`,
      );
    }
    for (const role of painted) {
      assert.ok(
        listed.has(role),
        `${algo.id}: the renderer paints "${role}" but the key never mentions it — ` +
          `add it to LEGENDS in roles.ts, worded for this algorithm`,
      );
    }
  });
}

for (const algo of GRID_ALGORITHMS) {
  test(`${algo.name}: its legend matches what the grid renderer paints`, () => {
    const legend = LEGENDS[algo.id] ?? DEFAULT_LEGEND;
    const listed = new Set(legend.map(([role]) => role));
    const painted = gridRolesPainted(algo);

    for (const role of listed) {
      assert.ok(
        painted.has(role),
        `${algo.id}: the key promises "${role}" but the renderer never paints it — ` +
          `either drop the legend entry or emit the highlight that produces it`,
      );
    }
    for (const role of painted) {
      assert.ok(
        listed.has(role),
        `${algo.id}: the renderer paints "${role}" but the key never mentions it — ` +
          `add it to LEGENDS in roles.ts, worded for this algorithm`,
      );
    }
  });
}

for (const algo of PLOT_ALGORITHMS) {
  test(`${algo.name}: its legend matches what the plot renderer paints`, () => {
    const legend = LEGENDS[algo.id] ?? DEFAULT_LEGEND;
    const listed = new Set(legend.map(([role]) => role));
    const painted = plotRolesPainted(algo);

    for (const role of listed) {
      assert.ok(
        painted.has(role),
        `${algo.id}: the key promises "${role}" but the renderer never paints it — ` +
          `either drop the legend entry or emit the highlight that produces it`,
      );
    }
    for (const role of painted) {
      assert.ok(
        listed.has(role),
        `${algo.id}: the renderer paints "${role}" but the key never mentions it — ` +
          `add it to LEGENDS in roles.ts, worded for this algorithm`,
      );
    }
  });
}

for (const algo of ARRAY_ALGORITHMS) {
  test(`${algo.name}: its legend matches what the renderer paints`, () => {
    const legend = LEGENDS[algo.id] ?? DEFAULT_LEGEND;
    const listed = new Set(legend.map(([role]) => role));
    const painted = rolesPainted(algo);

    for (const role of listed) {
      assert.ok(
        painted.has(role),
        `${algo.id}: the key promises "${role}" but the renderer never paints it — ` +
          `either drop the legend entry or emit the highlight that produces it`,
      );
    }
    for (const role of painted) {
      assert.ok(
        listed.has(role),
        `${algo.id}: the renderer paints "${role}" but the key never mentions it — ` +
          `add it to LEGENDS in roles.ts, worded for this algorithm`,
      );
    }
  });
}

// The wording rules are about the key itself, so they hold for every module
// whatever draws it.
for (const algo of ALGORITHMS) {
  test(`${algo.name}: has a legend of its own`, () => {
    // Falling back to DEFAULT_LEGEND is legal but is always a missed teaching
    // opportunity: "being compared" instead of "compared with the pivot".
    assert.ok(
      LEGENDS[algo.id],
      `${algo.id}: no entry in LEGENDS, so its key would read in generic terms`,
    );
  });

  test(`${algo.name}: no legend entry is worded generically`, () => {
    const generic = new Set(DEFAULT_LEGEND.map(([, meaning]) => meaning));
    for (const [role, meaning] of LEGENDS[algo.id] ?? []) {
      assert.ok(
        meaning.length > 0 && !generic.has(meaning),
        `${algo.id}: legend entry for "${role}" is the generic wording "${meaning}"`,
      );
    }
  });
}
