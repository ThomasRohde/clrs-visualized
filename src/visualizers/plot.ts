import type { PlotData, PlotPoint, Step } from '../algorithms/types.ts';
import type { RenderOptions } from './renderers.ts';
import { ROLE_VAR, type Role } from './roles.ts';
import { BADGE_STEP, badgesFor, drawBadge } from './badge.ts';

/**
 * Canvas renderer for continuous data (R6) — the last of the six.
 *
 * Everything else on this site draws a **structure**: an array, a list, a
 * tree, a graph, a table. Chapter 33 has none. Its algorithms operate on
 * points in space, on real-valued weights, on a function's shape, and the
 * quantity that matters is a *distance* or a *slope* rather than a
 * comparison. None of the other five renderers can say that, which is what
 * earns this one its place.
 *
 * Three decisions shape it.
 *
 * **The recorder owns the axes, and they are fixed for the whole trace.**
 * This is the graph renderer's layout rule again, and it matters more here.
 * Axes fitted to each frame's data would rescale the picture as the algorithm
 * ran; a k-means centroid would appear to move because the axis moved, and
 * the reader — who is being asked to watch points converge — would have no
 * way to tell the two apart. So a snapshot declares `xRange` and `yRange`,
 * and the renderer never invents them.
 *
 * **A link is a first-class mark, and it is usually the cost.** The segments
 * joining each datum to its assigned centroid are not decoration: their total
 * squared length *is* k-means' objective function, so watching them shorten
 * is watching the algorithm work. `rolesForPlotLines` is exported for the
 * same reason the graph exports its edge checker — a key that answered only
 * for the dots would be describing the smaller half of the picture.
 *
 * **A point's group is data, not a role** (E6). Which cluster a point belongs
 * to is a fact about the answer, not a visual state, and colouring by cluster
 * would eat the whole role vocabulary and leave nothing to say "this is the
 * one being examined". The link says which centroid owns a point; a badge
 * says anything else.
 *
 * Second cues are the site's usual ones: `move` gets an ink outline, `done`
 * is a square where every other point is a circle, and an `anchor` — a thing
 * the algorithm placed rather than was given — is drawn larger and hollow.
 */

/** Highlight keys this renderer understands. Bare ids name points. */
interface PlotHighlight {
  /** Being read or measured against. */
  look?: string | string[];
  /** Just moved: a centroid that shifted, an iterate that stepped. */
  move?: string | string[];
  /** Alias for `move`, matching the other renderers' vocabulary. */
  writing?: string | string[];
  /** The point the step is centred on. */
  mark?: string | string[];
  /** Settled, and not going to change again. */
  done?: string | string[];
  /** A named set of points, outlined as a box round them. */
  scope?: string[];
  /** Caption for that box. */
  scopeLabel?: string;
  /** Roles for whole series, by series id. */
  series?: Record<string, Role>;
  /** Roles for individual links, keyed `'from>to'`. */
  links?: Record<string, Role>;
  /** Variable-name labels above points: `{ x: 'p3' }`. */
  pointers?: Record<string, string>;
}

function idsOf(v: string | string[] | undefined): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  return v ?? [];
}

/**
 * Which role each point is in, resolved once per frame.
 *
 * Priority runs rest → done → look → mark → move, the same order every other
 * renderer uses: `move` last, because it is the change actually happening.
 */
export function rolesForPlot(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'plot') return roles;
  const hi = step.hi as PlotHighlight;

  const known = new Set((step.data.points ?? []).map((p) => p.id));
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
 * Which role each **line** is in — series and links together.
 *
 * They share one function because they share one question: a reader looking
 * at a coloured line on this chart does not care whether the recorder called
 * it a curve or a segment. `tests/legends.test.ts` counts what this returns,
 * so a key has to answer for both.
 */
export function rolesForPlotLines(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'plot') return roles;
  const hi = step.hi as PlotHighlight;
  const data = step.data;

  const seriesIds = new Set((data.series ?? []).map((s) => s.id));
  for (const [id, role] of Object.entries(hi.series ?? {})) {
    if (seriesIds.has(id)) roles.set(`s:${id}`, role);
  }

  const linkKeys = new Set((data.links ?? []).map((l) => `${l.from}>${l.to}`));
  for (const [key, role] of Object.entries(hi.links ?? {})) {
    if (linkKeys.has(key)) roles.set(`l:${key}`, role);
  }
  return roles;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Tick positions: at most `want` of them, on a 1/2/5 × 10ⁿ step.
 *
 * Round numbers matter more here than an exact count. A y-axis reading
 * 0, 0.25, 0.5, 0.75, 1 is legible; one reading 0, 0.23, 0.46 is not, and the
 * reader would have to do arithmetic to place a point.
 */
function ticksFor([lo, hi]: [number, number], want: number): number[] {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return [lo];
  const raw = span / Math.max(1, want);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step / 1e6; t += step) {
    out.push(Math.abs(t) < step / 1e6 ? 0 : t);
  }
  return out;
}

/** Tick labels, at whatever precision the step between them needs. */
function labelFor(v: number, step: number): string {
  if (step >= 1) return String(Math.round(v));
  const places = clamp(Math.ceil(-Math.log10(step)), 0, 4);
  return v.toFixed(places);
}

interface Frame {
  x0: number;
  y0: number;
  w: number;
  h: number;
  px: (v: number) => number;
  py: (v: number) => number;
}

/**
 * The plotting area, with room reserved for the axes.
 *
 * The bands are reserved **unconditionally**, exactly as the graph renderer
 * reserves its badge and caption bands: a chart that gained an axis label
 * only on the frames that had one would shift every point sideways mid-trace.
 */
const PAD_TOP = 16;
const PAD_RIGHT = 14;
const AXIS_LEFT = 40;
const AXIS_BOTTOM = 26;

function frameFor(data: PlotData, W: number, H: number): Frame {
  const x0 = AXIS_LEFT;
  const y0 = PAD_TOP;
  const w = Math.max(10, W - AXIS_LEFT - PAD_RIGHT);
  const h = Math.max(10, H - PAD_TOP - AXIS_BOTTOM);
  const [xlo, xhi] = data.xRange;
  const [ylo, yhi] = data.yRange;
  const xSpan = xhi - xlo || 1;
  const ySpan = yhi - ylo || 1;
  return {
    x0,
    y0,
    w,
    h,
    px: (v: number) => x0 + ((v - xlo) / xSpan) * w,
    // Screen y grows downward and data y grows upward. Every plot in the book
    // is read the second way.
    py: (v: number) => y0 + h - ((v - ylo) / ySpan) * h,
  };
}

export function draw(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void {
  void opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  if (!step) return;
  if (step.data?.kind !== 'plot') {
    // A blank canvas is all `verify:players` can see; the console has to say
    // which algorithm was pointed at the wrong renderer.
    console.error('plot was handed a step with no plot snapshot', step.proc, step.line);
    return;
  }

  const styles = getComputedStyle(canvas);
  const css = (name: string) => styles.getPropertyValue(name).trim();
  const colour = (role: Role) => css(ROLE_VAR[role]);
  const mono = "'IBM Plex Mono', ui-monospace, monospace";
  const ink = css('--ink');
  const faint = css('--ink-3');
  const surface = css('--surface');

  const data = step.data;
  const hi = step.hi as PlotHighlight;
  const roles = rolesForPlot(step);
  const lineRoles = rolesForPlotLines(step);
  const F = frameFor(data, W, H);

  // ---- axes, gridlines and ticks, in the neutral ramp only ----
  const xTicks = ticksFor(data.xRange, Math.max(2, Math.round(F.w / 70)));
  const yTicks = ticksFor(data.yRange, Math.max(2, Math.round(F.h / 44)));
  const xStep = xTicks.length > 1 ? xTicks[1]! - xTicks[0]! : 1;
  const yStep = yTicks.length > 1 ? yTicks[1]! - yTicks[0]! : 1;

  ctx.strokeStyle = css('--line');
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const t of xTicks) {
    const x = Math.round(F.px(t)) + 0.5;
    ctx.moveTo(x, F.y0);
    ctx.lineTo(x, F.y0 + F.h);
  }
  for (const t of yTicks) {
    const y = Math.round(F.py(t)) + 0.5;
    ctx.moveTo(F.x0, y);
    ctx.lineTo(F.x0 + F.w, y);
  }
  ctx.stroke();

  ctx.strokeStyle = css('--line-strong');
  ctx.beginPath();
  ctx.moveTo(F.x0 + 0.5, F.y0);
  ctx.lineTo(F.x0 + 0.5, F.y0 + F.h + 0.5);
  ctx.lineTo(F.x0 + F.w, F.y0 + F.h + 0.5);
  ctx.stroke();

  ctx.fillStyle = faint;
  ctx.font = `500 9px ${mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xTicks) ctx.fillText(labelFor(t, xStep), F.px(t), F.y0 + F.h + 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of yTicks) ctx.fillText(labelFor(t, yStep), F.x0 - 5, F.py(t));

  if (data.xLabel) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(data.xLabel, F.x0 + F.w, F.y0 + F.h - 4);
  }
  if (data.yLabel) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(data.yLabel, F.x0 + 4, F.y0);
  }

  // ---- reference rules: chrome, so neutral and dashed ----
  for (const rule of data.rules ?? []) {
    ctx.strokeStyle = faint;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (rule.axis === 'x') {
      const x = Math.round(F.px(rule.at)) + 0.5;
      ctx.moveTo(x, F.y0);
      ctx.lineTo(x, F.y0 + F.h);
    } else {
      const y = Math.round(F.py(rule.at)) + 0.5;
      ctx.moveTo(F.x0, y);
      ctx.lineTo(F.x0 + F.w, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (rule.label) {
      ctx.fillStyle = faint;
      ctx.font = `500 9px ${mono}`;
      ctx.textAlign = rule.axis === 'x' ? 'center' : 'left';
      ctx.textBaseline = rule.axis === 'x' ? 'top' : 'bottom';
      if (rule.axis === 'x') ctx.fillText(rule.label, F.px(rule.at), F.y0 + 2);
      else ctx.fillText(rule.label, F.x0 + 3, F.py(rule.at) - 2);
    }
  }

  const byId = new Map((data.points ?? []).map((p) => [p.id, p]));

  // Everything the recorder plotted is clipped to the frame. A recorder is
  // required to fix its axes for the whole trace, so it cannot also promise
  // that every value fits inside them — a run that starts far outside the
  // interesting window is exactly the case worthshowing, and without this it
  // would draw over the tick labels instead.
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x0, F.y0, F.w, F.h);
  ctx.clip();

  // ---- links, under the points, because a point is the thing being read ----
  for (const link of data.links ?? []) {
    const a = byId.get(link.from);
    const b = byId.get(link.to);
    if (!a || !b) continue;
    const role = lineRoles.get(`l:${link.from}>${link.to}`);
    // A link with no role is still information — in k-means it is a term of
    // the objective function — so it is drawn in the ink ramp rather than in
    // the rule colour, which would put it behind the gridlines.
    ctx.strokeStyle = role ? colour(role) : faint;
    ctx.lineWidth = role ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(F.px(a.x), F.py(a.y));
    ctx.lineTo(F.px(b.x), F.py(b.y));
    ctx.stroke();
  }

  // ---- series ----
  for (const series of data.series ?? []) {
    if (series.points.length === 0) continue;
    const role = lineRoles.get(`s:${series.id}`);
    ctx.strokeStyle = role ? colour(role) : faint;
    ctx.lineWidth = role ? 2 : 1.2;
    if (series.dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    series.points.forEach((pt, i) => {
      const x = F.px(pt.x);
      const y = F.py(pt.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (series.label) {
      const last = series.points[series.points.length - 1]!;
      ctx.fillStyle = role ? colour(role) : faint;
      ctx.font = `500 9px ${mono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      // Clear of the point itself, which usually carries a badge on its other
      // shoulder: the two would otherwise meet in the middle.
      ctx.fillText(series.label, clamp(F.px(last.x) - 10, F.x0 + 20, F.x0 + F.w), F.py(last.y) - 4);
    }
  }

  // ---- the scope box: the bounding box of a named set of points ----
  if (hi.scope && hi.scope.length > 0) {
    const members = hi.scope.map((id) => byId.get(id)).filter((p): p is PlotPoint => Boolean(p));
    if (members.length > 0) {
      const xs = members.map((p) => F.px(p.x));
      const ys = members.map((p) => F.py(p.y));
      const pad = 9;
      const bx = Math.min(...xs) - pad;
      const by = Math.min(...ys) - pad;
      const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
      const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
      ctx.fillStyle = css('--c-scope-wash');
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = colour('scope');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.setLineDash([]);
      if (hi.scopeLabel) {
        ctx.fillStyle = colour('scope');
        ctx.font = `500 10px ${mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(hi.scopeLabel, clamp(bx, F.x0, F.x0 + F.w - 140), Math.max(by - 3, F.y0 + 9));
      }
    }
  }

  // ---- points ----
  const R = 4.5;
  const RA = 8;
  for (const p of data.points ?? []) {
    const x = F.px(p.x);
    const y = F.py(p.y);
    const role = roles.get(p.id);
    const fill = role ? colour(role) : colour('rest');
    const r = p.anchor ? RA : R;

    ctx.beginPath();
    if (role === 'done') {
      // Square corners are `done` everywhere on the site.
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    if (p.anchor) {
      // An anchor is something the algorithm placed, not something it was
      // handed: hollow, so a dozen data points behind it stay readable.
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.strokeStyle = fill;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r + 2, y);
      ctx.lineTo(x + r - 2, y);
      ctx.moveTo(x, y - r + 2);
      ctx.lineTo(x, y + r - 2);
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
      if (role === 'move') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (p.label) {
      ctx.fillStyle = faint;
      ctx.font = `500 9px ${mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, x + r + 3, y);
    }

    const badges = badgesFor(p.attrs);
    badges.forEach((badge, i) => {
      drawBadge(ctx, badge, x + r + 8, y - r - 4 - i * BADGE_STEP, ink, surface, `500 9px ${mono}`);
    });
  }

  ctx.restore();

  // ---- variable markers, on a leader tick down to the point they name ----
  const markers = new Map<string, string[]>();
  for (const [label, id] of Object.entries(hi.pointers ?? {})) {
    if (!byId.has(id)) continue;
    markers.set(id, [...(markers.get(id) ?? []), label]);
  }
  for (const [id, labels] of markers) {
    const p = byId.get(id)!;
    const x = F.px(p.x);
    const y = F.py(p.y);
    const top = Math.max(F.y0 + 8, y - 22);
    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top + 2);
    ctx.lineTo(x, y - RA - 1);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `600 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    labels.forEach((label, i) => ctx.fillText(label, x, top - i * 11));
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
