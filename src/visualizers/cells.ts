import type { Cell, CellRow, Step } from '../algorithms/types.ts';
import type { RenderOptions } from './renderers.ts';
import { ROLE_VAR, type Role } from './roles.ts';

/**
 * Canvas renderer for cell-and-pointer structures (R2).
 *
 * Where `array-bars` draws magnitudes, this draws *slots*: boxes in labelled
 * rows, holding whatever is in them. That is the right picture whenever the
 * lesson is about position and membership rather than size — a stack's
 * boundary, a queue's wrap-around, a hash table's chains — and it is why the
 * values are printed rather than plotted.
 *
 * Highlights name **cell ids**, never positions. A list splices, so the third
 * box stops being the third element the moment anything is inserted; only an
 * id survives that.
 *
 * A cell's `next` and `prev` are drawn as arcs in labelled lanes under the
 * row, which is what makes a linked list drawable at all: the boxes sit where
 * the objects were allocated and the arcs are the only thing that says what
 * order the list is in. A pointer *assignment* is the whole content of
 * `LIST-PREPEND` and `LIST-DELETE`, so an arc takes a role colour exactly as
 * a cell does — see `rolesForLinks`.
 *
 * **Rows share one column grid**, which is what lets a hash table's chains
 * line up under each other and a pattern sit under the text it is being slid
 * along. Three things are deliberately row-local, and a recorder that ignores
 * that gets a picture which lies rather than an error:
 *
 * - an **arc** is drawn in the lane under the row holding the pointer, so it
 *   can only reach a cell in that same row;
 * - the **scope bracket** takes its top from the topmost cell it names, so a
 *   scope spanning two rows brackets the space between them;
 * - **markers** hang above the first row on a leader line reaching down to
 *   the cell, which is honest only while the structure is one or two rows —
 *   past that the layout stops reserving a lane for them.
 *
 * Like every renderer here it reads colour from CSS custom properties at draw
 * time, so a theme change is a redraw and nothing more.
 */

/** Highlight keys this renderer understands. All of them name cell ids. */
interface CellHighlight {
  /** Ids inside the structure right now — bracketed, not filled. */
  scope?: string[];
  /** Caption for that bracket, e.g. "the stack". */
  scopeLabel?: string;
  /** Being read. */
  look?: string | string[];
  /** Being written or moved. */
  move?: string | string[];
  /** Alias for `move`, matching the array renderer's vocabulary. */
  writing?: string | string[];
  /** The cell an operation is centred on — a stack's top, a list's head. */
  mark?: string | string[];
  /** Settled, and not going to change again. */
  done?: string | string[];
  /** Variable-name labels above cells: `{ 'S.top': 's3' }`. */
  pointers?: Record<string, string>;
  /**
   * Roles for individual pointer fields, keyed the way the book writes them:
   * `{ 'x3.next': 'move' }` paints the arc leaving x3's `next` as the write
   * happening this step. The field name is the cell id, a dot, and `next` or
   * `prev`.
   */
  links?: Record<string, Role>;
}

function idsOf(v: string | string[] | undefined): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  return v ?? [];
}

/**
 * Which role each cell is in, resolved once per frame.
 *
 * Priority runs rest → done → look → mark → move, the same order the array
 * renderer uses and for the same reasons: `move` is the mutation actually
 * happening, and `mark` outranks `look` so the top of a stack stays
 * identifiable as the top while it is being read.
 *
 * `scope` is deliberately absent: it is chrome here as it is there, drawn as
 * a bracket around a run of cells rather than as a fill, so a cell inside the
 * structure still shows its own role.
 */
export function rolesForCells(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'cells') return roles;
  const hi = step.hi as CellHighlight;

  const known = new Set<string>();
  for (const row of step.data.rows) for (const cell of row.cells) known.add(cell.id);
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

/** The two pointer fields a cell can carry, in the order their lanes stack. */
const FIELDS = ['next', 'prev'] as const;
type PointerField = (typeof FIELDS)[number];

/**
 * Which role each *pointer field* is in: `"x3.next" -> 'move'`.
 *
 * Separate from `rolesForCells` because a pointer and the object holding it
 * are in different states — during `LIST-SEARCH` the object under `x` is
 * being read while the arc about to be followed is what the next line acts
 * on. Filtered to fields the renderer actually draws, so a highlight naming a
 * pointer this structure does not have paints nothing, and
 * `tests/legends.test.ts` counts the same colours the canvas shows.
 */
export function rolesForLinks(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'cells') return roles;
  const links = (step.hi as CellHighlight).links;
  if (!links) return roles;

  const drawn = new Set<string>();
  for (const row of step.data.rows) {
    for (const cell of row.cells) {
      for (const field of FIELDS) if (cell[field] !== undefined) drawn.add(`${cell.id}.${field}`);
    }
  }
  for (const [field, role] of Object.entries(links)) if (drawn.has(field)) roles.set(field, role);
  return roles;
}

/** Ids that the scope bracket spans, filtered to cells that actually exist. */
function scopeIds(step: Step): Set<string> {
  const hi = step.hi as CellHighlight;
  return new Set(hi.scope ?? []);
}

interface Layout {
  cellW: number;
  cellH: number;
  gap: number;
  labelW: number;
  /** Left edge of the grid: after the row labels, plus the centring margin. */
  xLeft: number;
  /** Top of the first row. */
  yTop: number;
  /** Distance from one row's top to the next, captions and arc lanes included. */
  stride: number;
  /** Baseline for the variable-name labels, just above the first row. */
  markerY: number;
  /** Pointer fields this snapshot draws, in the order their lanes stack. */
  lanes: PointerField[];
  /** Height of one arc lane, grown into whatever height is going spare. */
  laneH: number;
  /** The caption strip under a row: `CAPTION_H`, or 0 when no cell has one. */
  captionH: number;
  /** Vertical space between rows, which is also what the bracket rises into. */
  rowGap: number;
}

/** Space above the rows for pointer labels and the scope bracket. */
const MARKER_LANE = 34;
const CAPTION_H = 14;
/** Bounds on one lane of pointer arcs. */
const ARC_LANE_MIN = 20;
const ARC_LANE_MAX = 46;
/** Bounds on a cell. The floor is about what a two-digit key needs. */
const CELL_MIN = 14;
const CELL_MAX = 46;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Cells are square-ish and sized to fit the widest row, so every row shares
 * one grid — a hash table's chains have to line up with their buckets.
 *
 * The block is centred in whatever height it is given. A cells structure is
 * usually one or two short rows in a canvas sized for a full bar chart, and
 * pinning it to the top leaves the picture stranded above a field of empty
 * space.
 *
 * **Every vertical cost is charged only to the structure that uses it**,
 * which is what makes a hash table fit: a chained table is five rows in a
 * canvas that is 190px tall at the narrow breakpoint, and there is nothing
 * spare to waste on lanes it has no pointers for. So arc lanes appear only
 * for the fields some cell actually carries — a stack is laid out exactly as
 * it was before arcs existed — the caption strip only when some cell has a
 * label, and the marker lane only for a structure short enough to use it.
 * Whatever is left is split evenly between the rows, cells served first and
 * lanes taking the remainder.
 */
function layoutFor(rows: CellRow[], W: number, H: number): Layout {
  const widest = rows.reduce((m, r) => Math.max(m, r.cells.length + (r.offset ?? 0)), 1);
  const padSide = 8;
  const padTop = 16;
  const padBottom = 16;
  const labelW = rows.some((r) => r.label) ? 34 : 0;
  const gap = widest > 18 ? 3 : 6;
  const usable = W - padSide * 2 - labelW;

  const lanes = FIELDS.filter((f) => rows.some((r) => r.cells.some((c) => c[f] !== undefined)));
  const captionH = rows.some((r) => r.cells.some((c) => c.label !== undefined && c.label !== null))
    ? CAPTION_H
    : 0;
  // Rows of a many-row structure are read as one picture — a table, not two
  // separate strips — so they sit closer together than a list and its lanes.
  const rowGap = rows.length > 2 ? 8 : 16;
  // A marker hangs above the *first* row on a leader line, so a structure
  // with more rows than the line can honestly cross has no lane to pay for.
  const markerLane = rows.length > 2 ? 12 : MARKER_LANE;

  const avail = H - padTop - padBottom - markerLane;
  // What one row may spend on itself, with the gaps between rows taken out.
  const budget = (avail + rowGap) / rows.length - rowGap;
  // The cell carries the value, so it is served before the lanes and both
  // have a floor. Below the floor the picture is not worth drawing, so a
  // canvas too short for it overflows rather than degrading to a smear.
  const cellH = clamp(budget - captionH - lanes.length * ARC_LANE_MIN, CELL_MIN, CELL_MAX);
  const laneH =
    lanes.length === 0
      ? 0
      : clamp((budget - captionH - cellH) / lanes.length, ARC_LANE_MIN, ARC_LANE_MAX);

  // Width comes last because it is bounded by the height: a cell twice as
  // wide as it is tall is the widest that still reads as a box, and a hash
  // table whose longest chain is three would otherwise be drawn as three
  // slabs across the whole panel. What is not spent goes to the margins, so
  // the picture stays centred rather than hugging the left edge.
  const cellW = clamp((usable - gap * (widest - 1)) / widest, 16, Math.max(56, cellH * 2));
  const gridW = widest * cellW + gap * (widest - 1);
  const xLeft = padSide + labelW + Math.max(0, (usable - gridW) / 2);

  const stride = cellH + captionH + lanes.length * laneH + rowGap;
  const blockH = rows.length * stride - rowGap;
  const yTop = padTop + markerLane + Math.max(0, (avail - blockH) / 2);
  return {
    cellW,
    cellH,
    gap,
    labelW,
    xLeft,
    yTop,
    stride,
    markerY: Math.max(12, yTop - 26),
    lanes,
    laneH,
    captionH,
    rowGap,
  };
}

/**
 * One pointer, as an arc from under the cell that holds it to under the cell
 * it names, with the head at the target.
 *
 * Both ends are offset towards the other cell, so which way the pointer runs
 * is readable without following the curve, and the dip grows with the span:
 * a chain of one-step hops stays near the top of the lane and the long arc a
 * prepend creates runs underneath them all rather than through them.
 */
function drawPointerArc(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  cellW: number,
  top: number,
  laneH: number,
  span: number,
): void {
  const dir = toX >= fromX ? 1 : -1;
  const off = Math.min(cellW * 0.24, 11);
  const sx = fromX + dir * off;
  const tx = toX - dir * off;
  const shallow = Math.min(9, laneH * 0.25);
  const dip = shallow + Math.min(1, (span - 1) / 5) * (laneH - 8 - shallow);
  // A cubic whose controls sit directly under its ends reaches three quarters
  // of the way down, and arrives vertically — which is why every arrowhead
  // below can point straight up.
  const ctrl = top + dip / 0.75;

  ctx.beginPath();
  ctx.moveTo(sx, top);
  ctx.bezierCurveTo(sx, ctrl, tx, ctrl, tx, top);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tx, top);
  ctx.lineTo(tx - 4, top + 7);
  ctx.lineTo(tx + 4, top + 7);
  ctx.closePath();
  ctx.fill();
}

/**
 * A NIL pointer: a stub with the word under it.
 *
 * Spelled out rather than given a glyph, because a reader meeting a linked
 * list for the first time should not also have to learn a diagram
 * convention — and because `NIL` is what the pseudocode beside it says.
 */
function drawNilStub(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  laneH: number,
  font: string,
): void {
  // Hangs at the bottom of the lane, under every arc that passes over it, so
  // a terminator never reads as one more hop in the chain.
  const foot = top + laneH - 12;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, foot);
  ctx.stroke();
  ctx.font = `8px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('NIL', cx, foot + 1);
}

function fmtValue(v: Cell['value']): string {
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
  if (step.data?.kind !== 'cells') {
    // Blank canvases are the failure `verify:players` reports; the console has
    // to say which algorithm was pointed at the wrong renderer.
    console.error('cells was handed a step with no cells snapshot', step.proc, step.line);
    return;
  }

  const styles = getComputedStyle(canvas);
  const css = (name: string) => styles.getPropertyValue(name).trim();
  const colour = (role: Role) => css(ROLE_VAR[role]);
  const mono = "'IBM Plex Mono', ui-monospace, monospace";

  const rows = step.data.rows;
  const hi = step.hi as CellHighlight;
  const roles = rolesForCells(step);
  const inScope = scopeIds(step);
  const {
    cellW,
    cellH,
    gap,
    labelW,
    xLeft,
    yTop,
    stride,
    markerY,
    lanes,
    laneH,
    captionH,
    rowGap,
  } = layoutFor(rows, W, H);

  const xFor = (col: number) => xLeft + col * (cellW + gap);
  const yFor = (rowIdx: number) => yTop + rowIdx * stride;
  /** Column a cell ended up in, so an arc's dip can grow with its span. */
  const column = new Map<string, number>();

  /** Where each cell ended up, so pointers and brackets can find it. */
  const placed = new Map<string, { x: number; y: number }>();

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const y = yFor(r);

    if (row.label) {
      ctx.fillStyle = css('--ink-2');
      ctx.font = `600 11px ${mono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, xLeft - 8, y + cellH / 2);
    }

    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c]!;
      const col = c + (row.offset ?? 0);
      const x = xFor(col);
      placed.set(cell.id, { x, y });
      column.set(cell.id, col);

      const role = roles.get(cell.id) ?? 'rest';
      const empty = cell.value === null || cell.value === undefined;

      // An empty slot is a dashed outline, the same language the array
      // renderer uses for a slot nothing has been written into yet.
      if (empty && role === 'rest') {
        ctx.strokeStyle = css('--line-strong');
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
        ctx.setLineDash([]);
      } else {
        // The second channel: a cell whose role is `done` is square, every
        // other cell is rounded, so the state survives a reader who cannot
        // separate the hues.
        const radius = role === 'done' ? 0 : 3;
        ctx.fillStyle = colour(role);
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, radius);
        ctx.fill();
        // The third channel, again matching the bars: the mutation in
        // progress is the one with an ink outline.
        if (role === 'move') {
          ctx.strokeStyle = css('--ink');
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      if (!empty) {
        ctx.fillStyle = css('--ink');
        ctx.font = `500 ${cellW < 26 ? 9 : 11}px ${mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtValue(cell.value), x + cellW / 2, y + cellH / 2);
      }

      if (cell.label !== undefined && cell.label !== null) {
        ctx.fillStyle = css('--ink-3');
        ctx.font = `9px ${mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(cell.label), x + cellW / 2, y + cellH + 3);
      }
    }
  }

  // Pointer arcs, in a labelled lane per field under each row. A pointer
  // assignment *is* the step in a list procedure, so an arc takes a role
  // colour the same way a cell does; everything else is chrome.
  const linkRoles = rolesForLinks(step);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const arcTop = yFor(r) + cellH + captionH;

    for (let ln = 0; ln < lanes.length; ln++) {
      const field = lanes[ln]!;
      const held = row.cells.filter((cell) => cell[field] !== undefined);
      if (held.length === 0) continue;
      const laneTop = arcTop + ln * laneH;

      if (labelW > 0) {
        ctx.fillStyle = css('--ink-3');
        ctx.font = `9px ${mono}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(field, xLeft - 8, laneTop + laneH / 2);
      }

      for (const cell of held) {
        const target = cell[field];
        const from = placed.get(cell.id);
        if (target === undefined || !from) continue;

        const role = linkRoles.get(`${cell.id}.${field}`);
        ctx.strokeStyle = role ? colour(role) : css('--ink-3');
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = role ? 2 : 1.1;

        if (target === null) {
          drawNilStub(ctx, from.x + cellW / 2, laneTop, laneH, mono);
          continue;
        }
        const to = placed.get(target);
        if (!to) continue;
        const span = Math.abs((column.get(target) ?? 0) - (column.get(cell.id) ?? 0));
        drawPointerArc(ctx, from.x + cellW / 2, to.x + cellW / 2, cellW, laneTop, laneH, span);
      }
    }
  }
  ctx.lineWidth = 1;

  // The bracket over the cells that are currently *in* the structure. Drawn
  // over the run rather than filled behind it, so membership never competes
  // with a cell's own role for the reader's attention.
  if (inScope.size > 0) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    for (const id of inScope) {
      const p = placed.get(id);
      if (!p) continue;
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x + cellW);
      y0 = Math.min(y0, p.y);
    }
    if (Number.isFinite(x0)) {
      // How far the bracket rises above the row it marks: as much as the gap
      // above that row can spare. A hash table's rows are 8px apart, and a
      // bracket drawn to the list's proportions would sit on the cells of the
      // bucket above and read as belonging to both.
      const rise = clamp(rowGap - 2, 3, 10);
      const tick = Math.min(5, rise);
      const by = y0 - rise;
      ctx.fillStyle = css('--c-scope-wash');
      ctx.fillRect(x0 - 3, by, x1 - x0 + 6, cellH + rise + tick - 1);
      ctx.strokeStyle = colour('scope');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0 - 2.5, by + tick);
      ctx.lineTo(x0 - 2.5, by);
      ctx.lineTo(x1 + 2.5, by);
      ctx.lineTo(x1 + 2.5, by + tick);
      ctx.stroke();
      if (hi.scopeLabel) {
        ctx.fillStyle = colour('scope');
        ctx.font = `500 10px ${mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(hi.scopeLabel, x0 - 2, by - 3);
      }
    }
  }

  // Variable markers, each hanging off a leader tick so it is unambiguous
  // which cell it names. Two variables often name the same cell — `L.head`
  // is also `x` on the first line of a search — so labels on one cell are
  // stacked upwards instead of being drawn over each other.
  const markers = new Map<string, string[]>();
  for (const [label, id] of Object.entries(hi.pointers ?? {})) {
    if (!placed.has(id)) continue;
    markers.set(id, [...(markers.get(id) ?? []), label]);
  }
  for (const [id, labels] of markers) {
    const p = placed.get(id)!;
    const cx = p.x + cellW / 2;
    ctx.strokeStyle = css('--ink-3');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, markerY + 3);
    ctx.lineTo(cx, p.y - 12);
    ctx.stroke();
    ctx.fillStyle = css('--ink');
    ctx.font = `600 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // Nearest the cell is the one declared first, so a recorder controls
    // which name sits closest to the box it names.
    labels.forEach((label, i) => ctx.fillText(label, cx, markerY - i * 11));
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
