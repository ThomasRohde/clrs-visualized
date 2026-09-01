/**
 * Running a query against the index.
 *
 * Four things happen beyond plain BM25F, each of them because of how people
 * actually type into a search box that answers as they go.
 *
 * **The last word is a prefix**, unless the query ends in a space. Someone
 * three letters into "partition" should already be seeing partitioning. The
 * expansion is capped and damped, and — this is the part that matters — the
 * candidates it produces are scored `max`, not `sum`. Summing would reward a
 * document for containing twenty different words starting with "s".
 *
 * **A stem can be shorter than what has been typed.** The dictionary holds
 * `sort`, and a reader typing `sortin` is four keystrokes into a word whose
 * stem they passed two keystrokes ago. So a prefix matches in both directions:
 * an index term that starts with what was typed, or one that what was typed
 * starts with, within three characters.
 *
 * **A term nobody wrote is probably a typo.** A query term with no postings at
 * all is retried against the dictionary at a bounded edit distance, damped hard
 * enough that a real match always outranks a guessed one. `quicksot` finds
 * Quicksort.
 *
 * **A quoted phrase is checked against the text, not the index.** The index
 * carries no positions — retrieval is on the individual words, and the phrase
 * is then confirmed by looking at the document's stored text. That is why
 * `search-text.json` is worth loading, and why the index costs what it does
 * rather than three times that.
 */
import { analyze, fold, termOf } from './tokenize.ts';
import { idf, saturate } from './bm25.ts';
import type { SearchIndex, SearchResult } from './types.ts';

/** A prefix expansion is worth less than the word actually being there. */
const PREFIX_DAMP = 0.6;
/** …and a guessed spelling is worth less again. */
const FUZZY_DAMP = 0.45;
/** Expansions per prefix, most common first. */
const PREFIX_CAP = 24;
/** How much shorter than the typed prefix an index term may be. */
const STEM_SLACK = 3;
/**
 * A document whose title *is* the query, and nothing else.
 *
 * BM25F has no notion of a title being used up. Typing "partition" put §7.1
 * "Partitioning" sixth, behind five algorithms that mention PARTITION twice in
 * a field weighted 8 — every one of them a defensible result, and none of them
 * the thing whose entire name was typed. This is the one rule in the ranking
 * that is not BM25, so it is deliberately narrow: set equality against the
 * whole title, no partial credit, no effect on relative order among the
 * documents that earn it.
 */
const TITLE_EXACT = 2.2;

export interface QueryOptions {
  limit?: number;
  /**
   * Stored document text, parallel to `index.docs`.
   *
   * Absent until `search-text.json` lands, which is why a quoted phrase is a
   * no-op rather than an error while it is in flight — the caller re-runs the
   * query when it arrives.
   */
  text?: string[];
}

/** Leftmost index at or after which `terms` are ≥ `target`. */
function lowerBound(terms: string[], target: string): number {
  let lo = 0;
  let hi = terms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (terms[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function exact(index: SearchIndex, term: string): number {
  const at = lowerBound(index.terms, term);
  return at < index.terms.length && index.terms[at] === term ? at : -1;
}

/**
 * Index terms a partly typed word could be growing into.
 *
 * Both directions, as described above; the forward direction is a contiguous
 * range of the sorted dictionary, and the backward one is a handful of exact
 * lookups on the prefixes of what was typed.
 */
export function expandPrefix(index: SearchIndex, prefix: string): number[] {
  const found: number[] = [];

  for (let at = lowerBound(index.terms, prefix); at < index.terms.length; at++) {
    if (!index.terms[at]!.startsWith(prefix)) break;
    found.push(at);
  }

  for (let len = Math.max(3, prefix.length - STEM_SLACK); len < prefix.length; len++) {
    const at = exact(index, prefix.slice(0, len));
    if (at !== -1) found.push(at);
  }

  // Most common first: a prefix that expands past the cap should keep the
  // words the corpus actually uses, not the alphabetically luckiest ones.
  found.sort((a, b) => index.post[b]!.length - index.post[a]!.length);
  return found.slice(0, PREFIX_CAP);
}

/** Damerau–Levenshtein, abandoned as soon as it cannot come in under `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous2: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, previous2[j - 2]! + 1);
      }
      row.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    previous2 = previous;
    previous = row;
  }
  return previous[b.length]!;
}

function nearest(index: SearchIndex, term: string): number[] {
  const max = term.length > 6 ? 2 : 1;
  if (term.length < 4) return [];
  let best = max + 1;
  let found: number[] = [];
  index.terms.forEach((candidate, at) => {
    const d = editDistance(term, candidate, max);
    if (d > max) return;
    if (d < best) {
      best = d;
      found = [at];
    } else if (d === best && found.length < 3) {
      found.push(at);
    }
  });
  return found;
}

/** Walk one term's delta-coded posting list. */
function forEachPosting(
  index: SearchIndex,
  at: number,
  fn: (doc: number, f: number) => void,
): void {
  const flat = index.post[at]!;
  let doc = 0;
  for (let i = 0; i < flat.length; i += 2) {
    doc += flat[i]!;
    fn(doc, flat[i + 1]! / 100);
  }
}

/** The phrases in `"quotes"`, and everything left over. */
function splitPhrases(raw: string): { phrases: string[]; rest: string } {
  const phrases: string[] = [];
  const rest = raw.replace(/"([^"]*)"/g, (_all, inner: string) => {
    if (inner.trim()) phrases.push(inner);
    return ' ';
  });
  return { phrases, rest };
}

/**
 * Fold text for phrase comparison.
 *
 * The `lg`/`log` swap is here as well as in `termOf` so that a phrase means
 * what the ranking means. The book writes `Θ(n lg n)`; a reader who quotes
 * `"n log n"` is asking for the same thing and would otherwise get the empty
 * result the ranking had already found forty documents for.
 */
const collapse = (s: string): string =>
  fold(s)
    .replace(/\blg\b/g, 'log')
    .replace(/\s+/g, ' ')
    .trim();

/** Analyzed titles, built once per index and only for documents that score. */
const titleTerms = new WeakMap<SearchIndex, Array<Set<string> | undefined>>();

function titleSet(index: SearchIndex, doc: number): Set<string> {
  let cache = titleTerms.get(index);
  if (!cache) titleTerms.set(index, (cache = []));
  return (cache[doc] ??= new Set(analyze(index.docs[doc]!.t)));
}

/**
 * Every document that matched, best first and uncapped.
 *
 * Exported because the dialog shows eight rows and has to say how many it is
 * not showing. Counting them by running the query a second time without a
 * limit would be the same work twice per keystroke, and the number is already
 * sitting here one line above the slice.
 */
export function rank(index: SearchIndex, raw: string, options: QueryOptions = {}): SearchResult[] {
  const { phrases, rest } = splitPhrases(raw);
  const words = analyze(rest);
  // A phrase's own words drive retrieval too — the quotes only add a filter.
  for (const phrase of phrases) words.push(...analyze(phrase));
  if (words.length === 0) return [];

  // The trailing word is still being typed unless the query ended in a
  // separator, in which case the reader has moved on and means it as written.
  const openEnded = /[\p{L}\p{N}]$/u.test(rest);
  const tail = openEnded ? (termOf(fold(rest).match(/[a-z0-9]+$/)?.[0] ?? '') ?? null) : null;

  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();

  const credit = (doc: number, term: string, amount: number): void => {
    scores.set(doc, (scores.get(doc) ?? 0) + amount);
    let set = matched.get(doc);
    if (!set) matched.set(doc, (set = new Set()));
    set.add(term);
  };

  /**
   * What each typed word turned out to mean.
   *
   * The word as typed is not always a term in the dictionary: a half-typed
   * "partitio" resolves to `partit`, and a mistyped "quicksot" to `quicksort`.
   * The exact-title rule below compares against *these*, not against the raw
   * query, or the bonus would appear only on the last keystroke of a word and
   * the top result would jump as the reader finished typing it. A word that
   * resolved to nothing stays in the set as itself, so a query with an
   * unmatchable word in it earns no title bonus at all.
   */
  const resolved = new Set<string>();

  for (const word of new Set(words)) {
    // The last word is scored over its expansions, taking each document's best
    // rather than its total — see the note at the top of this file.
    const isTail = word === tail;
    const at = exact(index, word);
    const candidates: Array<{ at: number; damp: number }> = [];

    if (at !== -1) candidates.push({ at, damp: 1 });
    if (isTail) {
      for (const other of expandPrefix(index, word)) {
        if (other !== at) candidates.push({ at: other, damp: PREFIX_DAMP });
      }
    }
    if (candidates.length === 0) {
      for (const other of nearest(index, word)) {
        candidates.push({ at: other, damp: FUZZY_DAMP });
      }
    }
    // Candidates are ordered exact-first and then by how common they are, so
    // the head of the list is what the reader most likely meant.
    resolved.add(candidates.length > 0 ? index.terms[candidates[0]!.at]! : word);
    if (candidates.length === 0) continue;

    const best = new Map<number, { score: number; term: string }>();
    for (const { at: termAt, damp } of candidates) {
      const weight = idf(index.post[termAt]!.length / 2, index.N) * damp;
      const term = index.terms[termAt]!;
      forEachPosting(index, termAt, (doc, f) => {
        const score = weight * saturate(f);
        const current = best.get(doc);
        if (!current || score > current.score) best.set(doc, { score, term });
      });
    }
    for (const [doc, hit] of best) credit(doc, hit.term, hit.score);
  }

  let results: SearchResult[] = [...scores].map(([doc, score]) => {
    const title = titleSet(index, doc);
    const isTitle =
      title.size === resolved.size &&
      title.size > 0 &&
      [...resolved].every((term) => title.has(term));
    return {
      doc,
      score: score * (index.docs[doc]!.p ?? 1) * (isTitle ? TITLE_EXACT : 1),
      matched: [...(matched.get(doc) ?? [])],
    };
  });

  // A quoted phrase is confirmed against the text, once there is text. Until
  // then it has already done its work as ordinary words.
  if (phrases.length > 0 && options.text) {
    const wanted = phrases.map(collapse);
    results = results.filter((r) => {
      const haystack = collapse(options.text![r.doc] ?? '');
      return wanted.every((phrase) => haystack.includes(phrase));
    });
  }

  results.sort((a, b) => b.score - a.score || a.doc - b.doc);
  return results;
}

/** The top `limit` of them — what most callers want. */
export function search(
  index: SearchIndex,
  raw: string,
  options: QueryOptions = {},
): SearchResult[] {
  return rank(index, raw, options).slice(0, options.limit ?? 30);
}
