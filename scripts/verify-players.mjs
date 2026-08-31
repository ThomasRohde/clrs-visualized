/**
 * Steps every player on every written chapter, in both themes, and reports what
 * the unit tests structurally cannot see.
 *
 * `npm test` proves a recorder is correct and that its legend matches what the
 * renderer would paint. It runs in Node with no DOM, so it cannot tell you that
 * a player never booted, that a canvas came out blank, that a variable marker
 * sits over the wrong bar, or that the panel grows by 8px on the steps whose
 * narration wraps. Both definitions of done in docs/PROGRESS.md end with "step
 * through it in both themes"; this is that, automated as far as it goes.
 *
 *   npm run verify:players                  # assert only
 *   npm run verify:players -- --shots        # …and write one PNG per player
 *   npm run verify:players -- --only select  # one chapter or algorithm
 *
 * Starts a dev server if nothing is already serving, and stops it again.
 * Exits non-zero if anything is wrong, so it can gate a release later.
 */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const CHAPTERS = join(ROOT, 'src/content/chapters');

// theme × viewport width. The narrow entry is not padding: a narration line
// that fits at 1440 can wrap at 900, and only the wrapped width shifts layout.
const MATRIX = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 900 },
];

/** Frames to read pixels back from, per player. Cheap checks run on every step. */
const PIXEL_SAMPLES = 24;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const only = value('only', null);
const shotsDir = flag('shots') ? resolve(value('shots', join(ROOT, '.player-shots'))) : null;
const shotAt = Number(value('at', '0.6'));
const port = Number(value('port', '4321'));
const base = value('base', `http://localhost:${port}`);

/**
 * Playwright is installed globally on this machine rather than as a
 * devDependency, so a bare specifier does not resolve. Try the normal way
 * first — if it ever becomes a devDependency, or this runs in CI, that is the
 * path that should win.
 */
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const entry = join(globalRoot, 'playwright', 'index.mjs');
    try {
      return (await import(pathToFileURL(entry).href)).chromium;
    } catch {
      throw new Error(
        `Playwright not found locally or at ${entry}. Install it with:\n` +
          `  npm i -D playwright && npx playwright install chromium`,
      );
    }
  }
}

async function serving(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start `astro dev`, if it is not already up.
 *
 * Spawned through astro's own entry rather than `npm run dev`: on Windows `npm`
 * is a .cmd shim, which means an extra process between us and the server and no
 * reliable way to kill the thing we actually started.
 */
async function ensureServer() {
  if (await serving(base)) return () => {};

  const child = spawn(
    process.execPath,
    [join(ROOT, 'node_modules/astro/bin/astro.mjs'), 'dev', '--port', String(port)],
    { cwd: ROOT, stdio: 'ignore' },
  );

  for (let i = 0; i < 60; i++) {
    if (await serving(base)) {
      return () => child.kill();
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`Dev server did not come up on ${base} within 30s.`);
}

/**
 * Chapters that exist as files, with the algorithm ids their frontmatter
 * declares. Underscore-prefixed files are templates.
 *
 * The ids are read off disk purely so `--only` knows which chapter to open.
 * What is actually on the page is read from the DOM, which is what the
 * coverage check at the end compares against the registry.
 */
function chapters() {
  return readdirSync(CHAPTERS)
    .filter((f) => f.endsWith('.mdx') && !f.startsWith('_'))
    .sort()
    .map((file) => {
      const src = readFileSync(join(CHAPTERS, file), 'utf8');
      const declared = /^algorithms:\s*\[(.*)\]\s*$/m.exec(src);
      return {
        slug: file.replace(/\.mdx$/, ''),
        ids: declared ? [...declared[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]) : [],
      };
    });
}

const problems = [];
const seenIds = new Set();
const chromium = await loadChromium();
const stopServer = await ensureServer();
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

try {
  for (const { theme, width } of MATRIX) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await ctx.newPage();
    const where = () => `${theme}@${width}`;

    page.on('console', (m) => {
      if (m.type() === 'error')
        problems.push(`[${where()}] console error on ${page.url()}: ${m.text()}`);
    });
    page.on('pageerror', (e) =>
      problems.push(`[${where()}] page error on ${page.url()}: ${e.message}`),
    );

    for (const { slug, ids: declared } of chapters()) {
      if (only && !slug.includes(only) && !declared.some((id) => id.includes(only))) continue;

      await page.goto(`${base}/chapters/${slug}`, { waitUntil: 'networkidle' });
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

      const ids = await page
        .locator('.viz')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-algorithm')));
      if (ids.length === 0) continue;

      try {
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.viz')].every(
              (v) => v.dataset.ready === 'true' || v.dataset.error === 'true',
            ),
          undefined,
          { timeout: 20000 },
        );
      } catch {
        problems.push(`[${where()}] ${slug}: not every player reached data-ready within 20s`);
        continue;
      }

      for (const id of ids) {
        if (only && !slug.includes(only) && !id.includes(only)) continue;
        seenIds.add(id);
        const viz = page.locator(`.viz[data-algorithm="${id}"]`);

        if ((await viz.getAttribute('data-error')) === 'true') {
          problems.push(`[${where()}] ${slug}/${id}: player failed to boot`);
          continue;
        }

        const report = await viz.evaluate(async (root, samples) => {
          const scrub = root.querySelector('[data-el="scrub"]');
          const canvas = root.querySelector('[data-el="canvas"]');
          const note = root.querySelector('[data-el="note"]');
          const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
          const last = Number(scrub.max);

          // Reading pixels back is the one expensive check, so it runs on a
          // sample. Height and narration are free and run on every step —
          // the layout shift this exists to catch appeared on 1 step in 40.
          const pixelAt = new Set([0, last]);
          for (let s = 0; s <= last; s += Math.max(1, Math.floor(last / samples))) pixelAt.add(s);

          const heights = new Map();
          let blank = 0;
          let emptyNotes = 0;
          let badHighlight = 0;

          for (let s = 0; s <= last; s++) {
            scrub.value = String(s);
            scrub.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise((r) => requestAnimationFrame(r));

            const h = Math.round(root.getBoundingClientRect().height);
            if (!heights.has(h)) heights.set(h, { step: s, note: note.textContent.trim() });
            if (!note.textContent.trim()) emptyNotes++;
            if (root.querySelectorAll('.code-line.active').length !== 1) badHighlight++;

            if (pixelAt.has(s)) {
              const px = ctx2d.getImageData(0, 0, canvas.width, canvas.height).data;
              let ink = 0;
              for (let p = 3; p < px.length; p += 4 * 97) if (px[p] > 0) ink++;
              if (ink === 0) blank++;
            }
          }

          return {
            steps: last,
            blank,
            emptyNotes,
            badHighlight,
            heights: [...heights.entries()].map(([h, at]) => ({ h, ...at })),
            legend: [...root.querySelectorAll('.legend-item')].map((li) => li.textContent.trim()),
            auxRows: [...root.querySelectorAll('.aux-buffer .aux-key')].map((k) => k.textContent),
          };
        }, PIXEL_SAMPLES);

        const at = `[${where()}] ${slug}/${id}`;
        if (report.steps < 2) problems.push(`${at}: only ${report.steps} steps`);
        if (report.blank > 0) problems.push(`${at}: ${report.blank} sampled frames drew nothing`);
        if (report.emptyNotes > 0)
          problems.push(`${at}: ${report.emptyNotes} steps have no narration`);
        if (report.badHighlight > 0) {
          problems.push(
            `${at}: ${report.badHighlight} steps do not highlight exactly one code line`,
          );
        }
        if (report.heights.length > 1) {
          const shifts = report.heights
            .map((v) => `${v.h}px from step ${v.step} ("${v.note.slice(0, 60)}…")`)
            .join(' → ');
          problems.push(`${at}: panel height changes while stepping: ${shifts}`);
        }

        if (theme === 'light' && width === 1440) {
          const aux = report.auxRows.length ? `, aux [${report.auxRows.join(', ')}]` : '';
          console.log(`${slug}/${id}: ${report.steps} steps${aux}`);
          console.log(`    key: ${report.legend.join(' · ')}`);
        }

        if (shotsDir) {
          await viz.evaluate((root, f) => {
            const scrub = root.querySelector('[data-el="scrub"]');
            scrub.value = String(Math.round(Number(scrub.max) * f));
            scrub.dispatchEvent(new Event('input', { bubbles: true }));
          }, shotAt);
          await page.waitForTimeout(120);
          await viz.screenshot({ path: join(shotsDir, `${id}-${theme}-${width}.png`) });
        }
      }
    }

    await ctx.close();
    await browser.close();
  }

  // A recorder that is registered but embedded in no chapter is invisible to
  // readers, and nothing else in the suite notices.
  if (!only) {
    const { ALGORITHM_IDS } = await import(
      pathToFileURL(join(ROOT, 'src/algorithms/registry.ts')).href
    );
    for (const id of ALGORITHM_IDS) {
      if (!seenIds.has(id)) problems.push(`${id}: registered but embedded in no chapter`);
    }
  }
} finally {
  stopServer();
}

console.log(`\n${'─'.repeat(60)}`);
if (shotsDir) console.log(`Screenshots: ${shotsDir}`);
if (problems.length === 0) {
  console.log('No problems found.');
} else {
  console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.log(`  • ${p}`);
  process.exitCode = 1;
}
