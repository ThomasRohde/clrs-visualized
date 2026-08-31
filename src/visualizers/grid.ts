import type { GridCell, GridData, Step } from '../algorithms/types.ts';
import type { RenderOptions } from './renderers.ts';
import { ROLE_VAR, type Role } from './roles.ts';

/**
 * Canvas renderer for tables (R5).
 *
 * Serves everything in the book whose working state is a **grid**: dynamic
 * programming tables (chapter 14, and chapter 23's all-pairs matrices),
 * matrices proper (chapters 4 and 28), the butterfly stages of chapter 30,
 * and chapter 32's text-over-pattern strips.
 *
 * The reason this renderer exists is narrow and specific. A dynamic-programming
 * table is not a picture of a structure — it *is* the algorithm. What makes it
 * teachable is seeing **which already-filled cells the current one is being
 * computed from**, and that is a relationship between three or four cells in a
 * grid, which no other renderer on the site can express.
 *
 * Three things follow from that:
 *
 * **A cell carries a value and a `note`.** The note is the corner mark: the
 * split point a matrix-chain table records, the arrow an LCS table stores, the
 * state a transition table moves to. It is a second fact in the same cell, and
 * it is deliberately not a second colour — a table whose value and whose
 * choice are two hues is unreadable, and the choice is data rather than visual
 * state, so E6 applies.
 *
 * **Arrows are a first-class highlight.** `hi.arrows` draws from cell to cell,
 * which is how "this entry came from that one" is said. Reconstructing the
 * answer at the end of a DP run is a walk along those arrows, and without them
 * the walk is invisible.
 *
 * **`scope` is a rectangle.** Unlike a graph, where a named set is scattered
 * and gets a ring per vertex, the interesting subsets of a table are
 * contiguous — a row, a diagonal, a subproblem's region — so the bounding box
 * of the named cells is the honest outline, exactly as the array renderer's
 * bracket is.
 *
 * Roles and second cues are the site's usual ones: fill is the role, `move`
 * gets an ink outline, `done` is square where every other cell is rounded, and
 * an empty cell is a dashed outline so a half-filled table reads as half
 * filled rather than as full of zeroes.
 */

/** Highlight keys this renderer understands. Cells are named `"row,col"`. */
interface GridHighlight {
  /** Being read — the entries this one is computed from. */
  look?: string | string[];
  /** Being written. */
  move?: string | string[];
  /** Alias for `move`, matching the other renderers' vocabulary. */
  writing?: string | string[];
  /** The entry the step is about: the answer, a cell on the traced path. */
  mark?: string | string[];
  /** Settled, and not going to change again. */
  done?: string | string[];
  /** A contiguous region, outlined as a rectangle round its bounding box. */
  scope?: string[];
  /** Caption for that rectangle, drawn above its top-left corner. */
  scopeLabel?: string;
  /** Variable names above cells: `{ j: '0,4' }`. */
  pointers?: Record<string, string>;
  /** "This came from that": `[{ from: '2,3', to: '3,4' }]`. */
  arrows?: Array<{ from: string; to: string; role?: Role }>;
}

function idsOf(v: string | string[] | undefined): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  return v ?? [];
}

/** Every cell key the snapshot actually has, so a stray highlight paints nothing. */
function keysOf(data: GridData): Set<string> {
  const keys = new Set<string>();
  data.rows.forEach((row, r) => row.cells.forEach((_, c) => keys.add(`${r},${c}`)));
  return keys;
}

/**
 * Which role each cell is in, resolved once per frame.
 *
 * Priority runs rest → done → look → mark → move, the same order every other
 * renderer uses: `move` last because it is the write actually happening.
 */
export function rolesForGrid(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'grid') return roles;
  const hi = step.hi as GridHighlight;
  const known = keysOf(step.data);
  const set = (ids: string[], role: Role) => {
    for (const id of ids) if (known.has(id)) roles.set(id, role);
  };

  set(idsOf(hi.done), 'done');
  set(idsOf(hi.look), 'look');
  set(idsOf(hi.mark), 'mark');
  set(idsOf(hi.move), 'move');
  set(idsOf(hi.writing), 'move');
  return roles;
}

/**
 * Which role each arrow is in.
 *
 * Exported for the same reason the other renderers export their edge and link
 * checkers: an arrow takes a coded colour, `tests/legends.test.ts` counts what
 * a step actually paints, and a key that answered only for cells would be
 * describing a table without its dependencies.
 */
export function rolesForArrows(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'grid') return roles;
  const arrows = (step.hi as GridHighlight).arrows;
  if (!arrows) return roles;
  const known = keysOf(step.data);
  for (const arrow of arrows) {
    if (known.has(arrow.from) && known.has(arrow.to)) {
      roles.set(`${arrow.from}>${arrow.to}`, arrow.role ?? 'look');
    }
  }
  return roles;
}

const PAD = 8;
const HEADER_H = 26;
const LABEL_MIN = 18;
const CELL_MAX = 58;
const CELL_MIN = 13;
/** Room above the block for the scope caption and the pointer labels. */
const TOP_BAND = 13;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Layout {
  x0: number;
  y0: number;
  cellW: number;
  cellH: number;
  labelW: number;
  headerH: number;
  /** Column index of a cell, accounting for its row's offset. */
  colOf: (r: number, c: number) => number;
}

/**
 * Size the table to the canvas.
 *
 * The whole grid is laid out from the snapshot's own dimensions, which is why
 * a recorder must emit the table at its **final size from the first frame**,
 * with unfilled entries as `null`. A table that grows would rescale every cell
 * as the reader steps, and the rescaling reads as something the algorithm did.
 */
function layout(data: GridData, W: number, H: number): Layout {
  const rows = Math.max(1, data.rows.length);
  const cols = Math.max(
    1,
    ...data.rows.map((row) => (row.offset ?? 0) + row.cells.length),
    data.colLabels?.length ?? 1,
  );

  const hasLabels = data.rows.some((r) => r.label !== undefined) || !!data.corner;
  const widest = Math.max(
    ...data.rows.map((r) => String(r.label ?? '').length),
    (data.corner ?? '').length,
    1,
  );
  const labelW = hasLabels ? Math.max(LABEL_MIN, widest * 6.5 + 6) : 0;
  const headerH = data.colLabels ? HEADER_H : 0;

  const availW = Math.max(1, W - PAD * 2 - labelW);
  const availH = Math.max(1, H - PAD * 2 - headerH - TOP_BAND);
  // Cells are squarish, because a DP table is read in both directions at once
  // and a wide flat cell makes the column structure disappear. The cap is what
  // stops a 3×3 matrix drawing three slabs across the panel.
  const cellW = clamp(availW / cols, CELL_MIN, CELL_MAX);
  const cellH = clamp(Math.min(availH / rows, cellW * 0.85), CELL_MIN, CELL_MAX);

  const blockW = labelW + cols * cellW;
  const blockH = headerH + rows * cellH;
  return {
    x0: PAD + Math.max(0, (W - PAD * 2 - blockW) / 2) + labelW,
    y0: PAD + TOP_BAND + Math.max(0, (H - PAD * 2 - TOP_BAND - blockH) / 2) + headerH,
    cellW,
    cellH,
    labelW,
    headerH,
    colOf: (r, c) => (data.rows[r]?.offset ?? 0) + c,
  };
}

function textOf(cell: GridCell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return String(v);
}

export function draw(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void {
  void opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  if (!step) return;
  if (step.data?.kind !== 'grid') {
    // A blank canvas is what `verify:players` reports; the console has to say
    // which algorithm was pointed at the wrong renderer.
    console.error('grid was handed a step with no grid snapshot', step.proc, step.line);
    return;
  }

  const styles = getComputedStyle(canvas);
  const css = (name: string) => styles.getPropertyValue(name).trim();
  const colour = (role: Role) => css(ROLE_VAR[role]);
  const mono = "'IBM Plex Mono', ui-monospace, monospace";
  const ink = css('--ink');

  const data = step.data;
  const hi = step.hi as GridHighlight;
  const roles = rolesForGrid(step);
  const arrowRoles = rolesForArrows(step);
  const L = layout(data, W, H);
  const at = (r: number, c: number) => ({
    x: L.x0 + L.colOf(r, c) * L.cellW,
    y: L.y0 + r * L.cellH,
  });
  const centre = (key: string) => {
    const [r, c] = key.split(',').map(Number) as [number, number];
    const p = at(r, c);
    return { x: p.x + L.cellW / 2, y: p.y + L.cellH / 2 };
  };

  // The value font is sized from the cell *and* from the longest thing any
  // cell holds. A table of single digits and a table of complex numbers get
  // the same width per cell, and without this the second one overflows —
  // chapter 30's "3.0+1.4i" is eight characters where chapter 14's is one.
  const longest = data.rows.reduce(
    (most, row) => row.cells.reduce((m, cell) => Math.max(m, textOf(cell).length), most),
    1,
  );
  const byHeight = clamp(Math.round(L.cellH * 0.42), 8, 13);
  const byWidth = (L.cellW - 6) / (longest * 0.62);
  const valueFont = `500 ${clamp(Math.min(byHeight, byWidth), 6, 13)}px ${mono}`;
  const noteFont = `500 ${clamp(Math.round(L.cellH * 0.3), 7, 9)}px ${mono}`;

  // Column headings and row labels first, in the neutral ramp — they are the
  // table's coordinates, not part of what the algorithm is doing.
  ctx.fillStyle = css('--ink-3');
  ctx.font = `500 10px ${mono}`;
  ctx.textBaseline = 'middle';
  if (data.colLabels) {
    ctx.textAlign = 'center';
    data.colLabels.forEach((label, c) => {
      if (label === null || label === undefined) return;
      // The lower line of the heading band. The upper one is for markers, so
      // a variable never covers the column's own label — which for an LCS
      // table is a letter of the sequence, not a redundant index.
      ctx.fillText(String(label), L.x0 + c * L.cellW + L.cellW / 2, L.y0 - 8);
    });
  }
  ctx.textAlign = 'right';
  data.rows.forEach((row, r) => {
    if (row.label === undefined) return;
    ctx.fillText(String(row.label), L.x0 - 5, L.y0 + r * L.cellH + L.cellH / 2);
  });
  if (data.corner) {
    ctx.fillText(data.corner, L.x0 - 5, L.y0 - 8);
  }

  // The scope rectangle, under the cells: it is the table's version of the
  // array renderer's bracket, and it must not compete with any cell's fill.
  const scope = (hi.scope ?? []).filter((k) => keysOf(data).has(k)).map(centre);
  if (scope.length > 0) {
    const x0 = Math.min(...scope.map((p) => p.x)) - L.cellW / 2 - 2;
    const x1 = Math.max(...scope.map((p) => p.x)) + L.cellW / 2 + 2;
    const y0 = Math.min(...scope.map((p) => p.y)) - L.cellH / 2 - 2;
    const y1 = Math.max(...scope.map((p) => p.y)) + L.cellH / 2 + 2;
    ctx.fillStyle = css('--c-scope-wash');
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 5);
    ctx.fill();
    ctx.strokeStyle = colour('scope');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // The caption goes in the band reserved along the top of the canvas, not
  // above the rectangle it describes: a scope that starts on the first row
  // would otherwise put its caption straight through the column headings.
  if (hi.scopeLabel) {
    ctx.fillStyle = colour('scope');
    ctx.font = `500 10px ${mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(hi.scopeLabel, PAD, 1);
  }

  // Cells.
  data.rows.forEach((row, r) => {
    row.cells.forEach((cell, c) => {
      const key = `${r},${c}`;
      const role = roles.get(key);
      const p = at(r, c);
      const w = L.cellW - 2;
      const h = L.cellH - 2;
      const empty = cell.value === null || cell.value === undefined;

      ctx.beginPath();
      ctx.roundRect(p.x + 1, p.y + 1, w, h, role === 'done' ? 1 : 4);
      if (role) {
        ctx.fillStyle = colour(role);
        ctx.fill();
      } else if (empty) {
        // An unfilled entry is an outline, never a blank or a zero: a table
        // that has not been computed yet has to look unfinished.
        ctx.strokeStyle = css('--line');
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = colour('rest');
        ctx.fill();
      }
      if (role === 'move') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (!empty) {
        ctx.fillStyle = ink;
        ctx.font = valueFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textOf(cell), p.x + L.cellW / 2, p.y + L.cellH / 2 + (cell.note ? -2 : 0));
      }
      // The note sits under the value, in the same ink — a second fact in the
      // same box, told apart by size and position rather than by hue. It was
      // briefly drawn in the neutral ramp, and on a filled cell that made an
      // LCS table's arrows invisible; those arrows are the whole of §14.4.
      if (cell.note) {
        ctx.fillStyle = ink;
        ctx.font = noteFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.note, p.x + L.cellW / 2, p.y + L.cellH - h * 0.24);
      }
    });
  });

  // Arrows last, so a dependency is never hidden under a cell it points at.
  for (const arrow of hi.arrows ?? []) {
    const role = arrowRoles.get(`${arrow.from}>${arrow.to}`);
    if (!role) continue;
    const a = centre(arrow.from);
    const b = centre(arrow.to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    // Stop short of both cells so the head lands on the boundary rather than
    // over the number it is pointing at.
    const inset = Math.min(len / 2 - 1, Math.min(L.cellW, L.cellH) * 0.36);
    const x0 = a.x + (dx / len) * inset;
    const y0 = a.y + (dy / len) * inset;
    const x1 = b.x - (dx / len) * inset;
    const y1 = b.y - (dy / len) * inset;

    ctx.strokeStyle = colour(role);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const angle = Math.atan2(y1 - y0, x1 - x0);
    ctx.fillStyle = colour(role);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 7 * Math.cos(angle - 0.42), y1 - 7 * Math.sin(angle - 0.42));
    ctx.lineTo(x1 - 7 * Math.cos(angle + 0.42), y1 - 7 * Math.sin(angle + 0.42));
    ctx.closePath();
    ctx.fill();
  }

  // Variable markers, in the column-heading band.
  //
  // Grouped by **column**, not by cell. Every loop variable a table names —
  // i, j, k — is an index into a column, two of them often land on the same
  // one, and a marker drawn above its own cell would sit on the heading for
  // row 0 and on another cell's value for every other row. In the heading
  // band it is unambiguous and never collides with the table.
  const markers = new Map<number, string[]>();
  const known = keysOf(data);
  for (const [label, key] of Object.entries(hi.pointers ?? {})) {
    if (!known.has(key)) continue;
    const [r, c] = key.split(',').map(Number) as [number, number];
    const col = L.colOf(r, c);
    markers.set(col, [...(markers.get(col) ?? []), label]);
  }
  ctx.font = `600 10px ${mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [col, labels] of markers) {
    const x = L.x0 + col * L.cellW + L.cellW / 2;
    // The upper line of the heading band, above the column's own label.
    const y = L.headerH > 0 ? L.y0 - 19 : L.y0 - 7;
    const text = labels.join(' ');
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = css('--surface');
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 6, w, 12, 3);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(text, x, y + 0.5);
  }
}

/**
 * Resize the backing store for the current DPR, then redraw.
 *
 * Measured from the canvas itself, not its parent — the parent's box includes
 * padding, and sizing to that stretches every frame.
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
