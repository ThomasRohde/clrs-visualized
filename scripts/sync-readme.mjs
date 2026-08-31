/**
 * Regenerate the README's contents section from the code that defines it.
 *
 * The README was retyped by hand at the end of each phase and was wrong within
 * a week every time — it claimed six chapters and one renderer while
 * thirty-nine chapters and six renderers were on disk. A README that has to be
 * remembered will be wrong; this one is derived.
 *
 * Everything between the two markers below is generated from `BOOK` (the
 * book's structure), the chapter MDX files that actually exist, and
 * `ALGORITHMS` (the registry). Prose outside the markers is written by hand
 * and is never touched.
 *
 *   npm run readme          rewrite the block
 *   npm run readme -- --check   fail if it is out of date (CI does this)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const README = join(ROOT, 'README.md');
const START = '<!-- generated:contents -->';
const END = '<!-- /generated:contents -->';

// Through pathToFileURL: a bare Windows path is not a URL the ESM loader will
// take, and this is the same reason scripts/verify-players.mjs does it.
// Node strips the types natively, so the registry imports unbuilt.
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const { BOOK } = await load('src/lib/book.ts');
const { ALGORITHMS } = await load('src/algorithms/registry.ts');

const written = (slug) => existsSync(join(ROOT, 'src/content/chapters', `${slug}.mdx`));

/** Which algorithms a chapter embeds, read from its own frontmatter. */
function algorithmsOf(slug) {
  const file = join(ROOT, 'src/content/chapters', `${slug}.mdx`);
  if (!existsSync(file)) return [];
  const m = /^algorithms:\s*(\[[^\]]*\]|\n(?:\s+- .*\n)+)/m.exec(readFileSync(file, 'utf8'));
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const byId = new Map(ALGORITHMS.map((a) => [a.id, a]));
const chapters = BOOK.flatMap((p) => p.chapters);
const done = chapters.filter((c) => written(c.slug));
const renderers = [...new Set(ALGORITHMS.map((a) => a.visualizer))];

const RENDERER_NOTE = {
  'array-bars': 'bar charts, for anything array-shaped',
  cells: 'rows of boxes with pointer arcs — lists, stacks, hash chains, string matching',
  tree: 'rooted trees and forests, with nodes sized to their keys',
  graph: 'graphs, with recorder-owned layouts fixed for the whole trace',
  grid: 'tables and matrices, with cell-to-cell dependency arrows',
  plot: 'continuous data — scatters, curves and series',
};

const lines = [];
lines.push(
  done.length === chapters.length
    ? `**All ${chapters.length} chapters and appendices**, covering **${ALGORITHMS.length} algorithms** ` +
        `across **${renderers.length} renderers**.`
    : `**${done.length} of ${chapters.length} chapters**, covering **${ALGORITHMS.length} algorithms** ` +
        `across **${renderers.length} renderers**. The rest of the book's outline is browsable as stubs.`,
  '',
);

for (const part of BOOK) {
  const rows = part.chapters.filter((c) => written(c.slug));
  if (rows.length === 0) continue;
  lines.push(`### Part ${part.numeral} — ${part.title}`, '');
  for (const c of rows) {
    const ids = algorithmsOf(c.slug);
    const names = ids.map((id) => byId.get(id)?.name ?? id);
    const label = c.number === 0 ? c.title : `${c.number}. ${c.title}`;
    lines.push(`- **${label}**${names.length ? ` — ${names.join(', ')}` : ' — prose'}`);
  }
  lines.push('');
}

lines.push('### Renderers', '');
for (const kind of ['array-bars', 'cells', 'tree', 'graph', 'grid', 'plot']) {
  if (!renderers.includes(kind)) continue;
  const n = ALGORITHMS.filter((a) => a.visualizer === kind).length;
  lines.push(`- \`${kind}\` — ${RENDERER_NOTE[kind]} (${n})`);
}

const generated = `${START}\n\n${lines.join('\n').trimEnd()}\n\n${END}`;

const current = readFileSync(README, 'utf8');
const from = current.indexOf(START);
const to = current.indexOf(END);
if (from === -1 || to === -1) {
  console.error(`README.md has no ${START} … ${END} block to fill.`);
  process.exit(2);
}
const next = current.slice(0, from) + generated + current.slice(to + END.length);

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('README.md is out of date. Run `npm run readme`.');
    process.exit(1);
  }
  console.log('README.md contents block is up to date.');
} else {
  writeFileSync(README, next);
  console.log(`README.md: ${done.length} chapters, ${ALGORITHMS.length} algorithms.`);
}
