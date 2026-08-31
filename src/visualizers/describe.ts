/**
 * The picture, in words.
 *
 * A canvas is a bitmap: `role="img"` with a fixed label says "Floyd-Warshall
 * visualization" and nothing about the 4 × 4 matrix that is the entire point
 * of looking at it. The narration explains what the step *did*, and the trace
 * tape says where you are, but neither carries the state being taught, so a
 * reader using a screen reader had the commentary and none of the data.
 *
 * This builds that data into a sentence. The structure comes from the `Step`
 * alone, which is what makes one function cover all six renderer families;
 * **what is emphasised comes from the renderer's own `roles()`**, so the words
 * name exactly what the picture paints. Reading `step.hi` again here would be
 * a second vocabulary for the same six states, and the two would drift the
 * first time a renderer learned a new highlight key — which is the same reason
 * the on-screen key is generated from `roles.ts` rather than typed out.
 *
 * It touches no DOM, so what it says about a trace is testable in plain Node
 * rather than only in a browser.
 *
 * Two things it deliberately is not. It is **not a live region**: read out on
 * every frame of playback it would be unusable, so the player associates it
 * with the canvas through `aria-describedby` and it is read when the reader
 * asks. And it is **not the narration** — `step.note` says why, this says
 * what, and repeating either inside the other would double the length of both.
 */
import type { AuxBuffer, AuxRow, Step, StepData } from '../algorithms/types.ts';
import type { Legend, Role } from './roles.ts';

/** Enumerations stop here and say how many were left; a screen reader read
 *  aloud is a queue, not a page, and forty items is already a long wait. */
const MAX_ITEMS = 40;

const ROLE_ORDER: Role[] = ['mark', 'look', 'move', 'done', 'scope'];

function fmt(v: number | string | null | undefined): string {
  if (v === Infinity) return 'infinity';
  if (v === -Infinity) return 'minus infinity';
  if (v === null || v === undefined) return 'empty';
  return String(v);
}

/** `a, b and c`, which reads better aloud than a bare comma list. */
function list(parts: string[]): string {
  if (parts.length === 0) return 'none';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function capped(parts: string[]): string {
  if (parts.length <= MAX_ITEMS) return list(parts);
  return `${parts.slice(0, MAX_ITEMS).join(', ')} and ${parts.length - MAX_ITEMS} more`;
}

/** Consecutive numbers as a range: `1, 2, 3, 7` becomes `1 to 3 and 7`. */
function runs(values: number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    out.push(j > i + 1 ? `${sorted[i]} to ${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return capped(out);
}

/** Whatever a highlight key holds, as a flat list of ids. */
function idsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(idsOf);
  return [];
}

/**
 * How to say one id out loud, which is the only thing that varies by kind.
 *
 * A bar is at a position, a grid cell is `row, column` and a graph vertex is
 * `v3` — the recorders' own ids, which are readable for a graph and are not
 * for a grid. Every renderer with two role maps keys the second one `a>b`, so
 * "the link between" is handled once here rather than six times.
 */
function namerFor(data: StepData | undefined): (id: string) => string {
  const cell = (id: string): string => {
    const m = /^(\d+),(\d+)$/.exec(id);
    return m ? `row ${Number(m[1]) + 1}, column ${Number(m[2]) + 1}` : id;
  };
  const vertex = (id: string): string => {
    const m = /^v(\d+)$/.exec(id);
    return m ? `vertex ${m[1]}` : id;
  };

  // A tree node and a list cell are named `n3` and `x7` by their recorders,
  // which is right for a role map and useless read aloud — the reader knows
  // them by the key or the value in the box, so that is what they are called.
  const byContent = new Map<string, string>();
  if (data?.kind === 'tree') {
    for (const node of data.nodes) byContent.set(node.id, node.keys.map((k) => fmt(k)).join(', '));
  }
  if (data?.kind === 'cells') {
    for (const row of data.rows) {
      for (const c of row.cells) {
        // A list cell carries both: `x7` is the slot the arcs point at and the
        // caption the reader sees, and 70 is what is in it. Neither alone
        // identifies the box being talked about.
        const caption = c.label === undefined ? '' : `${fmt(c.label)} `;
        byContent.set(c.id, `${caption}holding ${fmt(c.value)}`.trim());
      }
    }
  }

  const one = !data
    ? (id: string) => `position ${id}`
    : data.kind === 'grid'
      ? cell
      : data.kind === 'graph'
        ? vertex
        : (id: string) => byContent.get(id) ?? id;

  return (id) => {
    const pair = id.split('>');
    if (pair.length === 2) return `${one(pair[0]!)} to ${one(pair[1]!)}`;
    return one(id);
  };
}

/**
 * What the step is emphasising, in the algorithm's own words.
 *
 * `roles` is the renderer's own colour decision, so this says exactly what the
 * picture says — a bar the renderer painted as the pivot is announced as the
 * pivot, and a highlight key no renderer reads is announced by neither.
 * `scope` is the exception and comes from the step directly: it is chrome, a
 * bracket or a ring rather than a filled thing, so no renderer's role map
 * carries it.
 */
function emphasis(step: Step, legend: Legend, roles: Map<string | number, Role>): string {
  const name = namerFor(step.data);
  const meanings = new Map(legend);
  const parts: string[] = [];

  const byRole = new Map<Role, string[]>();
  for (const [id, role] of roles) {
    if (role === 'rest') continue;
    (byRole.get(role) ?? byRole.set(role, []).get(role)!).push(String(id));
  }

  for (const role of ROLE_ORDER) {
    const ids =
      role === 'scope' ? idsOf((step.hi as Record<string, unknown>).scope) : byRole.get(role);
    if (!ids || ids.length === 0) continue;
    // The legend is the wording the sighted reader is given for this colour,
    // so it is the wording to use here — the alternative is inventing a second
    // vocabulary for the same six states.
    const meaning = meanings.get(role) ?? role;
    const label =
      role === 'scope' ? ((step.hi as { scopeLabel?: string }).scopeLabel ?? meaning) : meaning;
    parts.push(`${label}: ${step.data ? capped(ids.map(name)) : runs(ids.map(Number))}`);
  }

  const pointers = (step.hi as { pointers?: Record<string, string | number> }).pointers;
  if (pointers) {
    const shown = Object.entries(pointers).map(([k, v]) => `${k} at ${name(String(v))}`);
    if (shown.length > 0) parts.push(capped(shown));
  }
  return parts.join('. ');
}

function describeArray(values: Array<number | null>): string {
  // Index 0 is the unused dummy that makes every array 1-indexed like the
  // book's pseudocode, so the reader is never told about it.
  const cells = values.slice(1);
  return `Bar chart of ${cells.length} values, positions 1 to ${cells.length}: ${capped(
    cells.map((v) => fmt(v)),
  )}.`;
}

/**
 * The aux strip: values that live *outside* the array.
 *
 * Merge sort's L and R, counting sort's C, the running best in HIRE-ASSISTANT.
 * A sighted reader is given these their own row above the chart precisely
 * because they cannot be found in it, so a description that stopped at the
 * bars would leave out the half of the state the chapter is about — and on
 * HIRE-ASSISTANT, which never moves a bar, it would leave out all of it.
 */
function describeAux(step: Step, declared: AuxRow[]): string {
  const buffers = (step.hi as { aux?: Record<string, AuxBuffer> }).aux;
  if (!buffers) return '';
  const labels = new Map(declared.map((row) => [row.key, row.label]));
  const parts: string[] = [];

  for (const [key, buffer] of Object.entries(buffers)) {
    // Position 0 is the same unused dummy the array has.
    const values = buffer.values.slice(1).map((v, i) => {
      const caption = buffer.labels?.[i + 1];
      const marked = buffer.ptr === i + 1 ? ' (here)' : '';
      return caption === null || caption === undefined
        ? `${fmt(v)}${marked}`
        : `${caption} ${fmt(v)}${marked}`;
    });
    if (values.length === 0) continue;
    parts.push(`${labels.get(key) ?? key}: ${capped(values)}`);
  }
  return parts.length > 0 ? ` Alongside — ${parts.join('. ')}.` : '';
}

/**
 * The two spans an array recorder draws as chrome rather than as a fill.
 *
 * `range` is the subarray bracket that quicksort and merge sort own, and
 * `heapSize` is heapsort's boundary between the heap and the sorted tail.
 * Neither is in any bar's role, and both are what the step is *about*.
 */
function describeSpans(step: Step, values: Array<number | null>): string {
  const hi = step.hi as { range?: unknown; heapSize?: unknown };
  const parts: string[] = [];
  if (Array.isArray(hi.range) && hi.range.length === 2) {
    parts.push(`the subarray in play is positions ${hi.range[0]} to ${hi.range[1]}`);
  }
  if (typeof hi.heapSize === 'number') {
    const n = values.length - 1;
    parts.push(
      hi.heapSize >= n
        ? 'the heap is the whole array'
        : `the heap is positions 1 to ${hi.heapSize}, sorted from ${hi.heapSize + 1} on`,
    );
  }
  return parts.length > 0 ? ` ${list(parts)}.` : '';
}

function describeData(data: StepData): string {
  switch (data.kind) {
    case 'cells': {
      const rows = data.rows.map((row) => {
        const values = capped(row.cells.map((c) => fmt(c.value)));
        const offset = row.offset ? `, starting at position ${row.offset + 1}` : '';
        return `${row.label ?? 'row'}${offset}: ${values}`;
      });
      return `${data.rows.length} row${data.rows.length === 1 ? '' : 's'} of cells. ${rows.join('. ')}.`;
    }

    case 'tree': {
      const byId = new Map(data.nodes.map((n) => [n.id, n]));
      const roots = data.roots ?? (data.root ? [data.root] : []);
      const described = data.nodes.map((node) => {
        const keys = node.keys.map((k) => fmt(k)).join(', ');
        const kids = (node.children ?? [])
          .map((c) =>
            c === null
              ? 'nil'
              : (byId
                  .get(c)
                  ?.keys.map((k) => fmt(k))
                  .join(', ') ?? c),
          )
          .filter((c) => c !== 'nil');
        const attrs = Object.entries(node.attrs ?? {})
          .map(([k, v]) => `${k} ${v}`)
          .join(', ');
        return [
          `node ${keys}`,
          kids.length > 0 ? `children ${list(kids)}` : '',
          attrs ? `(${attrs})` : '',
        ]
          .filter(Boolean)
          .join(' ');
      });
      const head =
        roots.length > 1
          ? `Forest of ${roots.length} trees, ${data.nodes.length} nodes in all`
          : `Tree of ${data.nodes.length} node${data.nodes.length === 1 ? '' : 's'}, rooted at ${
              byId
                .get(roots[0] ?? '')
                ?.keys.map((k) => fmt(k))
                .join(', ') ?? 'nothing'
            }`;
      return `${head}. ${capped(described)}.`;
    }

    case 'graph': {
      const edges = data.edges.map((e) => {
        const from = e.from.replace(/^v/, '');
        const to = e.to.replace(/^v/, '');
        const weight = e.weight === undefined ? '' : ` weight ${fmt(e.weight)}`;
        return `${from}${data.directed ? ' to ' : ' — '}${to}${weight}${e.ghost ? ' (dashed)' : ''}`;
      });
      const vertices = data.vertices.map((v) => {
        const attrs = Object.entries(v.attrs ?? {})
          .map(([k, val]) => `${k} ${fmt(val as number | string)}`)
          .join(', ');
        return attrs ? `${v.label} (${attrs})` : String(v.label);
      });
      return (
        `${data.directed ? 'Directed' : 'Undirected'} graph of ${data.vertices.length} vertices ` +
        `and ${data.edges.length} edges. Vertices: ${capped(vertices)}. Edges: ${capped(edges)}.`
      );
    }

    case 'grid': {
      const cols = Math.max(...data.rows.map((r) => (r.offset ?? 0) + r.cells.length), 0);
      const headings = data.colLabels
        ? ` Column headings: ${capped(data.colLabels.map((c) => fmt(c)))}.`
        : '';
      const rows = data.rows.map((row, i) => {
        const values = capped(
          row.cells.map((c) => `${fmt(c.value)}${c.note ? ` (${c.note})` : ''}`),
        );
        const offset = row.offset ? `, starting at column ${row.offset + 1}` : '';
        return `${row.label ?? i + 1}${offset}: ${values}`;
      });
      return (
        `Table of ${data.rows.length} rows and ${cols} columns.${headings} ` + `${rows.join('. ')}.`
      );
    }

    case 'plot': {
      const points = (data.points ?? []).map((p) => {
        const attrs = Object.entries(p.attrs ?? {})
          .map(([k, v]) => `${k} ${fmt(v as number | string)}`)
          .join(', ');
        return `${p.label ?? p.id}${p.anchor ? ' (placed)' : ''} at ${fmt(p.x)}, ${fmt(p.y)}${
          attrs ? ` (${attrs})` : ''
        }`;
      });
      const series = (data.series ?? []).map(
        (s) => `${s.label ?? s.id} through ${s.points.length} points`,
      );
      return (
        `Plot with x from ${fmt(data.xRange[0])} to ${fmt(data.xRange[1])} and y from ` +
        `${fmt(data.yRange[0])} to ${fmt(data.yRange[1])}.` +
        (points.length > 0 ? ` Points: ${capped(points)}.` : '') +
        (series.length > 0 ? ` Series: ${capped(series)}.` : '')
      );
    }
  }
}

/**
 * The whole text alternative for one step: what is on screen, then what the
 * step is pointing at.
 *
 * `legend` is the algorithm's own key, so a highlighted bar is "the key" or
 * "compared with the pivot" rather than "look" — the same words the sighted
 * reader is given, which is the point of naming the roles once in roles.ts.
 */
export interface DescribeContext {
  /** The algorithm's own key, so roles are named as the legend names them. */
  legend: Legend;
  /** The renderer's colour decision for this step. */
  roles?: Map<string | number, Role>;
  /** The module's declared aux rows, for their captions. */
  aux?: AuxRow[];
}

export function describeStep(step: Step | undefined, ctx: DescribeContext): string {
  if (!step) return 'Nothing to show yet.';
  const state = step.array
    ? describeArray(step.array) + describeSpans(step, step.array)
    : describeData(step.data!);
  const alongside = describeAux(step, ctx.aux ?? []);
  const marked = emphasis(step, ctx.legend, ctx.roles ?? new Map());
  return `${state}${alongside}${marked ? ` ${marked}.` : ''}`;
}
