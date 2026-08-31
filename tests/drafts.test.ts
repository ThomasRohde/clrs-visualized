/**
 * `draft: true` has to mean something, and the same thing everywhere.
 *
 * The schema declared the field from the first commit and no caller read it,
 * so a work-in-progress chapter routed, showed as ready in the sidebar and on
 * the home page, and appeared in the generated README. The rule now lives in
 * src/lib/drafts.ts and four surfaces apply it.
 *
 * Two things are worth asserting and they are different in kind. The first is
 * the rule itself, which is a pure function and is tested as one. The second
 * is that nobody reaches past it — a surface that calls `getCollection` for
 * chapters directly is back where this started, and no amount of testing the
 * rule would notice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDraftFlag, published } from '../src/lib/drafts.ts';

const root = (rel: string): string => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const source = (rel: string): string => readFileSync(root(rel), 'utf8');

const entry = (id: string, draft: boolean) => ({ id, data: { draft } });

test('a production build publishes everything except the drafts', () => {
  const entries = [entry('written', false), entry('half-done', true), entry('also-written', false)];
  assert.deepEqual(
    published(entries, false).map((e) => e.id),
    ['written', 'also-written'],
  );
});

test('a dev build publishes the drafts too, so they can be looked at', () => {
  const entries = [entry('written', false), entry('half-done', true)];
  assert.deepEqual(
    published(entries, true).map((e) => e.id),
    ['written', 'half-done'],
  );
});

test('the draft flag is read the same way with Astro and without it', () => {
  const front = (body: string) => `---\ntitle: X\nsection: Chapter 1\n${body}---\n\nProse.\n`;

  assert.equal(parseDraftFlag(front('draft: true\n')), true);
  assert.equal(parseDraftFlag(front('draft: false\n')), false);
  assert.equal(parseDraftFlag(front('')), false, 'absent means published, as the schema default');
  assert.equal(parseDraftFlag('No frontmatter at all.'), false);
  // The word in prose is not the flag; only the frontmatter is.
  assert.equal(
    parseDraftFlag(`${front('')}\nThis chapter is still a draft: true enough.\n`),
    false,
    'a mention in the body was read as the flag',
  );
});

test('every surface that lists chapters goes through the draft filter', () => {
  const surfaces = [
    'src/pages/index.astro',
    'src/pages/chapters/[slug].astro',
    'src/components/BookNav.astro',
  ];
  for (const file of surfaces) {
    const text = source(file);
    assert.ok(
      !/getCollection\(\s*['"]chapters['"]/.test(text),
      `${file} reads the chapters collection directly, so a draft would still reach it — ` +
        'use publishedChapters() from src/lib/chapters.ts',
    );
    assert.ok(
      /publishedChapters\(\)/.test(text),
      `${file} lists chapters without going through publishedChapters()`,
    );
  }
  // The README generator has no Astro at all, so it shares the parser instead.
  assert.match(
    source('scripts/sync-readme.mjs'),
    /parseDraftFlag/,
    'sync-readme.mjs would list a chapter the site serves as a stub',
  );
});

test('no chapter in the repository is currently held back as a draft', () => {
  // Not a rule — a draft is a legitimate state — but the site claims all 35
  // chapters and four appendices are written, and a forgotten flag would make
  // that claim false while every count still agreed with itself.
  const dir = root('src/content/chapters');
  const held = readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
    .filter((f) => parseDraftFlag(readFileSync(`${dir}/${f}`, 'utf8')));
  assert.deepEqual(
    held,
    [],
    `these chapters are drafts and are served as stubs: ${held.join(', ')}`,
  );
});
