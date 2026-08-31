/**
 * Assert that a subpath build actually carries its prefix everywhere.
 *
 * `src/lib/paths.ts` exists so that deploying under a subpath — a GitHub Pages
 * project site, say — is a one-line change. That is a claim about every
 * internal link on the site, and it is the kind of claim that stays true right
 * up until someone writes one plain `/chapters/…` and nobody notices, because
 * a hardcoded root-relative link resolves perfectly well on a root deploy and
 * only breaks on the deploy nobody runs locally.
 *
 * So: build with BASE_PATH set, then run this. It reads every href and src in
 * dist/, ignores anything absolute or in-page, and requires the rest to start
 * with the prefix.
 *
 *   BASE_PATH=/probe npm run build
 *   node scripts/check-base-path.mjs /probe
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const prefix = process.argv[2];
if (!prefix || !prefix.startsWith('/')) {
  console.error('usage: node scripts/check-base-path.mjs /some-base-path');
  process.exit(2);
}

const DIST = resolve(import.meta.dirname, '..', 'dist');

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* htmlFiles(full);
    else if (entry.endsWith('.html')) yield full;
  }
}

/** Links that are not this site's business: absolute, in-page, or a data URI. */
const external = /^(https?:|mailto:|data:|#|\/\/)/;

let checked = 0;
const bad = new Map();

for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const [, , url] of html.matchAll(/\b(href|src)="([^"]*)"/g)) {
    if (url === '' || external.test(url)) continue;
    // Relative links are fine — they are already base-independent.
    if (!url.startsWith('/')) continue;
    checked++;
    if (!url.startsWith(`${prefix}/`) && url !== prefix) {
      const where = file.slice(DIST.length + 1).replaceAll('\\', '/');
      bad.set(url, [...(bad.get(url) ?? []), where]);
    }
  }
}

if (bad.size > 0) {
  console.error(`${bad.size} root-relative link(s) missing the base path "${prefix}":\n`);
  for (const [url, files] of [...bad].slice(0, 20)) {
    console.error(`  ${url}`);
    console.error(`      in ${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''}`);
  }
  console.error(
    `\nInternal links must go through href() / chapterHref() in src/lib/paths.ts,\n` +
      `which prefixes import.meta.env.BASE_URL. A hardcoded "/chapters/…" works on a\n` +
      `root deploy and 404s on a subpath one.`,
  );
  process.exit(1);
}

console.log(`${checked} internal link(s) checked; every one carries "${prefix}".`);
