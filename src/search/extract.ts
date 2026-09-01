/**
 * The corpus: what a chapter and an algorithm each look like as documents.
 *
 * Two kinds come out of here.
 *
 * **A section** is one `##` or `###` of a chapter, plus the run of prose before
 * the first heading, which becomes the chapter's own document. Splitting at
 * headings rather than indexing whole chapters is what makes a result a place
 * rather than a page: 39 chapters average 155 lines, and "the one about the
 * pivot" is a paragraph in chapter 7, not chapter 7.
 *
 * **An algorithm** is one of the 88 registered modules — its name and id, every
 * line of its pseudocode, its complexity, and the wording of its legend. That
 * last one matters more than it looks: `roles.ts` is the largest file in the
 * repository and holds the most distinctive prose on the site, phrases like
 * "the bad character — the mismatch that decides the jump", and none of it
 * appears in any chapter. A module has no chapter of its own, so the URL is
 * found by inverting the embedding: the `<AlgorithmPlayer id="…" />` tag in
 * some chapter's body, and the heading it sits under, which is what makes
 * Enter land on the player instead of the top of the page.
 *
 * Everything here is DOM-free and Astro-free. The endpoint feeds it the content
 * collection; `tests/search-index.test.ts` feeds it the same files read off
 * disk, and gets the same documents.
 */
import { ALGORITHMS } from '../algorithms/registry.ts';
import { legendFor } from '../visualizers/roles.ts';
import { chapterLabel, findChapter } from '../lib/book.ts';
import { slugger } from './slug.ts';
import type { Field, SearchDoc } from './types.ts';

/** One chapter, however the caller got hold of it. */
export interface ChapterSource {
  slug: string;
  title: string;
  /** Frontmatter eyebrow, e.g. "§7.1–7.3 · problems". */
  section: string;
  summary: string;
  /** The MDX body, frontmatter already removed. */
  body: string;
  /**
   * Astro's own headings, when the caller has them.
   *
   * The build passes these, so a shipped anchor is the anchor Astro emitted
   * and the two cannot drift. Without them `slug.ts` computes the same thing,
   * which is what the test path uses.
   */
  headings?: Array<{ depth: number; slug: string; text: string }>;
}

/** An algorithm doc outranks a section slightly; a section with a player… */
const PRIOR_ALGORITHM = 1.12;
/** …outranks one without, because that is where the reader is trying to get. */
const PRIOR_HAS_PLAYER = 1.06;

const MAX_META = 100;

const empty = (): Record<Field, string> => ({ name: '', title: '', head: '', code: '', body: '' });

/**
 * One section's worth of a chapter body, as split at its headings.
 *
 * `prose` and `code` are separated on the way through because they are worth
 * different amounts: a fenced block is pseudocode and recurrences, which is
 * strong evidence and terrible prose.
 */
interface Chunk {
  heading: string;
  prose: string;
  code: string;
  players: string[];
}

const TAG = /<\/?[A-Za-z][^>]*>/g;
const PLAYER = /<AlgorithmPlayer\b[^>]*\bid=["']([^"']+)["']/g;

/** Markdown decoration, once the tags are gone. */
function unmark(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/^\s{0,3}>[ \t]?/gm, '')
    .replace(/^\s*[-*+][ \t]+/gm, '')
    .replace(/^\s*\d+\.[ \t]+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Split a body into its headings, keeping fenced code apart from prose.
 *
 * Fence tracking is not decoration: one line of `appendix-summations.mdx`
 * inside a fence reads `|x| < 1`, and a tag-stripping regex let loose on it
 * would eat everything up to the next `>` on the page.
 */
export function chunkBody(body: string): Chunk[] {
  const chunks: Chunk[] = [{ heading: '', prose: '', code: '', players: [] }];
  let fence = false;

  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      fence = !fence;
      continue;
    }
    const current = chunks[chunks.length - 1]!;
    if (fence) {
      current.code += line + '\n';
      continue;
    }
    if (/^import\s/.test(line)) continue;

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      chunks.push({ heading: heading[2]!.trim(), prose: '', code: '', players: [] });
      continue;
    }

    PLAYER.lastIndex = 0;
    for (let m = PLAYER.exec(line); m !== null; m = PLAYER.exec(line)) current.players.push(m[1]!);
    current.prose += line.replace(TAG, ' ') + '\n';
  }

  return chunks;
}

/** "§7.3" out of a heading that starts with one, else the chapter's label. */
function eyebrowFor(heading: string, slug: string): string {
  const marked = /^(§[\d.–—-]*\d)/.exec(heading);
  if (marked) return marked[1]!;
  const outline = findChapter(slug);
  return outline ? chapterLabel(outline) : '';
}

function metaOf(text: string): string {
  if (text.length <= MAX_META) return text;
  const cut = text.lastIndexOf(' ', MAX_META);
  return text.slice(0, cut > 40 ? cut : MAX_META) + '…';
}

export function extractDocs(chapters: ChapterSource[]): SearchDoc[] {
  const docs: SearchDoc[] = [];
  /** algorithm id → where its player is embedded. */
  const embedded = new Map<string, { chapter: ChapterSource; anchor: string }>();

  for (const chapter of chapters) {
    const chunks = chunkBody(chapter.body);
    // Astro's slugs when the build supplied them, ours when it did not. Both
    // number a repeated heading the same way, which is why this is a sequence
    // and not a lookup by text.
    const nextSlug = slugger();
    const astro = (chapter.headings ?? []).filter((h) => h.depth === 2 || h.depth === 3);
    let seen = 0;

    for (const chunk of chunks) {
      const intro = chunk.heading === '';
      const anchor = intro ? '' : (astro[seen]?.slug ?? nextSlug(chunk.heading));
      if (!intro) seen++;

      const prose = unmark(chunk.prose);
      const code = unmark(chunk.code);
      const text = intro ? [chapter.summary, prose].filter(Boolean).join(' ') : prose;
      for (const id of chunk.players) embedded.set(id, { chapter, anchor });

      // A heading with nothing under it is a divider, not a destination.
      if (!text && !code) continue;

      const fields = empty();
      fields.title = intro ? chapter.title : chunk.heading;
      fields.head = intro ? chapter.section : chapter.title;
      fields.body = intro ? `${chapter.summary} ${prose}` : prose;
      fields.code = code;

      docs.push({
        id: intro ? chapter.slug : `${chapter.slug}#${anchor}`,
        kind: 'section',
        title: intro ? chapter.title : chunk.heading,
        chapter: chapter.title,
        eyebrow: intro ? chapter.section : eyebrowFor(chunk.heading, chapter.slug),
        path: `/chapters/${chapter.slug}/${anchor ? `#${anchor}` : ''}`,
        meta: metaOf(text || code),
        prior: chunk.players.length > 0 ? PRIOR_HAS_PLAYER : 1,
        fields,
        text: [text, code].filter(Boolean).join(' '),
      });
    }
  }

  for (const algo of ALGORITHMS) {
    const at = embedded.get(algo.id);
    if (!at) continue;

    const procedures = algo.procOrder.map((name) => algo.procedures[name]).filter(Boolean);
    const code = [
      ...algo.procOrder,
      ...procedures.map((proc) => `${proc!.title} ${proc!.lines.join(' ')}`),
    ].join(' ');

    const { best, average, worst, space, stable, inPlace, extra } = algo.complexity;
    const facts = [
      `best ${best}`,
      `average ${average}`,
      `worst ${worst}`,
      `space ${space}`,
      stable ? `stable ${stable}` : '',
      inPlace ? `in place ${inPlace}` : '',
      ...(extra ?? []).map(([term, value]) => `${term} ${value}`),
    ].filter(Boolean);

    // The key's wording, which exists nowhere else on the site and is the most
    // distinctive prose it has.
    const legend = legendFor(algo.id).map(([, meaning]) => meaning);
    const about = [...legend, algo.input?.note ?? '', algo.input?.label ?? ''].filter(Boolean);

    const fields = empty();
    fields.name = `${algo.name} ${algo.id}`;
    fields.head = at.chapter.title;
    fields.code = code;
    fields.body = [...about, ...facts].join(' ');

    docs.push({
      id: `algorithm:${algo.id}`,
      kind: 'algorithm',
      title: algo.name,
      chapter: at.chapter.title,
      eyebrow: 'Algorithm',
      path: `/chapters/${at.chapter.slug}/${at.anchor ? `#${at.anchor}` : ''}`,
      meta: `${procedures[0]?.title ?? algo.id} · ${worst} worst case`,
      prior: PRIOR_ALGORITHM,
      fields,
      // Written as prose rather than joined with separators, because this is
      // what a result's second line is cut out of. A window landing halfway
      // through `a · b · TITLE LINE LINE` reads as debris; the same window over
      // sentences reads as an answer. The pseudocode comes last and keeps its
      // procedure titles, so a match on EXTRACT-MIN still shows the line.
      text: [
        `${algo.name}: ${legend.join('; ')}.`,
        algo.input?.note ? `${algo.input.note}.` : '',
        `Best ${best}, average ${average}, worst ${worst}, space ${space}.`,
        ...procedures.map((proc) => `${proc!.title}: ${proc!.lines.join('; ')}.`),
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  return docs;
}
