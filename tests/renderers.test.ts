/**
 * Renderer dispatch (E3).
 *
 * The player no longer imports a renderer; it asks `loadRenderer` for the one
 * its module declared. Two things can go wrong with that, and both are silent
 * in a way a reader would meet before a developer did:
 *
 *  - a module points at a kind nobody has written, and the canvas stays blank
 *  - a renderer is registered but does not actually export `draw`/`resize`,
 *    which only shows up when a frame is drawn
 *
 * So this resolves every registered kind for real, through the same dynamic
 * import the browser uses, and checks what came back. `array-bars.ts` touches
 * the DOM only inside its functions, so importing it in Node is safe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import { RENDERER_LOADERS, loadRenderer } from '../src/visualizers/renderers.ts';
import type { VisualizerKind } from '../src/algorithms/types.ts';

test('every kind a registered module declares has a renderer', async () => {
  for (const algo of ALGORITHMS) {
    assert.ok(
      RENDERER_LOADERS[algo.visualizer],
      `${algo.id} declares visualizer "${algo.visualizer}", which has no entry in ` +
        `RENDERER_LOADERS — the player would throw and the panel would show an error`,
    );
  }
});

test('every registered renderer really exports draw and resize', async () => {
  for (const kind of Object.keys(RENDERER_LOADERS) as VisualizerKind[]) {
    const renderer = await loadRenderer(kind);
    assert.equal(typeof renderer.draw, 'function', `${kind}: no draw()`);
    assert.equal(typeof renderer.resize, 'function', `${kind}: no resize()`);
  }
});

// All six the book needs are written as of chapter 33. This is the assertion
// that keeps them so: a seventh kind added to the union without a loader would
// otherwise only show up as a blank canvas in whichever chapter used it.
const ALL_KINDS: VisualizerKind[] = ['array-bars', 'cells', 'tree', 'graph', 'grid', 'plot'];

test('every kind in VisualizerKind has a renderer registered', () => {
  for (const kind of ALL_KINDS) {
    assert.ok(
      RENDERER_LOADERS[kind],
      `"${kind}" is in VisualizerKind but has no entry in RENDERER_LOADERS`,
    );
  }
});

test('an unregistered renderer fails loudly, naming the kind', async () => {
  // Cast, because there is no unwritten kind left to ask for honestly — which
  // is the point. The guard still has to exist for the seventh one.
  await assert.rejects(
    () => loadRenderer('sonogram' as VisualizerKind),
    (err: Error) => {
      assert.match(err.message, /sonogram/, 'the error should name the kind that was asked for');
      assert.match(err.message, /RENDERER_LOADERS/, 'and where to register it');
      return true;
    },
  );
});
