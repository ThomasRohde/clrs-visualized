/**
 * The analyzer: text in, index terms out.
 *
 * **The query and the document go through this same function.** That is the
 * one invariant the whole index rests on — a term is only ever compared with a
 * term produced the same way — and `tests/search-analyzer.test.ts` asserts it
 * directly rather than trusting it, because every other rule here is free to be
 * as lossy as it likes as long as it is lossy symmetrically.
 *
 * Three things about this corpus in particular shape the rules below.
 *
 * **It is full of maths.** `Θ` appears 775 times across the chapters and the
 * legends, `§` 478 — a reader who wants the Θ(n lg n) sorts types "theta n lg
 * n", and one who wants §22.3 types a section sign or the word. So the symbols
 * the book actually uses are mapped to the words a reader can type, and the
 * table below is the survey of the corpus rather than a guess. Everything else
 * non-ASCII — dashes, arrows, floors, primes — is a token boundary, which is
 * what it reads as anyway.
 *
 * **Its names are compounds.** `red-black`, `EXTRACT-MIN`, `§22.3`. Splitting
 * on the punctuation loses the compound; keeping it whole loses the parts. So a
 * run joined by a single `-`, `.`, `_` or `’` emits **both**: the parts and the
 * concatenation. `red-black` → `red`, `black`, `redblack`, and all three ways a
 * reader might type it land on the same document.
 *
 * **Its pseudocode is prose.** `if`, `then`, `else`, `while` and `return` are
 * content words here, not noise, so they are deliberately absent from the
 * stopword list below.
 */
import { stem } from './stem.ts';

/**
 * The maths this book writes, spelled how a reader would type it.
 *
 * Only characters that actually occur in the corpus are here — anything absent
 * from the survey would be dead weight in a table someone has to keep true.
 * Everything not listed and not ASCII falls through to being a separator.
 */
const SPELL_OUT: Record<string, string> = {
  Θ: ' theta ',
  θ: ' theta ',
  Ω: ' omega ',
  ω: ' omega ',
  Φ: ' phi ',
  φ: ' phi ',
  Σ: ' sum ',
  Δ: ' delta ',
  δ: ' delta ',
  α: ' alpha ',
  β: ' beta ',
  γ: ' gamma ',
  ε: ' epsilon ',
  η: ' eta ',
  λ: ' lambda ',
  μ: ' mu ',
  π: ' pi ',
  ρ: ' rho ',
  σ: ' sigma ',
  '§': ' section ',
  '∞': ' infinity ',
  '√': ' sqrt ',
  '∈': ' in ',
  '∪': ' union ',
  '∩': ' intersection ',
  '∅': ' empty ',
  '⊆': ' subset ',
};

const SPELL_OUT_RE = new RegExp(`[${Object.keys(SPELL_OUT).join('')}]`, 'g');

/**
 * Words carrying no retrieval signal, dropped from the index only.
 *
 * BM25's IDF already discounts them to nearly nothing, so this is a size
 * decision more than a ranking one: "the" occurs in essentially every one of
 * the 339 documents and its posting list is pure payload. **They are never
 * stripped from the stored text**, so a quoted phrase like "in its final
 * position" still matches exactly.
 *
 * Deliberately absent: `if`, `then`, `else`, `while`, `do`, `return`, `not`.
 * This site's documents include pseudocode, where those are the subject.
 */
const STOPWORDS = new Set(
  (
    'the a an and or of to in on at by for with as from that this these those ' +
    'is are was were be been being it its he she they them their there here ' +
    'but so than too very just also into over under about'
  ).split(' '),
);

/** Runs of letters and digits, and the single character joining two of them. */
const RUN = /[a-z0-9]+/g;

/**
 * Fold to lowercase ASCII words, spelling out the maths on the way.
 *
 * Exported because `snippet.ts` has to fold one word at a time to decide
 * whether it is a match, and doing that with a second copy of these rules is
 * how a highlight starts landing on the wrong word.
 */
export function fold(text: string): string {
  return text
    .replace(SPELL_OUT_RE, (ch) => SPELL_OUT[ch] ?? ' ')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/**
 * One folded word to its index term, or `null` when it carries nothing.
 *
 * `lg` and `log` collapse onto one term: the book writes `lg`, and readers
 * type `log`.
 */
export function termOf(word: string): string | null {
  if (!word || STOPWORDS.has(word)) return null;
  if (word === 'lg') return 'log';
  return stem(word);
}

/**
 * Text to index terms, in order, with duplicates kept — callers count them.
 */
export function analyze(text: string): string[] {
  const folded = fold(text);
  const terms: string[] = [];

  // Walk the runs of alphanumerics. A run that is joined to the previous one
  // by exactly one `-`, `.`, `_` or `’` extends the compound being built; any
  // other gap closes it. A compound of two or more parts also emits the parts
  // concatenated, which is the whole point.
  let compound: string[] = [];
  let end = -1;

  const flush = (): void => {
    if (compound.length > 1) {
      const joined = termOf(compound.join(''));
      if (joined) terms.push(joined);
    }
    compound = [];
  };

  RUN.lastIndex = 0;
  for (let m = RUN.exec(folded); m !== null; m = RUN.exec(folded)) {
    const word = m[0];
    const joins = m.index === end + 1 && /[-._’']/.test(folded[end] ?? '');
    if (!joins) flush();
    compound.push(word);
    end = m.index + word.length;

    const term = termOf(word);
    if (term) terms.push(term);
  }
  flush();

  return terms;
}
