/**
 * The sentence to show under a result, and where to mark it.
 *
 * The index carries no positions — a phrase is confirmed by looking at the
 * stored text, and so is a snippet. That is a deliberate trade: positions
 * would roughly triple the payload to serve two features that a linear scan of
 * 1.2 kB of text does perfectly well at, once, on a list of at most thirty
 * documents.
 *
 * A word counts as a match when it folds and stems to a term the query
 * matched, which is `tokenize.ts`'s job and not a second copy of its rules —
 * otherwise "sorting" ranks a document and then "sort" is what gets
 * highlighted in it, or nothing is.
 *
 * The window is chosen by how many **distinct** query terms it covers, not how
 * many hits: for "shortest path negative weights", one place where three of
 * those four words appear together is worth more than the four places that
 * each repeat "path".
 */
import { fold, termOf } from './tokenize.ts';

export interface Snippet {
  text: string;
  /** `[start, end)` pairs into `text`, in order and non-overlapping. */
  ranges: Array<[number, number]>;
}

const WORD = /[\p{L}\p{N}]+/gu;
const ELLIPSIS = '…';

/** Every word of `text` that folds onto one of `matched`. */
function hitsIn(
  text: string,
  matched: Set<string>,
): Array<{ start: number; end: number; term: string }> {
  const hits: Array<{ start: number; end: number; term: string }> = [];
  WORD.lastIndex = 0;
  for (let m = WORD.exec(text); m !== null; m = WORD.exec(text)) {
    // A single source word can fold to several — "Θ" becomes "theta", "ĉ"
    // becomes "c" — so any run of the folded form counts for the whole word.
    for (const run of fold(m[0]).match(/[a-z0-9]+/g) ?? []) {
      const term = termOf(run);
      if (term && matched.has(term)) {
        hits.push({ start: m.index, end: m.index + m[0].length, term });
        break;
      }
    }
  }
  return hits;
}

/** Back off to the nearest space, so a window never starts mid-word. */
function snapBack(text: string, at: number): number {
  if (at <= 0) return 0;
  const space = text.lastIndexOf(' ', at);
  return space === -1 ? 0 : space + 1;
}

/**
 * Pull the far edge back to the nearest space.
 *
 * Backwards, never forwards: snapping to the *next* space would let a window
 * run past the width it was given, which is how a fixed-height result row
 * grows a line and shifts everything under it.
 */
function snapEnd(text: string, from: number, limit: number): number {
  if (limit >= text.length) return text.length;
  const space = text.lastIndexOf(' ', limit);
  return space > from ? space : limit;
}

export function snippet(text: string, matched: string[], width = 220): Snippet {
  const clean = text.replace(/\s+/g, ' ').trim();
  const wanted = new Set(matched);
  const hits = wanted.size > 0 ? hitsIn(clean, wanted) : [];

  let from = 0;
  if (hits.length > 0) {
    // The best window is the one covering the most distinct terms; ties go to
    // the one with the most hits, and then to the earliest.
    let bestAt = 0;
    let bestScore = -1;
    for (let i = 0; i < hits.length; i++) {
      const terms = new Set<string>();
      let count = 0;
      for (let j = i; j < hits.length && hits[j]!.end - hits[i]!.start <= width; j++) {
        terms.add(clean.slice(hits[j]!.start, hits[j]!.end).toLowerCase());
        count++;
      }
      const score = terms.size * 1000 + count;
      if (score > bestScore) {
        bestScore = score;
        bestAt = i;
      }
    }
    // A little room in front, so the first hit is not flush against the edge.
    from = Math.max(0, hits[bestAt]!.start - 40);
  }

  from = snapBack(clean, from);
  const to = snapEnd(clean, from, from + width);

  const head = from > 0 ? ELLIPSIS : '';
  const tail = to < clean.length ? ELLIPSIS : '';
  const body = clean.slice(from, to);
  const shift = head.length;

  const ranges: Array<[number, number]> = [];
  for (const hit of hits) {
    if (hit.start < from || hit.end > to) continue;
    const range: [number, number] = [hit.start - from + shift, hit.end - from + shift];
    const previous = ranges[ranges.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else ranges.push(range);
  }

  return { text: head + body + tail, ranges };
}
