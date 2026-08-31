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
    /** Set false to hide a work-in-progress chapter from navigation. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { chapters };
