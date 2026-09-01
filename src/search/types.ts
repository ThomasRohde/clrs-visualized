/**
 * The shapes shared by the index builder, the query engine and the UI.
 *
 * Two of them are two views of the same thing. `SearchDoc` is what the
 * extractor produces — readable, field-per-field, with the full text attached.
 * `IndexedDoc` is what actually ships: single-letter keys, no text, and the
 * fields gone, because by then they have been folded into one number per
 * (term, document) pair. Keeping them apart is what lets the extractor stay
 * legible while the payload stays small.
 */

/** A prose section of a chapter, or one of the registered algorithms. */
export type DocKind = 'section' | 'algorithm';

/**
 * The five fields a document is analyzed into, most authoritative first.
 *
 * `name` exists only on an algorithm and `code` only on a document that has
 * pseudocode; a field a document does not have is the empty string and takes
 * no part in its length normalization.
 */
export type Field = 'name' | 'title' | 'head' | 'code' | 'body';

export const FIELDS: Field[] = ['name', 'title', 'head', 'code', 'body'];

export interface SearchDoc {
  /** Stable id — `quicksort#partitioning`, `algorithm:quicksort`. */
  id: string;
  kind: DocKind;
  /** The headline: a section heading, or an algorithm's display name. */
  title: string;
  /** The chapter it lives in, for the second line of a result. */
  chapter: string;
  /** Small type above the title: "§7.1", "Chapter 7", "Appendix". */
  eyebrow: string;
  /**
   * Where it is, **without** the deploy base path.
   *
   * The base is applied once, at the endpoint, by `href()` — this module and
   * everything that tests it run under Node, where `import.meta.env` does not
   * exist and importing `src/lib/paths.ts` would throw on load.
   */
  path: string;
  /** One line under the title before a snippet is available. */
  meta: string;
  /** Static ranking prior; 1 is ordinary. */
  prior: number;
  fields: Record<Field, string>;
  /** Plain text, for snippets and for phrase matching. */
  text: string;
}

/** A document as it ships: display only, one letter per key. */
export interface IndexedDoc {
  /** `a`lgorithm or `s`ection. */
  k: 'a' | 's';
  t: string;
  c: string;
  e: string;
  u: string;
  m: string;
  /** Prior, omitted when it is 1. */
  p?: number;
}

export interface SearchIndex {
  v: number;
  /** Document count, for IDF. */
  N: number;
  /** Every term, sorted — which is what makes a prefix a binary search. */
  terms: string[];
  /**
   * Parallel to `terms`: `[docDelta, f̃×100, docDelta, f̃×100, …]`.
   *
   * Document ids are delta-coded because they ascend, and the BM25F pseudo
   * frequency is precomputed because it depends on nothing the browser knows —
   * see `bm25.ts`.
   */
  post: number[][];
  docs: IndexedDoc[];
}

/** The snippet payload, parallel to `SearchIndex.docs`. */
export interface SearchText {
  v: number;
  text: string[];
}

export interface SearchResult {
  /** Index into `SearchIndex.docs`. */
  doc: number;
  score: number;
  /** The index terms that actually matched, for highlighting. */
  matched: string[];
}
