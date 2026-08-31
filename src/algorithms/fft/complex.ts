/**
 * Just enough complex arithmetic for chapter 30, and one formatting decision.
 *
 * The formatting is the part that matters. A DFT of integer coefficients is
 * complex, and a cell in a table has room for about eight characters — so
 * values are rounded to one decimal, a zero imaginary part is dropped
 * entirely, and `−0` is normalised away. Without that last one a table full
 * of floating-point results shows `-0` in half its cells, which reads as
 * meaningful and is not.
 */

export interface Complex {
  re: number;
  im: number;
}

export const C = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

/** The principal nth root of unity, raised to k. */
export const omega = (n: number, k = 1): Complex => ({
  re: Math.cos((2 * Math.PI * k) / n),
  im: Math.sin((2 * Math.PI * k) / n),
});

const tidy = (x: number): number => {
  const r = Math.round(x * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
};

/** One cell's worth: `3`, `−2.5`, `1+1.4i`, `−1.4i`. */
export function fmt(z: Complex): string {
  const re = tidy(z.re);
  const im = tidy(z.im);
  const r = String(re).replace('-', '−');
  const i = `${im === 1 ? '' : im === -1 ? '−' : String(im).replace('-', '−')}i`;
  if (im === 0) return r;
  if (re === 0) return i;
  return `${r}${im > 0 ? '+' : ''}${i}`.replace('+−', '−');
}

/** Are two complex numbers the same to within floating-point slop? */
export const near = (a: Complex, b: Complex, eps = 1e-6): boolean =>
  Math.abs(a.re - b.re) < eps && Math.abs(a.im - b.im) < eps;
