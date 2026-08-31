import type { GraphData, GraphEdge, GraphVertex, Step } from '../algorithms/types.ts';
import type { RenderOptions } from './renderers.ts';
import { ROLE_VAR, type Role } from './roles.ts';
import { BADGE_STEP, badgesFor, drawBadge } from './badge.ts';

/**
 * Canvas renderer for graphs (R4).
 *
 * Serves the whole of Part VI: breadth- and depth-first search, topological
 * sort, strongly connected components, both minimum spanning trees, all three
 * shortest-path algorithms, maximum flow and bipartite matching.
 *
 * Three decisions shape it, and all three were taken before chapter 20.
 *
 * **The recorder owns the layout.** A graph has no canonical drawing, and
 * unlike a tree there is nothing in the structure to derive one from. Worse,
 * anything computed *per frame* — a force-directed relaxation, say — would
 * move vertices as the algorithm ran, which is the one thing a graph
 * animation must never do: the reader is tracking where the search has got
 * to, and a vertex that drifts destroys that. So a vertex carries a
 * normalized `x`/`y` fixed for the whole trace, chosen by the code that built
 * the network — source on the left and sink on the right for a flow network,
 * two columns for a bipartite graph, a circle for everything else. A snapshot
 * whose vertices carry no position is laid out on a circle here, which is
 * what a graph the reader typed gets.
 *
 * **An edge takes a role colour**, exactly as an arc does on the cells
 * renderer and an edge does on the tree one — and here it matters more than
 * anywhere else on the site. Half of Part VI is *about* edges: the tree edges
 * of a DFS, the edge being relaxed, the light edge crossing a cut, the
 * augmenting path. `rolesForGraphEdges` is exported so `tests/legends.test.ts`
 * counts them, because a key that answered only for vertices would describe
 * the smaller half of the picture.
 *
 * **A vertex's numbers are badges, not colours** (E6). `d`, `π`, a discovery
 * time, a residual capacity: all data, all drawn in the neutral ramp on the
 * vertex's shoulder, so the fill stays free to say what the algorithm is
 * doing to it. A vertex can hold d = 7 *and* be the one the queue just
 * handed back.
 *
 * Second cues match the rest of the site: `move` gets an ink outline, and a
 * `done` vertex is drawn square where every other vertex is a circle.
 */

/** Highlight keys this renderer understands. Bare ids name vertices. */
interface GraphHighlight {
  /** Being read, compared, or scanned. */
  look?: string | string[];
  /** Being written: a d that just changed, a vertex just discovered. */
  move?: string | string[];
  /** Alias for `move`, matching the other renderers' vocabulary. */
  writing?: string | string[];
  /** The vertex the step is centred on — u, just dequeued. */
  mark?: string | string[];
  /** Settled, and not going to change again. */
  done?: string | string[];
  /**
   * A named *set* of vertices — the queue, the cut, the vertices already in
   * the tree. Drawn as a ring round each one rather than as a hull: the
   * members of a set in a graph are rarely next to each other, and a hull
   * round scattered vertices swallows the ones between them.
   */
  scope?: string[];
  /** Caption for that set, drawn in the corner: "Q = {2, 5}". */
  scopeLabel?: string;
  /** Roles for individual edges, keyed `'from>to'`. */
  edges?: Record<string, Role>;
  /** Variable-name labels above vertices: `{ u: 'v3' }`. */
  pointers?: Record<string, string>;
}

function idsOf(v: string | string[] | undefined): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  return v ?? [];
}

/**
 * Which role each vertex is in, resolved once per frame.
 *
 * Priority runs rest → done → look → mark → move, the same order every other
 * renderer uses: `move` last because it is the mutation actually happening.
 */
export function rolesForGraph(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'graph') return roles;
  const hi = step.hi as GraphHighlight;

  const known = new Set(step.data.vertices.map((v) => v.id));
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
 * Which role each *edge* is in, keyed the way the edge is actually drawn.
 *
 * On an undirected graph an edge is stored once and a recorder may name it
 * from either end — `LIST` order is not the reader's order — so both
 * orientations resolve to the stored one. A highlight naming an edge the
 * graph does not have paints nothing, rather than throwing.
 */
export function rolesForGraphEdges(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'graph') return roles;
  const named = (step.hi as GraphHighlight).edges;
  if (!named) return roles;

  const drawn = new Map<string, string>();
  for (const e of step.data.edges) {
    drawn.set(`${e.from}>${e.to}`, `${e.from}>${e.to}`);
    if (!step.data.directed) drawn.set(`${e.to}>${e.from}`, `${e.from}>${e.to}`);
  }
  for (const [key, role] of Object.entries(named)) {
    const target = drawn.get(key);
    if (target) roles.set(target, role);
  }
  return roles;
}

interface Placed {
  x: number;
  y: number;
  r: number;
  vertex: GraphVertex;
}

const PAD = 12;
/**
 * Room for everything that hangs off a vertex rather than sitting inside it.
 *
 * A badge hangs off the top-right shoulder, a variable name hangs under the
 * bottom, and the set caption runs along the top of the canvas. A vertex
 * placed at the edge of the drawing area has all three cut in half — which is
 * invisible to a test and obvious the moment you look at chapter 22, where
 * every vertex carries a badge.
 *
 * All of it is **reserved unconditionally**, not measured per step. The
 * renderer cannot know from one snapshot whether another step has a caption,
 * and a band that appeared only on the steps that use one would move every
 * vertex as the reader stepped through — which is the one thing a graph
 * animation must never do.
 */
const LABEL_BAND = 20;
const BADGE_TOP = 8;
const BADGE_RIGHT = 20;
const MARKER_BOTTOM = 13;
const R_MIN = 9;
const R_MAX = 23;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Place every vertex, and pick one radius for all of them.
 *
 * The radius comes from how close the two nearest vertices actually are, not
 * from the vertex count: a bipartite graph in two columns and a circle of the
 * same size have very different spacing, and a radius derived from n alone
 * makes one of them touch and the other float.
 */
function layout(data: GraphData, W: number, H: number): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const n = data.vertices.length;
  if (n === 0) return placed;

  // A vertex with no position of its own puts the whole graph on a circle:
  // mixing supplied and invented positions produces a picture that looks
  // deliberate and is not.
  const positioned = data.vertices.every((v) => typeof v.x === 'number' && typeof v.y === 'number');
  const pts = data.vertices.map((v, i) => {
    if (positioned) return { x: v.x!, y: v.y! };
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 0.5 + 0.42 * Math.cos(angle), y: 0.5 + 0.42 * Math.sin(angle) };
  });

  const padTop = PAD + LABEL_BAND + BADGE_TOP;
  const padBottom = PAD + MARKER_BOTTOM;
  const availW = Math.max(1, W - PAD * 2 - BADGE_RIGHT);
  const availH = Math.max(1, H - padTop - padBottom);
  const at = (p: { x: number; y: number }) => ({
    x: PAD + p.x * availW,
    y: padTop + p.y * availH,
  });
  const px = pts.map(at);

  let nearest = Math.min(availW, availH);
  for (let i = 0; i < px.length; i++) {
    for (let j = i + 1; j < px.length; j++) {
      const d = Math.hypot(px[i]!.x - px[j]!.x, px[i]!.y - px[j]!.y);
      if (d < nearest) nearest = d;
    }
  }
  const r = clamp(nearest * 0.36, R_MIN, R_MAX);

  // The radius is only known after the positions are, so a vertex a recorder
  // put at x = 0 would otherwise have its left half outside the canvas. The
  // clamp is here rather than in the padding so that a recorder can use the
  // full 0‥1 range and mean it.
  data.vertices.forEach((vertex, i) => {
    placed.set(vertex.id, {
      x: clamp(px[i]!.x, r + 2, Math.max(r + 2, W - r - BADGE_RIGHT)),
      y: clamp(
        px[i]!.y,
        r + LABEL_BAND + BADGE_TOP,
        Math.max(r + LABEL_BAND + BADGE_TOP, H - r - MARKER_BOTTOM),
      ),
      r,
      vertex,
    });
  });
  return placed;
}

/**
 * Perpendicular offset for an edge's midpoint.
 *
 * Zero for an ordinary edge. When the graph also holds the reverse edge — a
 * residual pair in chapter 24, and nothing else in the book — both are bowed
 * apart so that two arrowheads pointing opposite ways are not drawn on one
 * line, which reads as a single edge with a decoration.
 */
function bowOf(edge: GraphEdge, data: GraphData): number {
  if (!data.directed) return 0;
  const back = data.edges.some((e) => e.from === edge.to && e.to === edge.from);
  if (!back) return 0;
  return edge.from < edge.to ? 12 : -12;
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  colour: string,
): void {
  const len = 8;
  const spread = 0.42;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - len * Math.cos(angle - spread), y - len * Math.sin(angle - spread));
  ctx.lineTo(x - len * Math.cos(angle + spread), y - len * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fill();
}

export function draw(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void {
  void opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  if (!step) return;
  if (step.data?.kind !== 'graph') {
    // A blank canvas is what `verify:players` reports; the console has to say
    // which algorithm was pointed at the wrong renderer.
    console.error('graph was handed a step with no graph snapshot', step.proc, step.line);
    return;
  }

  const styles = getComputedStyle(canvas);
  const css = (name: string) => styles.getPropertyValue(name).trim();
  const colour = (role: Role) => css(ROLE_VAR[role]);
  const mono = "'IBM Plex Mono', ui-monospace, monospace";
  const ink = css('--ink');
  const surface = css('--surface');

  const data = step.data;
  const hi = step.hi as GraphHighlight;
  const roles = rolesForGraph(step);
  const edgeRoles = rolesForGraphEdges(step);
  const placed = layout(data, W, H);
  if (placed.size === 0) {
    ctx.fillStyle = css('--ink-3');
    ctx.font = `12px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('the graph is empty', W / 2, H / 2);
    return;
  }

  // Edges first, so a line never crosses a vertex label. Coloured edges are
  // drawn after plain ones: an augmenting path that runs under three grey
  // edges is the step, and it has to be on top of them.
  const ordered = [...data.edges].sort((a, b) => {
    const ra = edgeRoles.has(`${a.from}>${a.to}`) ? 1 : 0;
    const rb = edgeRoles.has(`${b.from}>${b.to}`) ? 1 : 0;
    return ra - rb;
  });

  for (const edge of ordered) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) continue;

    const role = edgeRoles.get(`${edge.from}>${edge.to}`);
    const bow = bowOf(edge, data);
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    // The control point is pushed off the straight line by `bow`, at right
    // angles to it. A zero bow makes the quadratic a straight line, so there
    // is only one path in the code either way.
    const cx = mx + (-dy / len) * bow;
    const cy = my + (dx / len) * bow;

    // Start and end on the circles' boundaries rather than at their centres,
    // so an arrowhead lands on the vertex instead of under it.
    const a0 = Math.atan2(cy - from.y, cx - from.x);
    const a1 = Math.atan2(cy - to.y, cx - to.x);
    const x0 = from.x + Math.cos(a0) * from.r;
    const y0 = from.y + Math.sin(a0) * from.r;
    const x1 = to.x + Math.cos(a1) * (to.r + (data.directed ? 6 : 0));
    const y1 = to.y + Math.sin(a1) * (to.r + (data.directed ? 6 : 0));

    ctx.strokeStyle = role ? colour(role) : css('--line-strong');
    ctx.lineWidth = role ? 3 : 1.3;
    // A ghost edge is dashed: it exists in the residual network and not in
    // the network itself, and drawing it solid would claim capacity that is
    // not there.
    if (edge.ghost) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);

    if (data.directed) {
      arrowHead(
        ctx,
        x1,
        y1,
        Math.atan2(y1 - cy, x1 - cx),
        role ? colour(role) : css('--line-strong'),
      );
    }

    if (edge.weight !== undefined && edge.weight !== null) {
      // The chip sits on the curve's own midpoint, which for a bowed edge is
      // halfway between the straight midpoint and the control point.
      const wx = (mx + cx) / 2;
      const wy = (my + cy) / 2;
      const text = String(edge.weight);
      ctx.font = `500 10px ${mono}`;
      const w = ctx.measureText(text).width + 7;
      ctx.fillStyle = surface;
      ctx.beginPath();
      ctx.roundRect(wx - w / 2, wy - 7, w, 14, 4);
      ctx.fill();
      ctx.fillStyle = role ? colour(role) : css('--ink-2');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, wx, wy + 0.5);
    }
  }

  // The named set, as a ring outside each member. Drawn before the vertices
  // so a ring never sits on top of a label.
  const scope = (hi.scope ?? []).map((id) => placed.get(id)).filter((p): p is Placed => !!p);
  if (scope.length > 0) {
    ctx.strokeStyle = colour('scope');
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    for (const p of scope) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (const [id, p] of placed) {
    const role = roles.get(id) ?? 'rest';
    ctx.fillStyle = colour(role);
    ctx.beginPath();
    // The second cue, matching the bars and the tree: a settled vertex is
    // square where every other vertex is round, so `done` survives a reader
    // who cannot separate the hues.
    if (role === 'done') ctx.roundRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2, 3);
    else ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    if (role === 'move') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = ink;
    ctx.font = `600 ${p.r < 14 ? 10 : 12}px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.vertex.label), p.x, p.y + 0.5);

    badgesFor(p.vertex.attrs).forEach((badge, i) => {
      drawBadge(ctx, badge, p.x + p.r + 2, p.y - p.r + i * BADGE_STEP, ink, surface, mono);
    });
  }

  // Variable markers, stacked under the vertex they name. Under, not over,
  // because the badges are above: the two would overprint on every vertex
  // that has both, which in chapter 22 is the one being relaxed.
  const markers = new Map<string, string[]>();
  for (const [label, id] of Object.entries(hi.pointers ?? {})) {
    if (placed.has(id)) markers.set(id, [...(markers.get(id) ?? []), label]);
  }
  for (const [id, labels] of markers) {
    const p = placed.get(id)!;
    ctx.fillStyle = ink;
    ctx.font = `600 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    labels.forEach((label, i) => ctx.fillText(label, p.x, p.y + p.r + 3 + i * 11));
  }

  // The caption for the named set, last of all and in its own reserved band
  // along the top, so no vertex is ever drawn over it and it is never drawn
  // over a vertex.
  if (hi.scopeLabel) {
    ctx.fillStyle = colour('scope');
    ctx.font = `500 10px ${mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(hi.scopeLabel, PAD - 6, 2);
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

/**
 * Everything this renderer paints in a coded role, in one map.
 *
 * Vertices and edges; an edge is keyed `from>to`. Part of the `Renderer` contract, and what `describe.ts` reads to say
 * out loud what the picture is emphasising.
 */
export function roles(step: Step | undefined): Map<string | number, Role> {
  if (!step) return new Map();
  return new Map<string | number, Role>([...rolesForGraph(step), ...rolesForGraphEdges(step)]);
}
