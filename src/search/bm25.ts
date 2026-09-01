/**
 * BM25F: the ranking, and the build that precomputes half of it.
 *
 * **BM25F, not a sum of per-field BM25 scores.** Summing scores saturates each
 * field independently, so a document holding a term in its title *and* its body
 * is paid twice for one occurrence and a heading match can be bought with
 * repetition further down. BM25F instead accumulates one weighted, per-field
 * length-normalized pseudo-frequency and saturates that once:
 *
 *     f̃(t,d) = Σ_f  w_f · tf(t,d,f) / (1 − b_f + b_f · len_f(d) / avglen_f)
 *     idf(t)  = ln(1 + (N − df(t) + 0.5) / (df(t) + 0.5))
 *     score   = Σ_t  idf(t) · f̃ (k₁ + 1) / (f̃ + k₁)
 *
 * **f̃ is computed here, at build time, and shipped as one integer per
 * (term, document) pair.** Every term in it — the weights, the field lengths,
 * the averages — is a fact about the corpus and none of it is a fact about the
 * query, so computing it in the browser would be recomputing a constant on
 * every keystroke. It roughly halves the payload as well.
 *
 * The price is that the weights below cannot be retuned in a browser console;
 * a change here needs a rebuild. That is the right trade for a static site
 * whose index is rebuilt on every deploy, and tuning belongs in
 * `tests/search-ranking.test.ts` anyway, which builds this index from source
 * in-process and asserts what thirty real queries return.
 */
import { analyze } from './tokenize.ts';
import { FIELDS, type Field, type IndexedDoc, type SearchDoc, type SearchIndex } from './types.ts';

/** Term-frequency saturation. The usual 1.2. */
export const K1 = 1.2;

/**
 * What each field is worth, and how hard its length is normalized.
 *
 * `w` is the field's weight; `b` is how much a long field is discounted for
 * being long. Short, deliberate fields get a low `b` — a heading is not less
 * relevant for being six words instead of three — and prose gets the standard
 * 0.75. The ordering is the site's own: the name of an algorithm is the
 * strongest signal it has, and a pseudocode line is a strong one because
 * nothing else on the page says `EXTRACT-MIN`.
 */
export const FIELD: Record<Field, { w: number; b: number }> = {
  name: { w: 8, b: 0.4 },
  title: { w: 5, b: 0.5 },
  head: { w: 3, b: 0.6 },
  code: { w: 2.5, b: 0.7 },
  body: { w: 1, b: 0.75 },
};

/** The saturating part of BM25, shared by the build and the query. */
export function saturate(fTilde: number): number {
  return (fTilde * (K1 + 1)) / (fTilde + K1);
}

/** Robertson–Sparck Jones IDF, in the form that cannot go negative. */
export function idf(df: number, n: number): number {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  // ---- Pass one: analyze every field of every document.
  const counts: Array<Record<Field, Map<string, number>>> = [];
  const lengths: Array<Record<Field, number>> = [];

  for (const doc of docs) {
    const perField = {} as Record<Field, Map<string, number>>;
    const perLength = {} as Record<Field, number>;
    for (const field of FIELDS) {
      const terms = analyze(doc.fields[field]);
      const map = new Map<string, number>();
      for (const term of terms) map.set(term, (map.get(term) ?? 0) + 1);
      perField[field] = map;
      perLength[field] = terms.length;
    }
    counts.push(perField);
    lengths.push(perLength);
  }

  // ---- Field averages, over the documents that *have* the field.
  //
  // Averaging over all documents instead would make `name` — which only the
  // 88 algorithms have — average out to a fraction of a term, and every
  // algorithm would then be penalized as having an absurdly long name field
  // for the crime of having one at all.
  const avg = {} as Record<Field, number>;
  for (const field of FIELDS) {
    let total = 0;
    let present = 0;
    for (const perLength of lengths) {
      if (perLength[field] > 0) {
        total += perLength[field];
        present += 1;
      }
    }
    avg[field] = present > 0 ? total / present : 1;
  }

  // ---- Pass two: fold the fields into one pseudo-frequency per (term, doc).
  const postings = new Map<string, Array<[number, number]>>();

  docs.forEach((_doc, d) => {
    const merged = new Map<string, number>();
    for (const field of FIELDS) {
      const len = lengths[d]![field];
      if (len === 0) continue;
      const { w, b } = FIELD[field];
      const norm = 1 - b + (b * len) / avg[field];
      for (const [term, tf] of counts[d]![field]) {
        merged.set(term, (merged.get(term) ?? 0) + (w * tf) / norm);
      }
    }
    for (const [term, fTilde] of merged) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      // Never round a real occurrence down to nothing.
      list.push([d, Math.max(1, Math.round(fTilde * 100))]);
    }
  });

  // ---- Emit, sorted so a prefix is a binary search and delta-coded so the
  // document ids gzip.
  const terms = [...postings.keys()].sort();
  const post = terms.map((term) => {
    const flat: number[] = [];
    let previous = 0;
    for (const [d, f] of postings.get(term)!) {
      flat.push(d - previous, f);
      previous = d;
    }
    return flat;
  });

  return {
    v: 1,
    N: docs.length,
    terms,
    post,
    docs: docs.map(toIndexedDoc),
  };
}

function toIndexedDoc(doc: SearchDoc): IndexedDoc {
  const out: IndexedDoc = {
    k: doc.kind === 'algorithm' ? 'a' : 's',
    t: doc.title,
    c: doc.chapter,
    e: doc.eyebrow,
    u: doc.path,
    m: doc.meta,
  };
  if (doc.prior !== 1) out.p = doc.prior;
  return out;
}
