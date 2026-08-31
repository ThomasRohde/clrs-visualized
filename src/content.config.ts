import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Chapter content.
 *
 * One MDX file per chapter, named for its slug in src/lib/book.ts. The file's
 * frontmatter says which algorithms it animates; the body is ordinary prose
 * that may embed <AlgorithmPlayer /> and <ComplexityCard /> anywhere.
 */
const chapters = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/chapters' }),
  schema: z.object({
    /** Chapter title. Should match the book. */
    title: z.string(),
    /** Section reference shown as the eyebrow, e.g. "§2.1" or "Chapter 6". */
    section: z.string(),
    /** One-sentence summary shown under the title and on the index page. */
    summary: z.string(),
    /**
     * Algorithm ids animated in this chapter. Every id must be registered in
     * src/algorithms/registry.ts — the build fails loudly otherwise, which is
     * exactly what you want when adding content.
     */
    algorithms: z.array(z.string()).default([]),
    /**
     * Written but not published. A draft is served in `npm run dev` with a
     * banner on it, and in a production build behaves exactly as if the file
     * did not exist — no content on its route, dimmed in the sidebar and the
     * home-page outline, absent from the generated README. See
     * src/lib/drafts.ts, which is where the rule lives and is applied from.
     */
    draft: z.boolean().default(false),
  }),
});

export const collections = { chapters };
