/**
 * What "this matrix is singular" means to §28.1's two players.
 *
 * Both of them have to answer the question and both have to answer it the
 * same way: the decomposition stops when the pivot search finds nothing but
 * zeroes, and the solve stops when U's diagonal has a zero on it, and those
 * are the same fact about the same matrix. Two copies of the test would be two
 * chances for one player to call a matrix singular while the other factors it
 * — which the reader would meet as the site contradicting itself between two
 * sections of one chapter.
 *
 * Neither function is part of an algorithm the book teaches. `determinant`
 * exists only so a *verifier* can check a run that stopped, by a route that
 * shares no code with the elimination it is checking.
 */

/**
 * How close to zero counts as zero, for a matrix of this size of entry.
 *
 * Scaled by the largest entry, because "small" is only meaningful against
 * something: 1e-12 is zero in a matrix of small integers and is an ordinary
 * number in one scaled by 1e-15. Exact equality would be right for the
 * integers the input boxes accept and wrong the moment elimination leaves a
 * rounding crumb where a zero belongs.
 */
export function zeroTolerance(values: number[]): number {
  return 1e-9 * Math.max(1, ...values.map((v) => Math.abs(v)));
}

/**
 * The determinant, by cofactor expansion.
 *
 * Exact on the integers the input boxes accept, and independent of
 * elimination — which is the point, since it is what checks a run that
 * *stopped* because elimination found a zero pivot. n is at most 4 here, so
 * 24 terms is nothing.
 */
export function determinant(M: number[][]): number {
  const n = M.length;
  if (n === 1) return M[0]![0]!;
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const minor = M.slice(1).map((row) => row.filter((_, c) => c !== j));
    sum += (j % 2 === 0 ? 1 : -1) * M[0]![j]! * determinant(minor);
  }
  return sum;
}

/**
 * Is a determinant of this size zero, for a matrix with entries this big?
 *
 * The determinant of an n × n matrix is a sum of products of n entries, so its
 * natural scale is the largest entry to the n-th power — comparing it against
 * a fixed epsilon would call every large matrix singular and no small one.
 */
export function isSingular(M: number[][], entries: number[]): boolean {
  const scale = Math.max(1, ...entries.map((v) => Math.abs(v))) ** M.length;
  return Math.abs(determinant(M)) <= 1e-6 * scale;
}
