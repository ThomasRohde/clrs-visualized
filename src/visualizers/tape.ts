import type { Step } from '../algorithms/types.ts';
import { ROLE_VAR, type Role } from './roles.ts';

/**
 * The trace tape.
 *
 * Every recorded step becomes one tick, coloured by what that step actually
 * did. Played back, it is the scrubber; sat still, it is a portrait of the
 * whole run — and that is the point. Insertion sort on a reversed array is a
 * solid block of shifts; on a nearly-sorted one it is almost bare. Merge sort
 * is the same figure repeated at four scales. The book asks readers to
 * compare those runs; this is what the comparison looks like.
 *
 * The strip is drawn once per trace into an offscreen canvas and blitted each
 * frame, so scrubbing costs one drawImage plus a playhead line.
 */

/** Tick classes, in ascending priority — a busy pixel column shows its most
 *  significant event rather than whichever step happened to land last. */
const TICK_ROLES: Role[] = ['rest', 'scope', 'look', 'move'];

const TICK_HEIGHT: Record<Role, number> = {
  rest: 0.22,
  scope: 0.4,
  look: 0.62,
  move: 1,
  done: 0.5,
  mark: 0.5,
};

/**
 * What kind of event a step was, judged by what changed since the one before.
 *
 * Deliberately reads nothing shape-specific — counters, the procedure name
 * and `hi.range` exist on every step whether it is showing bars, a list or a
 * tree. That is what gets every future renderer the tape for free, and
 * `tests/tape.test.ts` holds it to it. Exported for that test; the `Tape`
 * class is the only other caller.
 */
export function classify(step: Step, prev: Step | undefined): Role {
  const s = step.stats;
  const p = prev?.stats;
  if (p) {
    if (s.swaps > p.swaps || s.writes > p.writes) return 'move';
    if (s.comparisons > p.comparisons) return 'look';
  }
  // No counter moved, so this step was bookkeeping. A change of procedure or
  // of the owned subarray is the structural beat worth showing.
  if (!prev || prev.proc !== step.proc) return 'scope';
  const a = (step.hi as { range?: number[] }).range;
  const b = (prev.hi as { range?: number[] }).range;
  if (a && b && (a[0] !== b[0] || a[1] !== b[1])) return 'scope';
  return 'rest';
}

export class Tape {
  private strip = document.createElement('canvas');
  private classes: Role[] = [];
  private width = 0;
  private height = 0;
  private canvas: HTMLCanvasElement;

  // Spelled out rather than declared as a constructor parameter property:
  // Node's native type-stripping rejects those outright, and this module has
  // to import cleanly in tests/tape.test.ts.
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** Recompute tick classes for a new trace. Cheap: one pass, no drawing. */
  setTrace(steps: Step[]): void {
    this.classes = steps.map((s, i) => classify(s, steps[i - 1]));
  }

  /** Rebuild the strip for the current size and theme. */
  layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.strip.width = Math.round(w * dpr);
    this.strip.height = Math.round(h * dpr);
    const sctx = this.strip.getContext('2d');
    if (!sctx) return;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paintStrip(sctx, w, h);
  }

  private paintStrip(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h);
    const n = this.classes.length;
    if (n === 0) return;

    const styles = getComputedStyle(this.canvas);
    const colour = (role: Role) => styles.getPropertyValue(ROLE_VAR[role]).trim();

    // One column per pixel. Where several steps share a column, the most
    // significant class wins, so a dense run of writes reads as solid.
    const cols = Math.max(1, Math.floor(w));
    const perCol: Array<Role | undefined> = new Array(cols);
    for (let i = 0; i < n; i++) {
      const c = Math.min(cols - 1, Math.floor((i / n) * cols));
      const cur = perCol[c];
      const next = this.classes[i];
      if (!cur || TICK_ROLES.indexOf(next) > TICK_ROLES.indexOf(cur)) perCol[c] = next;
    }

    const base = h - 1;
    for (let c = 0; c < cols; c++) {
      const role = perCol[c];
      if (!role) continue;
      const th = Math.max(2, TICK_HEIGHT[role] * (h - 2));
      ctx.fillStyle = colour(role);
      ctx.fillRect(c, base - th, 1, th);
    }
  }

  /** Blit the strip and draw the playhead for `index`. */
  render(index: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || this.width === 0) return;
    const w = this.width;
    const h = this.height;
    const n = this.classes.length;

    ctx.clearRect(0, 0, w, h);

    const styles = getComputedStyle(this.canvas);
    const played = n > 1 ? (index / (n - 1)) * w : 0;

    // Steps still ahead of the playhead are shown at half strength: the tape
    // fills in as it runs, so progress is legible without a separate bar.
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.drawImage(this.strip, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, played, h);
    ctx.clip();
    ctx.drawImage(this.strip, 0, 0, w, h);
    ctx.restore();

    const x = Math.max(0.5, Math.min(w - 0.5, played));
    ctx.strokeStyle = styles.getPropertyValue('--ink').trim();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    ctx.fillStyle = styles.getPropertyValue('--ink').trim();
    ctx.beginPath();
    ctx.moveTo(x - 3.5, 0);
    ctx.lineTo(x + 3.5, 0);
    ctx.lineTo(x, 4.5);
    ctx.closePath();
    ctx.fill();
  }
}
