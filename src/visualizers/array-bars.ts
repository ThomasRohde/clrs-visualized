import type { Step } from '../algorithms/types.ts';
import type { RenderOptions } from './renderers.ts';
import { ROLE_VAR, type Role } from './roles.ts';

/**
 * Canvas renderer for array-based algorithms (all of Parts I–II).
 *
 * It is a pure function of (step → pixels): give it a step and it draws that
 * frame. It reads colours from CSS custom properties at draw time, so a theme
 * change is handled by simply redrawing.
 *
 * To support a new algorithm family, add a sibling module here (cells.ts,
 * tree.ts, graph.ts) exporting the same `draw`/`resize` pair and register it
 * in RENDERER_LOADERS — see renderers.ts. The player dispatches on the
 * module's `visualizer` kind and never imports a renderer directly.
 */

/** Variable-name labels to draw above the bars, per procedure. */
function markersFor(step: Step): Array<{ idx: number; label: string }> {
  const hi = step.hi as Record<string, unknown>;
  const found: Array<{ idx: number; label: string }> = [];
  const push = (idx: unknown, label: string) => {
    if (typeof idx === 'number' && idx >= 1) found.push({ idx, label });
  };

  switch (step.proc) {
    case 'INSERTION-SORT':
      push(hi.i, 'i');
      push(hi.j, 'j');
      break;
    case 'BINARY-SEARCH':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      push(hi.q, 'q');
      break;
    case 'COUNT-INVERSIONS':
    case 'MERGE-INVERSIONS':
    case 'MERGE-SORT':
    case 'MERGE':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      push(hi.mid, 'q');
      break;
    case 'QUICKSORT':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      break;
    case 'PARTITION':
      if (Array.isArray(hi.range)) push(hi.range[0], 'p');
      push(hi.pivot, 'r');
      push(hi.i, 'i');
      push(hi.j, 'j');
      break;
    case 'QUICKSORT′':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      break;
    case 'HOARE-PARTITION':
      // Hoare's i and j start *outside* the subarray, so p and r would sit
      // under them on the first two steps and be unreadable. The bracket
      // already says where the subarray is.
      push(hi.i, 'i');
      push(hi.j, 'j');
      break;
    case 'BUILD-MAX-HEAP':
      push(hi.i, 'i');
      break;
    case 'MAX-HEAPIFY':
      push(hi.i, 'i');
      push(hi.l, 'l');
      push(hi.r, 'r');
      push(hi.largest, 'largest');
      break;
    case 'HEAPSORT':
      push(hi.sortedFrom, 'i');
      break;
    case 'HEAP-MAXIMUM':
    case 'HEAP-EXTRACT-MAX':
    case 'MAX-HEAP-INSERT':
      push(hi.node, 'i');
      break;
    case 'HEAP-INCREASE-KEY':
      push(hi.node, 'i');
      push(hi.parent, 'PARENT(i)');
      break;
    case 'RANDOMIZED-QUICKSORT':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      break;
    case 'RANDOMIZED-PARTITION':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      push(hi.chosen, 'i');
      break;
    case 'COUNTING-SORT':
    case 'COUNTING-SORT-BY-DIGIT':
      push(hi.j, 'j');
      push(hi.dest, 'C[A[j]]');
      break;
    case 'RADIX-SORT':
      push(hi.j, 'j');
      break;
    case 'BUCKET-SORT':
      push(hi.i, 'i');
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'start');
        push(hi.range[1], 'end');
      }
      break;
    case 'MINIMUM':
      push(hi.i, 'i');
      push(hi.minIdx, 'min');
      break;
    case 'MIN-AND-MAX':
      push(hi.i, 'i');
      push(hi.minIdx, 'min');
      push(hi.maxIdx, 'max');
      break;
    case 'RANDOMIZED-SELECT':
    case 'SELECT':
      if (Array.isArray(hi.range)) {
        push(hi.range[0], 'p');
        push(hi.range[1], 'r');
      }
      push(hi.q, 'q');
      break;
    case 'PARTITION-AROUND':
      if (Array.isArray(hi.range)) push(hi.range[0], 'p');
      push(hi.pivot, 'x');
      push(hi.i, 'i');
      push(hi.j, 'j');
      break;
    case 'HIRE-ASSISTANT':
      push(hi.i, 'i');
      push(hi.best, 'best');
      break;
    case 'PERMUTE-BY-SORTING':
      push(hi.i, 'i');
      push(hi.j, 'j');
      break;
    case 'RANDOMIZE-IN-PLACE':
      push(hi.i, 'i');
      push(hi.chosen, 'rand');
      break;
  }

  // Collapse labels that land on the same bar, e.g. "l/largest".
  const byIdx = new Map<number, string[]>();
  for (const { idx, label } of found) {
    const list = byIdx.get(idx) ?? [];
    if (!list.includes(label)) list.push(label);
    byIdx.set(idx, list);
  }
  return [...byIdx.entries()].map(([idx, labels]) => ({ idx, label: labels.join('/') }));
}

/**
 * Which index sets are in play this step, resolved once per frame.
 *
 * Role priority runs rest → done → look → mark → move. `move` wins outright
 * because it is the mutation actually happening; `mark` outranks `look` so a
 * pivot stays identifiable as the pivot even while it is being compared.
 */
export function rolesForStep(step: Step): Map<number, Role> {
  const hi = step.hi as Record<string, unknown>;
  const roles = new Map<number, Role>();
  // A step with no array is one of the structure renderers'; it has no bars
  // to colour, and its own renderer decides what its highlights mean.
  if (!step.array) return roles;
  const n = step.array.length - 1;

  const set = (idx: unknown, role: Role) => {
    if (typeof idx === 'number' && idx >= 1 && idx <= n) roles.set(idx, role);
  };

  // The final step of a divide-and-conquer sort reports `done` for the whole
  // array rather than an index, and it is the one frame a reader most wants
  // to see land.
  if (hi.done === true) for (let k = 1; k <= n; k++) set(k, 'done');
  if (typeof hi.sortedUpTo === 'number') for (let k = 1; k <= hi.sortedUpTo; k++) set(k, 'done');
  if (typeof hi.sortedFrom === 'number') for (let k = hi.sortedFrom; k <= n; k++) set(k, 'done');
  if (typeof hi.heapSize === 'number') for (let k = hi.heapSize + 1; k <= n; k++) set(k, 'done');
  // Counting sort and radix sort fill their output out of order, so neither a
  // prefix nor a suffix describes what has settled — they have to name it.
  if (Array.isArray(hi.doneSet)) for (const k of hi.doneSet as number[]) set(k, 'done');
  set(hi.settled, 'done');
  set(hi.placed, 'done');

  if (Array.isArray(hi.compare)) for (const k of hi.compare as number[]) set(k, 'look');
  set(hi.l, 'look');
  set(hi.r, 'look');
  set(hi.reading, 'look');
  // The element being copied out of A into a buffer — merge sort's fill loop.
  set(hi.source, 'look');

  set(hi.pivot, 'mark');
  set(hi.key, 'mark');
  // `marks` is the plural of `pivot`: MIN-AND-MAX tracks two running answers
  // at once, and neither is subordinate to the other.
  if (Array.isArray(hi.marks)) for (const k of hi.marks as number[]) set(k, 'mark');

  set(hi.shift, 'move');
  set(hi.writing, 'move');
  if (Array.isArray(hi.swap)) for (const k of hi.swap as number[]) set(k, 'move');

  return roles;
}

export function draw(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  // No array means the module is pointed at the wrong renderer. Leaving the
  // canvas blank is exactly the failure `verify:players` reports, so the
  // console has to say which algorithm did it.
  if (!step) return;
  if (!step.array) {
    console.error('array-bars was handed a step with no array', step.proc, step.line);
    return;
  }

  const styles = getComputedStyle(canvas);
  const css = (name: string) => styles.getPropertyValue(name).trim();
  const colour = (role: Role) => css(ROLE_VAR[role]);
  const mono = "'IBM Plex Mono', ui-monospace, monospace";

  const arr = step.array;
  const n = arr.length - 1;
  const hi = step.hi as Record<string, unknown>;

  // Three label lanes above the bars, so nothing ever collides: the region
  // caption on top, variable markers below it, values on the bar itself.
  const padTop = 58;
  const padBottom = 22;
  const padSide = 6;
  const markerY = padTop - 24;
  const markerY2 = padTop - 37;
  const captionY = padTop - 45;

  const gap = Math.max(2, Math.min(7, 90 / n));
  const plotW = W - padSide * 2;
  const barW = Math.max(5, (plotW - gap * (n - 1)) / n);
  const plotH = H - padTop - padBottom;
  const x0For = (k: number) => padSide + (k - 1) * (barW + gap);

  const roles = rolesForStep(step);

  // Active subarray band (merge sort / quicksort recursion). Drawn as a
  // bracket rather than a filled box so it never mutes the bars inside it.
  if (Array.isArray(hi.range)) {
    const [p, r] = hi.range as [number, number];
    const bx0 = x0For(p) - 3;
    const bx1 = x0For(r) + barW + 3;
    const by = padTop - 12;
    ctx.fillStyle = css('--c-scope-wash');
    ctx.fillRect(bx0, by, bx1 - bx0, plotH + 12);
    ctx.strokeStyle = colour('scope');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx0 + 0.5, by + 5);
    ctx.lineTo(bx0 + 0.5, by);
    ctx.lineTo(bx1 - 0.5, by);
    ctx.lineTo(bx1 - 0.5, by + 5);
    ctx.stroke();
  }

  // Heap boundary.
  if (typeof hi.heapSize === 'number' && hi.heapSize < n && hi.heapSize > 0) {
    const x = x0For(hi.heapSize + 1) - gap / 2;
    ctx.strokeStyle = colour('scope');
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, padTop - 14);
    ctx.lineTo(x, H - padBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colour('scope');
    ctx.font = `500 10px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText('◀ heap', x - 4, captionY);
  }

  // Place the variable markers before drawing any bars. A label like
  // "l/largest" is wider than the bar it names, so anything that would
  // collide with its left-hand neighbour moves up to a second lane instead
  // of overprinting it.
  ctx.font = `600 10px ${mono}`;
  const laneRight = [-Infinity, -Infinity];
  const markers = markersFor(step)
    .sort((a, b) => a.idx - b.idx)
    .map(({ idx, label }) => {
      const cx = x0For(idx) + barW / 2;
      const half = ctx.measureText(label).width / 2 + 3;
      const lane = cx - half < laneRight[0] && cx - half >= laneRight[1] ? 1 : 0;
      laneRight[lane] = cx + half;
      return { cx, label, lane };
    });

  for (let k = 1; k <= n; k++) {
    const x = x0For(k);
    const val = arr[k];
    const role = roles.get(k) ?? 'rest';

    // An empty slot. Counting sort and radix sort build their answer in a
    // second array that starts empty, and "nothing here yet" has to look
    // different from "a very small value here".
    if (val === null || val === undefined) {
      ctx.strokeStyle = css('--line-strong');
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, H - padBottom - plotH + 0.5, barW - 1, plotH - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = css('--ink-3');
      ctx.font = `9px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(k), x + barW / 2, H - 7);
      continue;
    }

    // ±∞ is a sentinel, not a magnitude: draw the stub the sentinel deserves
    // and let the label say which one it is.
    const finite = Number.isFinite(val);
    const h = finite ? Math.min(plotH, Math.max(3, (val / opts.maxValue) * plotH)) : 3;
    const y = H - padBottom - h;

    // Settled bars are square-topped; everything still in play is rounded.
    // That is the second channel — the one that still works if the colours
    // are indistinguishable to the reader.
    const radius = role === 'done' ? 0 : Math.min(3, barW / 2);

    ctx.fillStyle = colour(role);
    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.arcTo(x + barW, y, x + barW, y + radius, radius);
    ctx.lineTo(x + barW, H - padBottom);
    ctx.lineTo(x, H - padBottom);
    ctx.closePath();
    ctx.fill();

    // The mutation in progress gets an ink outline — the third channel.
    if (role === 'move') {
      ctx.strokeStyle = css('--ink');
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (barW > 13) {
      ctx.fillStyle = css('--ink');
      ctx.font = `500 10px ${mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(finite ? String(val) : val > 0 ? '∞' : '−∞', x + barW / 2, y - 6);
    }

    ctx.fillStyle = css('--ink-3');
    ctx.font = `9px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(k), x + barW / 2, H - 7);
  }

  // Variable markers hang off a leader tick so it is unambiguous which bar
  // each one names, even when the bars are narrow or the label is stacked.
  const leaderBottom = markerY + 9;
  for (const { cx, label, lane } of markers) {
    const y = lane === 0 ? markerY : markerY2;
    ctx.strokeStyle = css('--ink-3');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, y + 3);
    ctx.lineTo(cx, leaderBottom);
    ctx.stroke();
    ctx.fillStyle = css('--ink');
    ctx.font = `600 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, y);
  }

  // Baseline, so the bars sit on something rather than floating.
  ctx.strokeStyle = css('--line');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - padBottom + 0.5);
  ctx.lineTo(W, H - padBottom + 0.5);
  ctx.stroke();
}

/**
 * Resize the backing store for the current DPR, then redraw.
 *
 * Measured from the canvas itself, not its parent: the parent's box includes
 * padding, and sizing the backing store to that stretches every frame
 * horizontally by the padding's share of the width.
 */
export function resize(
  canvas: HTMLCanvasElement,
  step: Step | undefined,
  opts: RenderOptions,
): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(canvas, step, opts);
}

/**
 * Everything this renderer paints in a coded role, in one map.
 *
 * Bars are the only thing this renderer paints in a coded colour. Part of the `Renderer` contract, and what `describe.ts` reads to say
 * out loud what the picture is emphasising.
 */
export function roles(step: Step | undefined): Map<string | number, Role> {
  if (!step) return new Map();
  return new Map<string | number, Role>([...rolesForStep(step)]);
}
