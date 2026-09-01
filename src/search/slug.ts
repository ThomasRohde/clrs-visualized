/**
 * The heading anchors Astro already puts on the page.
 *
 * Astro's markdown pipeline gives every `##` and `###` an `id` — the chapter
 * on quicksort ships `id="73--moving-the-worst-case-off-the-input"` — so
 * deep-linking a search result into the middle of a chapter costs nothing but
 * getting the same string back out.
 *
 * **In the build, this file is the fallback and not the source.** The endpoint
 * hands the extractor Astro's own `headings` from `render(entry)`, so a
 * shipped anchor is the anchor Astro emitted and the two cannot drift. This
 * exists for the test path, which reads the MDX off disk with no Astro loaded
 * — and `tests/search-index.test.ts` pins it against ids taken from a real
 * build, so the URLs those tests assert are URLs the site actually serves.
 *
 * The rule is github-slugger's, which is what Astro uses: lowercase, drop
 * punctuation and symbols apart from `-` and `_`, turn spaces into hyphens.
 * Note what that does to a dash — an em dash is punctuation and disappears,
 * leaving the spaces on either side of it to become the doubled hyphen in
 * `problem-7-1--hoares-partition`.
 */

/**
 * Punctuation and symbols, less the two characters a slug keeps.
 *
 * `\p{No}` is in here for one heading: "…in n steps instead of n³" anchors at
 * `…instead-of-n`. A superscript is a number rather than a symbol, so leaving
 * it out of the set matched 212 of the site's 213 headings and broke the
 * thirteenth link in chapter 26.
 */
const DROP = /[\p{P}\p{S}\p{No}]/gu;

export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(DROP, (ch) => (ch === '-' || ch === '_' ? ch : ''))
    .replace(/ /g, '-');
}

/**
 * Slugs for a document's headings in order, disambiguated as Astro does it:
 * the second "Watch it run" on a page is `watch-it-run-1`.
 */
export function slugger(): (heading: string) => string {
  const seen = new Map<string, number>();
  return (heading: string): string => {
    const base = slugify(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}
