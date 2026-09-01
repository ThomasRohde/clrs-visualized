/**
 * The snippet payload: each document's plain text, in `search-index.json`'s
 * own order.
 *
 * Split out because it is the larger half and not the urgent one. The dialog
 * can rank, group and render a full result list from the index alone; this is
 * what turns "Partitioning — the section on partitioning" into the sentence
 * the reader's words actually appear in, and what lets a `"quoted phrase"` be
 * confirmed rather than approximated. It lands a moment later and the results
 * upgrade in place.
 *
 * It also carries no ids of its own, on purpose: position *is* the id, which
 * is why `corpus.ts` owns the ordering rather than either endpoint.
 */
import type { APIRoute } from 'astro';
import { buildCorpus } from '../search/corpus.ts';
import type { SearchText } from '../search/types.ts';

export const GET: APIRoute = async () => {
  const payload: SearchText = {
    v: 1,
    text: (await buildCorpus()).map((doc) => doc.text),
  };
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
