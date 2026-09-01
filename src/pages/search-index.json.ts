/**
 * The ranking payload: everything needed to order results, and nothing else.
 *
 * Prerendered like every other page here — there is no adapter and no server,
 * so this is a file in `dist/` that the search dialog fetches once and keeps.
 * The snippet text is deliberately *not* in it; see `search-text.json.ts`.
 */
import type { APIRoute } from 'astro';
import { buildCorpus, withBase } from '../search/corpus.ts';
import { buildIndex } from '../search/bm25.ts';

export const GET: APIRoute = async () => {
  const docs = (await buildCorpus()).map(withBase);
  return new Response(JSON.stringify(buildIndex(docs)), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
