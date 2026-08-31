/**
 * What `draft: true` means, in one place.
 *
 * The chapter schema has had the field since the first commit and nothing read
 * it: a draft routed, showed as ready in the sidebar and on the home page, and
 * was listed in the generated README, so the flag was decoration. The
 * schema's own comment had it backwards too, telling you to set it `false` to
 * hide a chapter — which is the default.
 *
 * **The semantics: a draft is written but not published.** In a production
 * build it is exactly as if its MDX file did not exist — no content on its
 * route, dimmed in the sidebar and the home-page outline, absent from the
 * README contents. While developing (`npm run dev`) it is readable, with a
 * banner on the page saying so, because a chapter you cannot look at is a
 * chapter you cannot write.
 *
 * That "in one place" is the point of this file. The rule is applied by four
 * surfaces — the route, the sidebar, the home page and the README generator —
 * and three of them are Astro components while the fourth is a plain script
 * with no Astro at all. Nothing here imports `astro:content`, so all four can
 * share it and the test suite can run it.
 */

/** The shape both callers have: an entry with the schema's `draft` flag. */
export interface DraftFlagged {
  data: { draft: boolean };
}

/**
 * The entries a build should publish.
 *
 * `showDrafts` is the caller's, not this file's, because "are we developing"
 * is a fact about the build and reading it here would make the function
 * untestable in exactly the case worth testing.
 */
export function published<T extends DraftFlagged>(entries: T[], showDrafts: boolean): T[] {
  return showDrafts ? entries : entries.filter((entry) => !entry.data.draft);
}

/**
 * Read the `draft` flag out of a chapter file's frontmatter.
 *
 * The site reads it through the zod schema in content.config.ts, but
 * `scripts/sync-readme.mjs` reads the files off disk with no Astro loaded.
 * Both have to reach the same answer, so the parsing is here rather than a
 * regex in the script — a README that lists a chapter the site does not serve
 * is the same bug in a different place.
 */
export function parseDraftFlag(source: string): boolean {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!front) return false;
  return /^draft:[ \t]*true[ \t]*$/m.test(front[1]!);
}
