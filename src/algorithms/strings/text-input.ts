import type { GridCell, GridRow, ParsedInput, TextInput } from '../types.ts';

/**
 * The text and pattern chapter 32's four matchers share.
 *
 * All four are run on the same shape of input and drawn the same way — the
 * text on one row, the pattern on a second row **shifted right by s**, which
 * is what `GridRow.offset` was added for. Sliding the pattern along under the
 * text is the picture the whole chapter is about, and keeping it in one place
 * means the four players are directly comparable rather than four
 * near-identical layouts that differ by accident.
 */

export const ALPHABET = 'abc';

/**
 * A text with the pattern planted in it at least once.
 *
 * A generator that only usually produces a match makes a run that only
 * usually has anything to show, and a `done` role the legend promises and the
 * renderer never paints. The plant is deliberate; the rest is random, so
 * spurious near-misses still happen and are still worth watching.
 */
export function generateText(n: number): TextInput {
  const length = Math.max(8, Math.min(n, 18));
  const m = length <= 10 ? 3 : 4;
  const draw = (len: number) =>
    Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!);

  const pattern = draw(m);
  const text = draw(length);
  const at = Math.floor(Math.random() * (length - m + 1));
  for (let k = 0; k < m; k++) text[at + k] = pattern[k]!;
  return { kind: 'text', text: text.join(''), pattern: pattern.join('') };
}

export function parseText(text: string): ParsedInput {
  const parts = text
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (parts.length !== 2) return { error: 'Give the text and then the pattern, comma separated.' };
  const [T, P] = parts as [string, string];
  if (!/^[a-z]+$/.test(T) || !/^[a-z]+$/.test(P)) {
    return { error: 'Letters only, please — a–z.' };
  }
  if (T.length > 20) return { error: 'At most 20 characters of text.' };
  if (P.length > 6) return { error: 'At most 6 characters of pattern.' };
  if (P.length > T.length) return { error: 'The pattern is longer than the text.' };
  return { value: { kind: 'text', text: T, pattern: P } };
}

/**
 * The text as row 0 of the grid.
 *
 * `pad` adds empty columns after the end of the text. KMP needs them: with
 * `q = 0` near the end of the text the pattern is aligned starting at the
 * last character and hangs off the right, and without somewhere for it to
 * hang the grid would grow a column mid-run and rescale every cell — which
 * the reader would see as something the algorithm did. The padding cells are
 * `null`, so they draw as empty outlines and read as "past the end".
 */
export function textRow(T: string, pad = 0): GridRow {
  return {
    label: 'T',
    cells: [
      ...T.split('').map((ch): GridCell => ({ value: ch })),
      ...Array.from({ length: pad }, (): GridCell => ({ value: null })),
    ],
  };
}

/** The pattern as a row shifted right by `s` — the picture of a trial shift. */
export function patternRow(P: string, s: number, notes?: Array<string | undefined>): GridRow {
  return {
    label: 'P',
    offset: s,
    cells: P.split('').map((ch, k): GridCell => ({
      value: ch,
      ...(notes?.[k] ? { note: notes[k]! } : {}),
    })),
  };
}

/**
 * Column headings: 1‥n, matching the book's 1-indexed strings, then `pad`
 * blank ones for the columns past the end of the text.
 */
export function columns(n: number, pad = 0): Array<number | null> {
  return [
    ...Array.from({ length: n }, (_, i) => i + 1),
    ...Array.from({ length: pad }, () => null),
  ];
}
