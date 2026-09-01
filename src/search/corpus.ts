/**
 * The one corpus build, called by both endpoints so their arrays line up.
 *
 * `search-text.json` is indexed by position into `search-index.json`'s `docs`,
 * which is only true if both were built from the same list in the same order.
 * They are built twice rather than once — Astro runs each endpoint on its own —
 * so the ordering has to be a property of this function and not of whichever
 * ran first. Hence the explicit sort into book order, which also makes a
 * scoring tie break the way the site is laid out rather than the way the
 * filesystem happened to enumerate.
 *
 * This is the only file in `src/search/` that knows Astro exists. Everything it
 * calls is DOM-free and Astro-free, which is what lets the test suite build the
 * same documents from the same files with nothing loaded.
 */
import { render } from 'astro:content';
import { publishedChapters } from '../lib/chapters.ts';
import { ALL_CHAPTERS } from '../lib/book.ts';
import { href } from '../lib/paths.ts';
import { extractDocs, type ChapterSource } from './extract.ts';
import type { SearchDoc } from './types.ts';

const ORDER = new Map(ALL_CHAPTERS.map((chapter, at) => [chapter.slug, at]));

export async function buildCorpus(): Promise<SearchDoc[]> {
  // publishedChapters() and not getCollection(): a draft is written but not
  // published, and a search result is one more surface that must not reach
  // past that rule. tests/drafts.test.ts is where it is enforced.
  const entries = await publishedChapters();

  const sources: ChapterSource[] = [];
  for (const entry of entries) {
    // Astro's own heading slugs, so a deep link is the id it actually emitted
    // rather than one this project recomputed and hoped matched.
    const { headings } = await render(entry);
    sources.push({
      slug: entry.id,
      title: entry.data.title,
      section: entry.data.section,
      summary: entry.data.summary,
      body: entry.body ?? '',
      headings,
    });
  }

  sources.sort((a, b) => (ORDER.get(a.slug) ?? 999) - (ORDER.get(b.slug) ?? 999));
  return extractDocs(sources);
}

/**
 * A document's path with the deploy base on the front.
 *
 * `extract.ts` runs under Node in the tests, where `import.meta.env` does not
 * exist, so it deals in base-relative paths and the base is applied here — the
 * one place that is only ever reached through a build.
 */
export function withBase(doc: SearchDoc): SearchDoc {
  return { ...doc, path: href(doc.path) };
}
