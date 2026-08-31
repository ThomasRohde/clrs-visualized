import { getCollection, type CollectionEntry } from 'astro:content';
import { published } from './drafts.ts';

/**
 * The chapters this build serves.
 *
 * Every surface that asks "which chapters exist" goes through here rather than
 * calling `getCollection('chapters')` itself, because a draft filtered out of
 * the sidebar but still routed — or routed but missing from the home page — is
 * worse than one that is consistently visible. See drafts.ts for what the flag
 * means; `tests/drafts.test.ts` asserts that no surface reaches past this.
 */

/** Drafts are readable while developing, and nowhere else. */
export const SHOW_DRAFTS = import.meta.env.DEV;

export async function publishedChapters(): Promise<Array<CollectionEntry<'chapters'>>> {
  return published(await getCollection('chapters'), SHOW_DRAFTS);
}
