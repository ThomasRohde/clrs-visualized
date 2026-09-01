/**
 * The real corpus, assembled off disk with no Astro loaded.
 *
 * Not a test file — `node --test "tests/**\/*.test.ts"` will not pick it up —
 * but the thing two test files need and neither should own. It is the same
 * move `tests/content-claims.test.ts` makes: read the chapters as files, import
 * the registry as a module, and assert against what the site is actually built
 * from rather than against a fixture that can quietly stop resembling it.
 *
 * It mirrors `src/search/corpus.ts`, which is the build's path and cannot be
 * imported here because it pulls in `astro:content`. The two agreeing is not
 * left to inspection: `search-index.test.ts` asserts structurally that the
 * build filters drafts and sorts into book order, which is all this duplicates.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDraftFlag } from '../src/lib/drafts.ts';
import { ALL_CHAPTERS } from '../src/lib/book.ts';
import { buildIndex } from '../src/search/bm25.ts';
import { extractDocs, type ChapterSource } from '../src/search/extract.ts';
import type { SearchDoc, SearchIndex } from '../src/search/types.ts';

const CHAPTERS = fileURLToPath(new URL('../src/content/chapters/', import.meta.url));

const ORDER = new Map(ALL_CHAPTERS.map((chapter, at) => [chapter.slug, at]));

/**
 * One frontmatter string field.
 *
 * Only ever used for `title`, `section` and `summary`, every one of which is a
 * single line in all 39 files. **It must not be pointed at `algorithms:`**,
 * which appears in both the inline and the multi-line YAML flow form — that is
 * the trap `src/lib/drafts.ts` sidesteps by regexing nothing but `draft`.
 */
function field(frontmatter: string, name: string): string {
  const found = new RegExp(`^${name}:[ \\t]*(.*)$`, 'm').exec(frontmatter);
  const raw = found?.[1]?.trim() ?? '';
  return /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
}

/** Every chapter the site would publish, in book order. */
export function readChapters(): ChapterSource[] {
  const sources: ChapterSource[] = [];

  for (const file of readdirSync(CHAPTERS)) {
    // The content collection's own glob: `**/[^_]*.{md,mdx}`.
    if (!file.endsWith('.mdx') || file.startsWith('_')) continue;
    const source = readFileSync(CHAPTERS + file, 'utf8');
    if (parseDraftFlag(source)) continue;

    const split = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
    if (!split) throw new Error(`${file} has no frontmatter`);

    sources.push({
      slug: file.replace(/\.mdx$/, ''),
      title: field(split[1]!, 'title'),
      section: field(split[1]!, 'section'),
      summary: field(split[1]!, 'summary'),
      body: split[2]!,
    });
  }

  sources.sort((a, b) => (ORDER.get(a.slug) ?? 999) - (ORDER.get(b.slug) ?? 999));
  return sources;
}

/** The raw MDX of every published chapter, keyed by slug. */
export function chapterBodies(): Map<string, string> {
  return new Map(readChapters().map((chapter) => [chapter.slug, chapter.body]));
}

let cached: { docs: SearchDoc[]; index: SearchIndex } | null = null;

/** The documents and the index the site would ship, built once per process. */
export function corpus(): { docs: SearchDoc[]; index: SearchIndex } {
  if (!cached) {
    const docs = extractDocs(readChapters());
    cached = { docs, index: buildIndex(docs) };
  }
  return cached;
}
