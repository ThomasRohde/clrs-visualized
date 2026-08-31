/**
 * Attribute badges — E6's channel, shared by every renderer that draws them.
 *
 * A fact about the **data** is never a coded colour. A red-black node's
 * colour, a disjoint-set rank, an order-statistic size, a shortest-path
 * estimate: all of them are drawn as a small pill on the shoulder of the node
 * or vertex, in the neutral ramp only. The fill underneath stays free to say
 * what the algorithm is *doing*, so a node can be red and also be the one
 * being rotated, and a vertex can hold d = 7 and also be the one the queue
 * just handed back.
 *
 * This lives in its own module rather than in `tree.ts` because the graph
 * renderer needs exactly the same pill. Two copies of E6 is two chances for a
 * red node and a black one to stop being told apart by shape.
 *
 * See the E6 entry in docs/PROGRESS.md for the decision itself.
 */

export interface Badge {
  text: string;
  /**
   * Filled pills and hollow ones are how a **two-valued** attribute is told
   * apart without hue — a black node's badge is filled, a red node's is
   * hollow, so "two reds in a row" is a pattern in shape.
   */
  filled: boolean;
}

/** Height of a pill, and what a caller should step by when stacking them. */
export const BADGE_H = 12;
export const BADGE_STEP = 13;

/**
 * What a node's or vertex's attributes say, as at most two short badges.
 *
 * Two is the cap because a third does not fit beside a 40px node and because
 * a structure that wants to show three numbers at once is really asking for
 * an aux row. `colour` is special-cased to `B`/`R` since it is the one
 * attribute in the book whose two values have to be distinguishable at a
 * glance; a boolean shows only when true; everything else prints its value.
 */
export function badgesFor(attrs: Record<string, string | number | boolean> | undefined): Badge[] {
  const out: Badge[] = [];
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (out.length === 2) break;
    if (key === 'colour' || key === 'color') {
      const black = String(value).toLowerCase().startsWith('b');
      out.push({ text: black ? 'B' : 'R', filled: black });
      continue;
    }
    if (typeof value === 'boolean') {
      if (value) out.push({ text: key.slice(0, 3), filled: true });
      continue;
    }
    out.push({ text: String(value), filled: false });
  }
  return out;
}

/** Draw one pill centred on (x, y). */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  badge: Badge,
  x: number,
  y: number,
  ink: string,
  surface: string,
  font: string,
): void {
  const w = Math.max(13, badge.text.length * 6 + 7);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - BADGE_H / 2, w, BADGE_H, 6);
  ctx.fillStyle = badge.filled ? ink : surface;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = badge.filled ? surface : ink;
  ctx.font = `600 8px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge.text, x, y + 0.5);
}
