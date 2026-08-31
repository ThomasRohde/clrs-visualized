/**
 * The keyboard goes to a player that can answer it.
 *
 * `mountAll` used to mark the first player on the page active and install the
 * shortcuts while `init()` was still awaiting its algorithm and renderer
 * chunks. On a fast connection that window is invisible; on a slow one a Space
 * or an arrow key lands in it and calls `toggle()` against unbound buttons and
 * an empty trace.
 *
 * The loaders here are deliberately slow, and deliberately out of order — the
 * point is that which chunk arrives first must not decide which player the
 * keyboard drives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { activateWhenReady, KeyboardTarget } from '../src/visualizers/keyboard-target.ts';

/** A stand-in for a player: identity is all the target cares about. */
interface Fake {
  id: string;
}

/** Records every handover, so "it settled on the right one" is not the only claim. */
function targetFor(): { target: KeyboardTarget<Fake>; handovers: string[] } {
  const handovers: string[] = [];
  const target = new KeyboardTarget<Fake>((_previous, next) => handovers.push(next.id));
  return { target, handovers };
}

const after = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('no player is the keyboard target while every one of them is still loading', async () => {
  const { target, handovers } = targetFor();
  const players = ['a', 'b'].map((id) => ({ player: { id }, ready: after(20) }));

  activateWhenReady(target, players, () => assert.fail('no loader was meant to fail'));

  // The window the bug lived in: shortcuts are installed, nothing has loaded.
  // Read into a local first, because `assert.equal` is a TypeScript assertion
  // signature — asserting the getter itself is null narrows it to `null` for
  // the rest of the test, including after the await, where it is not.
  const duringLoad = target.active;
  assert.equal(duringLoad, null, 'a key pressed now would reach a half-built player');
  assert.deepEqual(handovers, []);

  await after(50);
  assert.equal(target.active?.id, 'a');
});

test('the earliest player on the page wins, not the fastest chunk', async () => {
  const { target, handovers } = targetFor();
  // The third player's chunk lands first, the first player's last — which is
  // what a big first algorithm and two small ones after it looks like.
  const players = [
    { player: { id: 'first' }, ready: after(60) },
    { player: { id: 'second' }, ready: after(30) },
    { player: { id: 'third' }, ready: after(5) },
  ];

  activateWhenReady(target, players, () => assert.fail('no loader was meant to fail'));
  await after(100);

  assert.equal(target.active?.id, 'first', 'the reader reads down the page, not down the network');
  // It may pass through the ones that arrived earlier — the page has to have
  // *some* usable target meanwhile — but it must end on the first.
  assert.deepEqual(handovers, ['third', 'second', 'first']);
});

test('a player whose loader fails never becomes the keyboard target', async () => {
  const { target } = targetFor();
  const failures: string[] = [];
  const players = [
    { player: { id: 'broken' }, ready: Promise.reject(new Error('chunk 404')) },
    { player: { id: 'working' }, ready: after(20) },
  ];

  activateWhenReady(target, players, (player) => failures.push(player.id));
  await after(50);

  assert.deepEqual(failures, ['broken']);
  assert.equal(
    target.active?.id,
    'working',
    'the keyboard went to a player that never loaded, or to none at all',
  );
});

test('the reader’s choice outranks any player that loads afterwards', async () => {
  const { target } = targetFor();
  const chosen = { id: 'third' };
  const players = [
    { player: { id: 'first' }, ready: after(60) },
    { player: { id: 'second' }, ready: after(30) },
    { player: chosen, ready: after(5) },
  ];

  activateWhenReady(target, players, () => assert.fail('no loader was meant to fail'));
  await after(10);

  // The reader clicked the third player once it was ready. The first one is
  // still loading, and must not take the keyboard back when it arrives.
  target.claim(chosen);
  await after(100);
  assert.equal(target.active?.id, 'third');
});

test('a claim made during loading is honoured once that player is ready', async () => {
  const { target } = targetFor();
  // What the player does with a pointerdown that arrives before init()
  // resolves: it defers the claim rather than dropping it.
  const late = { id: 'late' };
  let claimPending = false;

  const players = [
    { player: { id: 'first' }, ready: after(10) },
    {
      player: late,
      ready: after(40).then(() => {
        if (claimPending) target.claim(late);
      }),
    },
  ];
  activateWhenReady(target, players, () => assert.fail('no loader was meant to fail'));

  claimPending = true; // the reader clicked the second player while it loaded
  await after(80);

  assert.equal(target.active?.id, 'late', 'the reader’s click during the load was thrown away');
});
