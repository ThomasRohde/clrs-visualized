/**
 * Personal study state is tiny, but it is user-authored data. These tests pin
 * the merge semantics that keep a favorite update from erasing a note (and
 * vice versa), plus the catalog link that gets a reader back to the exact
 * player rather than merely somewhere in its chapter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALGORITHMS } from '../src/algorithms/registry.ts';
import { buildStudyCatalog } from '../src/study/catalog.ts';
import {
  MemoryStudyRepository,
  STUDY_SCHEMA_VERSION,
  normalizeStudyRecord,
  withFavorite,
  withNote,
  type AlgorithmStudyRecord,
} from '../src/study/repository.ts';
import { corpus } from './search-corpus.ts';

const source = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const record = (overrides: Partial<AlgorithmStudyRecord> = {}): AlgorithmStudyRecord => ({
  schemaVersion: STUDY_SCHEMA_VERSION,
  algorithmId: 'merge-sort',
  favorite: false,
  note: '',
  favoriteChangedAt: null,
  noteChangedAt: null,
  ...overrides,
});

test('favorite and note mutations preserve one another and their own clocks', () => {
  const noted = withNote(
    record({ favorite: true, favoriteChangedAt: 10 }),
    'merge-sort',
    'Stable merge',
    20,
  );
  assert.deepEqual(
    noted,
    record({ favorite: true, note: 'Stable merge', favoriteChangedAt: 10, noteChangedAt: 20 }),
  );

  const unfavorited = withFavorite(noted, 'merge-sort', false, 30);
  assert.deepEqual(
    unfavorited,
    record({ favorite: false, note: 'Stable merge', favoriteChangedAt: 30, noteChangedAt: 20 }),
  );
});

test('cleared fields remain as timestamped tombstones', () => {
  const cleared = withNote(
    record({ favorite: true, note: 'Old note', noteChangedAt: 4 }),
    'merge-sort',
    '',
    8,
  );
  const removed = withFavorite(cleared, 'merge-sort', false, 9);
  assert.equal(removed.note, '');
  assert.equal(removed.favorite, false);
  assert.equal(removed.noteChangedAt, 8);
  assert.equal(removed.favoriteChangedAt, 9);
});

test('the repository boundary ignores malformed and future records', () => {
  assert.equal(normalizeStudyRecord(null), null);
  assert.equal(normalizeStudyRecord({ ...record(), schemaVersion: 2 }), null);
  assert.equal(normalizeStudyRecord({ ...record(), favorite: 'yes' }), null);
  assert.equal(normalizeStudyRecord({ ...record(), noteChangedAt: Number.NaN }), null);

  assert.deepEqual(
    normalizeStudyRecord({ ...record({ note: 'Keep this' }), unrecognizedFutureField: true }),
    record({ note: 'Keep this' }),
  );
});

test('the in-memory repository implements the async contract deterministically', async () => {
  const times = [100, 200, 300];
  const repository = new MemoryStudyRepository(
    [record({ algorithmId: 'valid', favorite: true }), { algorithmId: 'broken' }],
    () => times.shift()!,
  );

  assert.equal((await repository.list()).length, 1, 'the malformed seed reached callers');
  const noted = await repository.setNote('merge-sort', 'Divide, recurse, merge.');
  assert.equal(noted.noteChangedAt, 100);
  const favorite = await repository.setFavorite('merge-sort', true);
  assert.equal(favorite.favoriteChangedAt, 200);
  assert.equal(favorite.note, 'Divide, recurse, merge.');
  const cleared = await repository.setNote('merge-sort', '');
  assert.equal(cleared.noteChangedAt, 300);
  assert.equal(cleared.favorite, true);

  // Returned values are copies; UI code cannot mutate the repository by
  // holding on to a previous read.
  cleared.favorite = false;
  assert.equal((await repository.get('merge-sort'))?.favorite, true);
});

test('every registered algorithm has one exact player and note destination', () => {
  const catalog = buildStudyCatalog(corpus().docs);
  assert.equal(catalog.length, ALGORITHMS.length);
  assert.deepEqual(
    catalog.map((entry) => entry.algorithmId),
    ALGORITHMS.map((algorithm) => algorithm.id),
  );

  for (const entry of catalog) {
    assert.ok(entry.playerPath.endsWith(`#algorithm-${entry.algorithmId}`));
    assert.ok(entry.notePath.endsWith(`#study-note-${entry.algorithmId}`));
  }
});

test('the study page applies the deployment base before shipping its catalog', () => {
  const page = source('src/pages/study.astro');
  assert.match(page, /buildCorpus\(\)\)\.map\(withBase\)/);
  assert.match(source('src/components/AlgorithmPlayer.astro'), /id={`algorithm-\$\{algo\.id\}`}/);
});
