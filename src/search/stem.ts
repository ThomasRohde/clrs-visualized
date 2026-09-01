/**
 * The Porter stemmer (Porter, 1980), so that "sorting", "sorts" and "sorted"
 * are one term in the index.
 *
 * Vendored rather than depended on: the algorithm has been fixed since 1980,
 * it is a hundred lines, and this project ships two runtime dependencies and
 * would rather keep it that way. The rule set below is the published one, in
 * its usual regex form.
 *
 * **There is no list of words protected from stemming, on purpose.** A stem is
 * only ever compared against another stem — `analyze()` runs over the query and
 * over the document, so an aggressive rule is applied symmetrically and cannot
 * cost a match. "kruskal" stemming to "krusk" looks wrong and is harmless,
 * because the query stems to "krusk" too and nothing ever displays a stem. The
 * only thing that could hurt is *false conflation*, two unrelated words
 * collapsing onto one term, and Porter's are rare and near-synonymous.
 *
 * Words of one or two letters are left alone, which is Porter's own rule, and
 * so is anything holding a digit — `223` and `a1` have no English morphology
 * to strip and the rules would happily strip one anyway.
 */

// The published regex fragments. `c` is a consonant, `v` a vowel; `C` and `V`
// are maximal runs of each, which is what lets `m` — the number of VC pairs —
// be written as a pattern rather than a loop.
const c = '[^aeiou]';
const v = '[aeiouy]';
const CC = c + '[^aeiouy]*';
const VV = v + '[aeiou]*';

/** m > 0 — the stem has at least one vowel-consonant pair. */
const MGR0 = new RegExp('^(' + CC + ')?' + VV + CC);
/** m = 1 exactly. */
const MEQ1 = new RegExp('^(' + CC + ')?' + VV + CC + '(' + VV + ')?$');
/** m > 1. */
const MGR1 = new RegExp('^(' + CC + ')?' + VV + CC + VV + CC);
/** The stem contains a vowel at all. */
const HAS_VOWEL = new RegExp('^(' + CC + ')?' + v);

/** Ends in a double consonant. */
const DOUBLE = /([^aeiouylsz])\1$/;
/** Ends consonant-vowel-consonant where the last is not w, x or y. */
const CVC = new RegExp('^' + CC + v + '[^aeiouwxy]$');

const STEP2: Array<[RegExp, string]> = [
  [/ational$/, 'ate'],
  [/tional$/, 'tion'],
  [/enci$/, 'ence'],
  [/anci$/, 'ance'],
  [/izer$/, 'ize'],
  [/bli$/, 'ble'],
  [/alli$/, 'al'],
  [/entli$/, 'ent'],
  [/eli$/, 'e'],
  [/ousli$/, 'ous'],
  [/ization$/, 'ize'],
  [/ation$/, 'ate'],
  [/ator$/, 'ate'],
  [/alism$/, 'al'],
  [/iveness$/, 'ive'],
  [/fulness$/, 'ful'],
  [/ousness$/, 'ous'],
  [/aliti$/, 'al'],
  [/iviti$/, 'ive'],
  [/biliti$/, 'ble'],
  [/logi$/, 'log'],
];

const STEP3: Array<[RegExp, string]> = [
  [/icate$/, 'ic'],
  [/ative$/, ''],
  [/alize$/, 'al'],
  [/iciti$/, 'ic'],
  [/ical$/, 'ic'],
  [/ful$/, ''],
  [/ness$/, ''],
];

const STEP4 =
  /(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$|(?:[st])(ion)$/;

/** Longest suffix in `rules` that matches, applied when the stem passes `ok`. */
function applyLongest(
  word: string,
  rules: Array<[RegExp, string]>,
  ok: (stem: string) => boolean,
): string {
  for (const [pattern, replacement] of rules) {
    const match = pattern.exec(word);
    if (!match) continue;
    const stem = word.slice(0, match.index);
    return ok(stem) ? stem + replacement : word;
  }
  return word;
}

export function stem(word: string): string {
  if (word.length < 3 || /\d/.test(word)) return word;

  let w = word;

  // ---- Step 1a: plurals.
  if (/(ss|i)es$/.test(w)) w = w.slice(0, -2);
  else if (/([^s])s$/.test(w)) w = w.slice(0, -1);

  // ---- Step 1b: -eed, -ed, -ing.
  let restore = false;
  if (/eed$/.test(w)) {
    if (MGR0.test(w.slice(0, -3))) w = w.slice(0, -1);
  } else {
    const m = /(ed|ing)$/.exec(w);
    if (m && HAS_VOWEL.test(w.slice(0, m.index))) {
      w = w.slice(0, m.index);
      restore = true;
    }
  }
  if (restore) {
    // Putting back the letter the suffix ate: "matting" is "mat", but
    // "hopping" is "hop" and "hoping" is "hope".
    if (/(at|bl|iz)$/.test(w)) w += 'e';
    else if (DOUBLE.test(w)) w = w.slice(0, -1);
    else if (MEQ1.test(w) && CVC.test(w)) w += 'e';
  }

  // ---- Step 1c: terminal y becomes i, so "happy" and "happiness" meet.
  if (/y$/.test(w) && HAS_VOWEL.test(w.slice(0, -1))) w = w.slice(0, -1) + 'i';

  // ---- Steps 2 and 3: derivational suffixes, longest first.
  w = applyLongest(w, STEP2, (s) => MGR0.test(s));
  w = applyLongest(w, STEP3, (s) => MGR0.test(s));

  // ---- Step 4: strip the suffix outright when there is enough stem left.
  const m4 = STEP4.exec(w);
  if (m4) {
    const cut = w.slice(0, m4.index + (m4[2] ? 1 : 0));
    if (MGR1.test(cut)) w = cut;
  }

  // ---- Step 5: a trailing e, and a doubled l.
  if (/e$/.test(w)) {
    const s = w.slice(0, -1);
    if (MGR1.test(s) || (MEQ1.test(s) && !CVC.test(s))) w = s;
  }
  if (/ll$/.test(w) && MGR1.test(w)) w = w.slice(0, -1);

  return w;
}
