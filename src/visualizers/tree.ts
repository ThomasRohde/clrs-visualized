import type { Step, TreeData, TreeNode } from '../algorithms/types.ts';
import type { RenderOptions } from './renderers.ts';
import { ROLE_VAR, type Role } from './roles.ts';
import { BADGE_STEP, badgesFor, drawBadge } from './badge.ts';

/**
 * Canvas renderer for rooted trees (R3).
 *
 * Serves everything in Part III and Part V that is a tree: binary search
 * trees, red-black trees, B-trees, Huffman's code tree, disjoint-set forests,
 * and heaps drawn as trees rather than as bars.
 *
 * Two things make one renderer cover all of that.
 *
 * **A node is a box sized to its keys, not a circle.** A B-tree node holds
 * several keys and a binary node holds one; drawing both as the same shape,
 * with the width following the key count, means chapter 18 needs no second
 * renderer. A one-key node gets a fully rounded end, so it still reads as the
 * circle every textbook draws.
 *
 * **Layout is by leaf slot.** Every child slot — including an explicitly
 * `null` one — consumes a column, and a parent sits at the mean of its
 * children's columns. That is what makes a lean visible: a node whose left
 * child is `null` leans right because the empty slot still took its place. So
 * a recorder controls whether NILs are drawn simply by whether it declares
 * them: omit `children` on a leaf and nothing is drawn under it, give
 * `[null, null]` and both NILs appear — which is what a red-black tree wants,
 * because its black heights are counted through them.
 *
 * Roles work as they do everywhere else on the site: the fill is the role, an
 * ink outline is `move`, square corners are `done`. **Attributes are not
 * roles** and never take a coded colour — a node's `attrs` are drawn as a
 * neutral badge on its shoulder. See E6 in docs/PROGRESS.md.
 */

/** Highlight keys this renderer understands. All of them name node ids. */
interface TreeHighlight {
  /** Being read or compared. */
  look?: string | string[];
  /** Being written, linked or rotated. */
  move?: string | string[];
  /** Alias for `move`, matching the other renderers' vocabulary. */
  writing?: string | string[];
  /** The node an operation is centred on — the key being inserted, x in a rotation. */
  mark?: string | string[];
  /** Settled, and not going to change again. */
  done?: string | string[];
  /** Nodes of the subtree this call owns, drawn as a hull rather than a fill. */
  scope?: string[];
  /** Caption for that hull, e.g. "x's right subtree". */
  scopeLabel?: string;
  /** Variable-name labels above nodes: `{ x: 'n4' }`. */
  pointers?: Record<string, string>;
  /**
   * Roles for individual edges, keyed parent-then-child: `{ 'n1>n2': 'look' }`.
   * A search *follows an edge*, and the edge is the step — there is often no
   * node to colour that says which way the walk went.
   */
  edges?: Record<string, Role>;
}

function idsOf(v: string | string[] | undefined): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  return v ?? [];
}

/**
 * Which role each node is in, resolved once per frame.
 *
 * Priority runs rest → done → look → mark → move, the same order the array
 * and cells renderers use, and for the same reason: `move` is the mutation
 * actually happening this step.
 */
export function rolesForTree(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'tree') return roles;
  const hi = step.hi as TreeHighlight;

  const known = new Set(step.data.nodes.map((n) => n.id));
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
 * Which role each *edge* is in: `"n1>n2" -> 'look'`.
 *
 * Exported for the same reason `rolesForLinks` is on the cells renderer:
 * `tests/legends.test.ts` counts what a step actually paints, and an edge
 * takes a coded colour, so a key that answered only for nodes would be
 * describing half the picture. Filtered to edges that exist, so a highlight
 * naming a link the tree does not have paints nothing.
 */
export function rolesForEdges(step: Step): Map<string, Role> {
  const roles = new Map<string, Role>();
  if (step.data?.kind !== 'tree') return roles;
  const edges = (step.hi as TreeHighlight).edges;
  if (!edges) return roles;

  const drawn = new Set<string>();
  for (const node of step.data.nodes) {
    for (const child of node.children ?? []) if (child) drawn.add(`${node.id}>${child}`);
  }
  for (const [edge, role] of Object.entries(edges)) if (drawn.has(edge)) roles.set(edge, role);
  return roles;
}

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  node: TreeNode;
}

/** A `null` child slot: drawn as a stub and a small square where NIL sits. */
interface Nil {
  x: number;
  y: number;
  parent: string;
}

const NODE_H_MAX = 40;
const NODE_H_MIN = 18;
const KEY_W = 22;
const PAD_SIDE = 10;
const PAD_TOP = 26;
const PAD_BOTTOM = 14;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * How wide a node has to be to hold its keys.
 *
 * A single-key node is round — as wide as it is tall — until its key is too
 * long to fit, which is what an interval tree's `[5, 11]` or a Huffman
 * frequency of three digits needs. Measured from the character count rather
 * than from the canvas, because the layout runs before there is a context to
 * measure with; the estimate only has to be generous.
 */
function widthFor(node: TreeNode, keyW: number, h: number): number {
  const keys = Math.max(1, node.keys.length);
  if (keys > 1) return keys * keyW + 10;
  const chars = String(node.keys[0] ?? '').length;
  return Math.max(h, chars * (h < 24 ? 6 : 7.4) + 12);
}

/**
 * Place every node, and every NIL slot, on a grid of leaf columns.
 *
 * The tree is measured before it is drawn — a run of insertions makes it both
 * deeper and wider, and the picture has to keep fitting. Unlike the cells
 * renderer, nothing here can be reserved from the first frame: a tree's shape
 * *is* what the algorithm is doing, so it rescales as it grows, and that is
 * the one animation in it that is not a lie.
 */
function layout(
  data: TreeData,
  W: number,
  H: number,
): { placed: Map<string, Placed>; nils: Nil[]; nodeH: number } {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const placed = new Map<string, Placed>();
  const nils: Nil[] = [];
  // A forest is laid out as one tree after another, left to right, with a
  // blank column between them. Huffman's queue and a disjoint-set forest are
  // both several trees at once, and both are unreadable if they overlap.
  const forest = [data.root, ...(data.roots ?? [])].filter(
    (id): id is string => !!id && byId.has(id),
  );
  if (forest.length === 0) return { placed, nils, nodeH: NODE_H_MAX };

  // Pass one: columns and depths, walking left to right so that a column
  // index is also the in-order position.
  const col = new Map<string, number>();
  const depth = new Map<string, number>();
  const nilSlots: Array<{ col: number; depth: number; parent: string }> = [];
  let slot = 0;
  let deepest = 0;
  const widest = data.nodes.reduce((m, n) => Math.max(m, n.keys.length), 1);

  const walk = (id: string | null, d: number, parent: string): number => {
    deepest = Math.max(deepest, d);
    if (id === null || !byId.has(id)) {
      const at = slot++;
      nilSlots.push({ col: at, depth: d, parent });
      return at;
    }
    const node = byId.get(id)!;
    const kids = node.children ?? [];
    if (kids.length === 0) {
      const at = slot++;
      col.set(id, at);
      depth.set(id, d);
      return at;
    }
    const xs = kids.map((child) => walk(child, d + 1, id));
    const at = (Math.min(...xs) + Math.max(...xs)) / 2;
    col.set(id, at);
    depth.set(id, d);
    return at;
  };
  forest.forEach((id, i) => {
    if (i > 0) slot += 0.6;
    walk(id, 0, '');
  });

  // Pass two: turn columns and depths into pixels, sized so the whole tree
  // fits however deep and wide this particular step happens to be.
  const columns = Math.max(1, slot);
  const rows = deepest + 1;
  const availW = W - PAD_SIDE * 2;
  const availH = H - PAD_TOP - PAD_BOTTOM;
  // The gap between levels is *capped*, not just divided out. A five-procedure
  // pseudocode panel makes the canvas tall, and a four-level tree given 600px
  // to spread over becomes small nodes floating a long way apart — technically
  // correct and unreadable. Spare height goes to the margins instead.
  const levelH = clamp(availH / (rows - 1 + 1.2), 30, 92);
  const nodeH = clamp(Math.min(levelH - 14, availW / columns - 6), NODE_H_MIN, NODE_H_MAX);
  const keyW = clamp(availW / (columns * widest) - 4, 12, KEY_W);
  const slotW = availW / columns;
  const blockH = (rows - 1) * levelH + nodeH;
  const yTop = PAD_TOP + Math.max(0, (availH - blockH) / 2);
  const xAt = (c: number) => PAD_SIDE + (c + 0.5) * slotW;
  /** The centre line of a level, so a NIL square sits on the grid like a node. */
  const yAt = (d: number) => yTop + d * levelH + nodeH / 2;

  for (const [id, c] of col) {
    const node = byId.get(id)!;
    const w = widthFor(node, keyW, nodeH);
    placed.set(id, { x: xAt(c), y: yAt(depth.get(id)!), w, h: nodeH, node });
  }
  for (const nil of nilSlots) {
    nils.push({ x: xAt(nil.col), y: yAt(nil.depth), parent: nil.parent });
  }
  return { placed, nils, nodeH };
}

function fmtKey(k: number | string): string {
  if (k === Infinity) return '∞';
  if (k === -Infinity) return '−∞';
  return String(k);
}

export function draw(canvas: HTMLCanvasElement, step: Step | undefined, opts: RenderOptions): void {
  void opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  if (!step) return;
  if (step.data?.kind !== 'tree') {
    // A blank canvas is what `verify:players` reports; the console has to say
    // which algorithm was pointed at the wrong renderer.
    console.error('tree was handed a step with no tree snapshot', step.proc, step.line);
    return;
  }

  const styles = getComputedStyle(canvas);
  const css = (name: string) => styles.getPropertyValue(name).trim();
  const colour = (role: Role) => css(ROLE_VAR[role]);
  const mono = "'IBM Plex Mono', ui-monospace, monospace";
  const ink = css('--ink');
  const surface = css('--surface');

  const data = step.data;
  const hi = step.hi as TreeHighlight;
  const roles = rolesForTree(step);
  const edgeRoles = rolesForEdges(step);
  const { placed, nils, nodeH } = layout(data, W, H);
  if (placed.size === 0) {
    ctx.fillStyle = css('--ink-3');
    ctx.font = `12px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('the tree is empty', W / 2, H / 2);
    return;
  }

  // The subtree hull, first, so everything else sits on top of it. It is the
  // tree's version of the array renderer's bracket: it says which part of the
  // structure this call owns, without competing with any node's own role.
  const scope = (hi.scope ?? []).map((id) => placed.get(id)).filter((p): p is Placed => !!p);
  if (scope.length > 0) {
    const x0 = Math.min(...scope.map((p) => p.x - p.w / 2)) - 8;
    const x1 = Math.max(...scope.map((p) => p.x + p.w / 2)) + 8;
    const y0 = Math.min(...scope.map((p) => p.y - p.h / 2)) - 8;
    const y1 = Math.max(...scope.map((p) => p.y + p.h / 2)) + 8;
    ctx.fillStyle = css('--c-scope-wash');
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 10);
    ctx.fill();
    ctx.strokeStyle = colour('scope');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (hi.scopeLabel) {
      ctx.fillStyle = colour('scope');
      ctx.font = `500 10px ${mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(hi.scopeLabel, x0 + 2, y0 - 2);
    }
  }

  // Edges, under the nodes so a line never crosses a key. An edge takes a
  // role colour where one is named: following a pointer *is* the step in a
  // tree search, and there is no node that says which way the walk went.
  for (const [id, from] of placed) {
    for (const child of from.node.children ?? []) {
      if (!child) continue;
      const to = placed.get(child);
      if (!to) continue;
      const role = edgeRoles.get(`${id}>${child}`);
      ctx.strokeStyle = role ? colour(role) : css('--line-strong');
      ctx.lineWidth = role ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y + from.h / 2);
      ctx.lineTo(to.x, to.y - to.h / 2);
      ctx.stroke();
    }
  }

  // NIL slots: a stub and a small hollow square, drawn only where a recorder
  // declared the empty child. A red-black tree declares all of them, because
  // its black heights are counted through them; a plain BST declares one only
  // where the lean would otherwise be ambiguous.
  ctx.lineWidth = 1;
  for (const nil of nils) {
    const from = placed.get(nil.parent);
    if (!from) continue;
    // A NIL sits on the level grid, in line with whatever real nodes share its
    // depth: hung off its parent by a short stub instead, it reads as
    // something dangling rather than as the empty child slot it is.
    const size = Math.max(6, nodeH * 0.3);
    ctx.strokeStyle = css('--line-strong');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + from.h / 2);
    ctx.lineTo(nil.x, nil.y - size / 2);
    ctx.stroke();
    ctx.strokeStyle = css('--ink-3');
    ctx.lineWidth = 1;
    ctx.strokeRect(nil.x - size / 2, nil.y - size / 2, size, size);
  }

  // Nodes.
  for (const [id, p] of placed) {
    const role = roles.get(id) ?? 'rest';
    const radius = role === 'done' ? 2 : Math.min(p.h / 2, 10);
    ctx.fillStyle = colour(role);
    ctx.beginPath();
    ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, radius);
    ctx.fill();
    if (role === 'move') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Keys, side by side, with a hairline between them so a B-tree node reads
    // as several slots rather than as one long number.
    const keys = p.node.keys;
    const cellW = p.w / keys.length;
    ctx.font = `500 ${p.h < 24 ? 9 : 11}px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < keys.length; k++) {
      const cx = p.x - p.w / 2 + (k + 0.5) * cellW;
      if (k > 0) {
        ctx.strokeStyle = css('--surface');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - p.w / 2 + k * cellW, p.y - p.h / 2 + 3);
        ctx.lineTo(p.x - p.w / 2 + k * cellW, p.y + p.h / 2 - 3);
        ctx.stroke();
      }
      // Same as the other two renderers: the value is drawn in ink on top of
      // the role fill, so one theme swap changes both together.
      ctx.fillStyle = ink;
      ctx.fillText(fmtKey(keys[k]!), cx, p.y);
    }

    badgesFor(p.node.attrs).forEach((badge, i) => {
      drawBadge(
        ctx,
        badge,
        p.x + p.w / 2 + 2,
        p.y - p.h / 2 + 2 + i * BADGE_STEP,
        ink,
        surface,
        mono,
      );
    });
  }

  // Variable markers, stacked above the node they name, exactly as on the
  // cells renderer — two names often land on one node during a rotation.
  const markers = new Map<string, string[]>();
  for (const [label, id] of Object.entries(hi.pointers ?? {})) {
    if (placed.has(id)) markers.set(id, [...(markers.get(id) ?? []), label]);
  }
  for (const [id, labels] of markers) {
    const p = placed.get(id)!;
    ctx.strokeStyle = css('--ink-3');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.h / 2 - 3);
    ctx.lineTo(p.x, p.y - p.h / 2 - 8);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `600 10px ${mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    labels.forEach((label, i) => ctx.fillText(label, p.x, p.y - p.h / 2 - 9 - i * 11));
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
 * Nodes and the edges between them; an edge is keyed `parent>child`. Part of the `Renderer` contract, and what `describe.ts` reads to say
 * out loud what the picture is emphasising.
 */
export function roles(step: Step | undefined): Map<string | number, Role> {
  if (!step) return new Map();
  return new Map<string | number, Role>([...rolesForTree(step), ...rolesForEdges(step)]);
}
