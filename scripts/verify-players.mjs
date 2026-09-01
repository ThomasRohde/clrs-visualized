/**
 * Steps every player on every written chapter, in both themes, drives the
 * search dialog by keyboard, and reports what the unit tests structurally
 * cannot see.
 *
 * `npm test` proves a recorder is correct and that its legend matches what the
 * renderer would paint, and it proves the search ranking against thirty golden
 * queries. It runs in Node with no DOM, so it cannot tell you that a player
 * never booted, that a canvas came out blank, that a variable marker sits over
 * the wrong bar, that the panel grows by 8px on the steps whose narration
 * wraps, or that the row the arrow keys highlight is not the row Enter
 * follows. Both definitions of done in docs/PROGRESS.md end with "step through
 * it in both themes"; this is that, automated as far as it goes.
 *
 *   npm run verify:players                  # assert only
 *   npm run verify:players -- --shots        # …and write one PNG per player
 *   npm run verify:players -- --only select  # one chapter or algorithm
 *   npm run verify:players -- --only search  # the dialog and /search, alone
 *   npm run verify:players -- --only study   # IndexedDB personalization alone
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

// theme × viewport width. The narrow entries are not padding: a narration line
// that fits at 1440 can wrap at 900, and only the wrapped width shifts layout.
// 375 is a phone, and is below the player's own 620px container breakpoint —
// the width at which a long legend entry stopped fitting and, because the
// workspace clips, simply vanished with nothing to scroll to.
const MATRIX = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 900 },
  { theme: 'dark', width: 375 },
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
/** `--only search` means the dialog and none of the players. */
const searchOnly = only === 'search';
/** `--only study` means persistence, the player margin and My Study alone. */
const studyOnly = only === 'study';
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

/**
 * The search dialog, driven the way a reader drives it.
 *
 * `npm test` proves the ranking: thirty golden queries against the real index,
 * in Node. What it cannot see is whether the dialog opens, whether the row the
 * arrow keys highlight is the row Enter follows, and whether a result is legible
 * at 375px — the width where the panel is tightest and where a clipped row
 * would have nothing to scroll to. It also cannot see the one thing this design
 * risks: the snippets arrive after the index, so every row is rewritten a
 * moment after it is first painted, and a row that changed height doing it
 * would move the list under the reader's cursor. That is why the heights are
 * compared rather than merely measured.
 */
async function verifySearch(page, theme, where, problems) {
  const at = `[${where}] search`;

  // The snippet payload is held back so the "does a row move when it lands"
  // question has a before and an after to compare. Racing it is not a test.
  await page.route('**/search-text.json', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

  if ((await page.locator('#site-search-btn').count()) !== 1) {
    problems.push(`${at}: no search button in the topbar`);
    return;
  }

  // 1. It opens on the shortcut, and the caret is already in the box.
  await page.keyboard.press('Control+k');
  try {
    await page.waitForSelector('#site-search[open]', { timeout: 5000 });
  } catch {
    problems.push(`${at}: Ctrl-K did not open the dialog`);
    return;
  }
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-el'));
  if (focused !== 'search-input')
    problems.push(`${at}: the dialog opened without focusing the box`);

  // 2. It answers from the index alone…
  await page.keyboard.type('quicksort');
  const rowHeights = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.search-row')].map((r) =>
        Math.round(r.getBoundingClientRect().height),
      ),
    );
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.search-row').length > 0,
      undefined,
      { timeout: 8000 },
    );
  } catch {
    problems.push(`${at}: "quicksort" produced no results within 8s`);
    return;
  }
  const before = await rowHeights();

  // …and upgrades in place when the snippets arrive, without moving.
  try {
    await page.waitForFunction(() => document.querySelector('.search-hit') !== null, undefined, {
      timeout: 8000,
    });
  } catch {
    problems.push(`${at}: the snippets never arrived, or nothing was highlighted`);
    return;
  }
  const after = await rowHeights();
  if (before.length !== after.length || before.some((h, i) => h !== after[i])) {
    problems.push(
      `${at}: rows changed height when the snippets landed (${before.join('/')} → ${after.join('/')})`,
    );
  }

  const report = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.search-row')];
    const clips = (el) => /hidden|clip/.test(getComputedStyle(el).overflowX);
    const cut = [];
    const READABLE =
      '.search-row-title, .search-kind, .search-row-where, .search-keys, .search-all';
    const panel = document.querySelector('.search-panel');
    for (const el of panel.querySelectorAll(READABLE)) {
      const text = el.textContent.trim();
      const box = el.getBoundingClientRect();
      // An element the layout has switched off is not cut off; it is absent,
      // and its zero-sized box is outside every ancestor by construction.
      if (!text || (box.width === 0 && box.height === 0)) continue;
      for (let a = el.parentElement; a && panel.contains(a); a = a.parentElement) {
        if (!clips(a)) continue;
        const outer = a.getBoundingClientRect();
        if (box.right > outer.right + 1 || box.left < outer.left - 1) {
          cut.push(`"${text.slice(0, 46)}" is cut off by .${a.className.split(' ')[0]}`);
        }
        break;
      }
      if (clips(el) && el.scrollWidth > el.clientWidth + 1) {
        cut.push(`"${text.slice(0, 46)}" is wider than its own box`);
      }
    }
    const input = document.querySelector('.search-input');
    return {
      count: rows.length,
      selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').length,
      firstSelected: rows[0]?.getAttribute('aria-selected') === 'true',
      active: input?.getAttribute('aria-activedescendant'),
      expanded: input?.getAttribute('aria-expanded'),
      cut,
    };
  });

  if (report.expanded !== 'true') {
    problems.push(`${at}: the combobox never reported itself expanded`);
  }
  if (report.selected !== 1) {
    problems.push(`${at}: ${report.selected} rows are aria-selected, want 1`);
  }
  if (!report.firstSelected) problems.push(`${at}: the first row is not the selected one`);
  for (const line of report.cut) problems.push(`${at}: ${line}`);

  // 3. The arrow keys move the selection, and they move the thing Enter opens.
  await page.keyboard.press('ArrowDown');
  const moved = await page.evaluate(() => ({
    active: document.querySelector('.search-input')?.getAttribute('aria-activedescendant'),
    href: document.querySelectorAll('.search-row')[1]?.getAttribute('href'),
  }));
  if (moved.active === report.active) problems.push(`${at}: ArrowDown did not move the selection`);

  // Waited for by URL: a click that navigates does so after the keypress
  // resolves, and an already-idle page satisfies waitForLoadState instantly.
  await page.keyboard.press('Enter');
  try {
    await page.waitForURL(/\/chapters\//, { timeout: 5000 });
  } catch {
    problems.push(`${at}: Enter stayed on ${page.url()} instead of opening ${moved.href}`);
  }

  // 4. `/` opens it too, and Escape gives the page back — including the focus.
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('/');
  try {
    await page.waitForSelector('#site-search[open]', { timeout: 5000 });
  } catch {
    problems.push(`${at}: "/" did not open the dialog`);
    return;
  }
  await page.keyboard.press('Escape');
  // Waited for as a property, not a selector: a closed <dialog> is display:none,
  // so `#site-search:not([open])` is a locator that can never become visible.
  try {
    await page.waitForFunction(() => !document.querySelector('#site-search')?.open, undefined, {
      timeout: 5000,
    });
  } catch {
    problems.push(`${at}: Escape did not close the dialog`);
    return;
  }
  // Waited for rather than read once. Closing a <dialog> clears `open`
  // synchronously and fires `close` in a queued task, so the handler that puts
  // focus back has not necessarily run at the moment `open` becomes false —
  // reading it immediately fails on roughly one run in three, at whichever
  // width happened to be quickest.
  try {
    await page.waitForFunction(() => document.activeElement?.id === 'site-search-btn', undefined, {
      timeout: 3000,
    });
  } catch {
    const returned = await page.evaluate(
      () => document.activeElement?.id || document.activeElement?.tagName,
    );
    problems.push(`${at}: Escape left focus on "${returned}", not the search button`);
  }

  // 5. The page the dialog hands off to: linkable, seeded from ?q=, and the
  //    same rows. This is the surface that survives a reload and a shared URL.
  await page.goto(`${base}/search/?q=heapsort`, { waitUntil: 'networkidle' });
  try {
    // Inside the page's own container, and actually laid out. Counting
    // `.search-row` anywhere passes while the page renders its results into
    // the closed dialog the layout also puts on it — which is exactly what it
    // did, invisibly, until a screenshot showed a result count above an empty
    // page. A closed <dialog> is display:none and `querySelectorAll` does not
    // care.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('#search-page-results .search-row')].some(
          (row) => row.getBoundingClientRect().height > 0,
        ),
      undefined,
      { timeout: 8000 },
    );
  } catch {
    problems.push(`${at}: /search/?q=heapsort rendered no visible results`);
    return;
  }
  const strays = await page.evaluate(
    () => document.querySelectorAll('#site-search .search-row').length,
  );
  if (strays > 0) {
    problems.push(`${at}: /search put ${strays} rows inside the dialog instead of the page`);
  }
  const pageReport = await page.evaluate(() => {
    const clips = (el) => /hidden|clip/.test(getComputedStyle(el).overflowX);
    const cut = [];
    for (const el of document.querySelectorAll('.search-row-title, .search-kind')) {
      const box = el.getBoundingClientRect();
      if (!el.textContent.trim() || (box.width === 0 && box.height === 0)) continue;
      if (clips(el) && el.scrollWidth > el.clientWidth + 1) {
        cut.push(`"${el.textContent.trim().slice(0, 46)}" is wider than its own box`);
      }
    }
    return {
      count: document.querySelectorAll('#search-page-results .search-row').length,
      // Scoped to the form: the dialog is on this page too, and its own box
      // carries the same data-el.
      seeded: document.querySelector('#search-page [data-el="search-input"]')?.value,
      counted: document.querySelector('[data-el="search-count"]')?.textContent?.trim(),
      // The no-JS index ships in the markup whether or not it is displayed.
      staticIndex: document.querySelectorAll('noscript').length,
      cut,
    };
  });
  if (pageReport.seeded !== 'heapsort') {
    problems.push(`${at}: /search did not seed its box from ?q= (got "${pageReport.seeded}")`);
  }
  if (!/heapsort/.test(pageReport.counted ?? '')) {
    problems.push(`${at}: /search does not say what it searched for ("${pageReport.counted}")`);
  }
  if (pageReport.staticIndex === 0) {
    problems.push(`${at}: /search ships no <noscript> index, so it is useless without JS`);
  }
  for (const line of pageReport.cut) problems.push(`${at} page: ${line}`);

  // …and typing keeps the address bar in step, so the search can be shared.
  await page.fill('#search-page [data-el="search-input"]', 'red-black');
  try {
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === 'red-black',
      undefined,
      {
        timeout: 5000,
      },
    );
  } catch {
    problems.push(`${at}: /search does not put the query in the URL (${page.url()})`);
  }
}

/**
 * Personal study state, through the real browser database.
 *
 * Unit tests pin the merge rules; this pass proves IndexedDB actually survives
 * navigation and reload, that exact note links open the editor, and that a
 * storage-denied browser loses only personalization rather than the player.
 */
async function verifyStudy(page, theme, where, problems) {
  const at = `[${where}] study`;
  const viewportWidth = page.viewportSize()?.width ?? 'unknown';
  const playerUrl = `${base}/chapters/getting-started/#algorithm-insertion-sort`;
  const player = '.viz[data-algorithm="insertion-sort"]';
  const noteText = `The prefix A[1..j-1] stays sorted — ${where}.`;

  const stampTheme = () =>
    page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
  const readyPlayer = async () => {
    await page.waitForFunction(
      (selector) => {
        const root = document.querySelector(selector);
        return (
          root?.dataset.ready === 'true' &&
          root.querySelector('[data-study-root]')?.dataset.studyState === 'ready'
        );
      },
      player,
      { timeout: 20000 },
    );
  };
  const clippedStudyText = () =>
    page.evaluate(() => {
      const clips = (el) => /hidden|clip/.test(getComputedStyle(el).overflowX);
      const cut = [];
      const readable =
        '.study-favorite, .study-note summary, .study-status, .study-availability, ' +
        '.study-saved-title, .wordmark .name, ' +
        '.study-saved-where, .study-note-excerpt, .study-open-note, .local-notice';
      for (const el of document.querySelectorAll(readable)) {
        const text = el.textContent.trim();
        if (!text) continue;
        const box = el.getBoundingClientRect();
        for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (!clips(ancestor)) continue;
          const outer = ancestor.getBoundingClientRect();
          if (box.right > outer.right + 1 || box.left < outer.left - 1) {
            cut.push(`"${text.slice(0, 46)}" is cut off by .${ancestor.className.split(' ')[0]}`);
          }
          break;
        }
        if (clips(el) && el.scrollWidth > el.clientWidth + 1) {
          cut.push(`"${text.slice(0, 46)}" is wider than its own box`);
        }
      }
      const topbar = document.querySelector('.topbar-inner')?.getBoundingClientRect();
      if (topbar && (topbar.left < -1 || topbar.right > innerWidth + 1)) {
        cut.push(`the top bar extends beyond the ${innerWidth}px viewport`);
      }
      const wordmark = document.querySelector('.wordmark')?.getBoundingClientRect();
      const actions = document.querySelector('.topbar-right')?.getBoundingClientRect();
      if (wordmark && actions && wordmark.right > actions.left - 1) {
        cut.push('the wordmark overlaps the header controls');
      }
      return [...new Set(cut)];
    });

  try {
    await page.goto(playerUrl, { waitUntil: 'networkidle' });
    await stampTheme();
    await readyPlayer();

    const favorite = page.locator(`${player} [data-study-el="favorite"]`);
    await favorite.click();
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true',
      `${player} [data-study-el="favorite"]`,
    );

    const details = page.locator(`${player} [data-study-el="note-details"]`);
    await details.locator('summary').click();
    const note = page.locator(`${player} [data-study-el="note-input"]`);
    await note.fill(noteText);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.trim() === 'Saved locally',
      `${player} [data-study-el="status"]`,
      { timeout: 10000 },
    );
    for (const problem of await clippedStudyText()) problems.push(`${at}: ${problem}`);
    if (shotsDir) {
      await page.locator(player).screenshot({
        path: join(shotsDir, `study-player-${theme}-${viewportWidth}.png`),
      });
    }

    // A fresh document, reading the same browser database.
    await page.reload({ waitUntil: 'networkidle' });
    await stampTheme();
    await readyPlayer();
    const persisted = await page.locator(player).evaluate((root) => ({
      favorite: root.querySelector('[data-study-el="favorite"]')?.getAttribute('aria-pressed'),
      note: root.querySelector('[data-study-el="note-input"]')?.value,
    }));
    if (persisted.favorite !== 'true') problems.push(`${at}: favorite did not survive reload`);
    if (persisted.note !== noteText) problems.push(`${at}: note did not survive reload`);

    await page.goto(`${base}/study/`, { waitUntil: 'networkidle' });
    await stampTheme();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-study-dashboard]')?.dataset.studyDashboardState === 'ready',
      undefined,
      { timeout: 10000 },
    );
    if ((await page.locator('[data-study-favorite-id="insertion-sort"]').count()) !== 1) {
      problems.push(`${at}: My Study does not list the favorite`);
    }
    if ((await page.locator('[data-study-note-id="insertion-sort"]').count()) !== 1) {
      problems.push(`${at}: My Study does not list the note`);
    }

    const favoriteHref = await page
      .locator('[data-study-favorite-id="insertion-sort"] .study-saved-title')
      .getAttribute('href');
    const noteHref = await page
      .locator('[data-study-note-id="insertion-sort"] .study-open-note')
      .getAttribute('href');
    if (!favoriteHref?.endsWith('/chapters/getting-started/#algorithm-insertion-sort')) {
      problems.push(`${at}: favorite link is not the exact player (${favoriteHref})`);
    }
    if (!noteHref?.endsWith('/chapters/getting-started/#study-note-insertion-sort')) {
      problems.push(`${at}: note link is not the exact editor (${noteHref})`);
    }
    for (const problem of await clippedStudyText()) problems.push(`${at}: ${problem}`);
    if (shotsDir) {
      await page.screenshot({
        path: join(shotsDir, `study-${theme}-${viewportWidth}.png`),
        fullPage: true,
      });
    }

    // Removing a bookmark must not erase the independently edited note.
    await page.locator('[data-study-favorite-id="insertion-sort"] .study-remove').click();
    await page.waitForFunction(
      () => document.querySelector('[data-study-favorite-id="insertion-sort"]') === null,
    );
    if ((await page.locator('[data-study-note-id="insertion-sort"]').count()) !== 1) {
      problems.push(`${at}: removing a favorite also removed its note`);
    }

    await page.goto(new URL(noteHref, page.url()).href, { waitUntil: 'networkidle' });
    await stampTheme();
    await readyPlayer();
    try {
      await page.waitForFunction(
        (selector) => {
          const input = document.querySelector(selector);
          return input?.closest('details')?.open && document.activeElement === input;
        },
        `${player} [data-study-el="note-input"]`,
        { timeout: 5000 },
      );
    } catch {
      problems.push(`${at}: the exact note link did not open and focus the editor`);
    }

    await page.locator(`${player} [data-study-el="note-input"]`).fill('');
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.trim() === 'Saved locally',
      `${player} [data-study-el="status"]`,
      { timeout: 10000 },
    );
    await page.goto(`${base}/study/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-study-dashboard]')?.dataset.studyDashboardState === 'ready',
    );
    if ((await page.locator('[data-study-note-id="insertion-sort"]').count()) !== 0) {
      problems.push(`${at}: a cleared note still appears in My Study`);
    }

    // Deny IndexedDB before the next document loads. The player still has to
    // boot, while only the study margin becomes unavailable.
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    });
    await page.goto(playerUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      (selector) => {
        const root = document.querySelector(selector);
        return (
          root?.dataset.ready === 'true' &&
          root.querySelector('[data-study-root]')?.dataset.studyState === 'unavailable'
        );
      },
      player,
      { timeout: 20000 },
    );
    await page.goto(`${base}/study/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-study-dashboard]')?.dataset.studyDashboardState ===
        'unavailable',
      undefined,
      { timeout: 10000 },
    );
  } catch (error) {
    problems.push(`${at}: ${error instanceof Error ? error.message : String(error)}`);
  }
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

    for (const { slug, ids: declared } of searchOnly || studyOnly ? [] : chapters()) {
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

          /**
           * Text that has been clipped out of existence.
           *
           * Not "overflows its parent" — plenty of things scroll, and the
           * pseudocode panel is meant to. The question is whether the nearest
           * ancestor that *clips* cuts the element off, because then there is
           * no scrollbar and no gesture that brings the rest of the sentence
           * back. The selectors are the text a reader has to be able to read:
           * the key, the input's assumption, the stats and the narration.
           */
          const clips = (el) => /hidden|clip/.test(getComputedStyle(el).overflowX);
          const cut = [];
          const READABLE =
            '.legend-item, .input-note, .stage-name, .stat, .step-count, .custom-err, .aux-hint, .note';
          for (const el of root.querySelectorAll(READABLE)) {
            const text = el.textContent.trim();
            if (!text) continue;
            const box = el.getBoundingClientRect();
            for (let a = el.parentElement; a && root.contains(a); a = a.parentElement) {
              if (!clips(a)) continue;
              const outer = a.getBoundingClientRect();
              if (box.right > outer.right + 1 || box.left < outer.left - 1) {
                cut.push(`"${text.slice(0, 46)}" is cut off by .${a.className.split(' ')[0]}`);
              }
              break;
            }
            // …and the same sentence clipped inside its own box, which is what
            // `white-space: nowrap` does to a legend entry too long for a phone.
            if (clips(el) && el.scrollWidth > el.clientWidth + 1) {
              cut.push(`"${text.slice(0, 46)}" is wider than its own box`);
            }
          }

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
            cut: [...new Set(cut)],
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
        for (const line of report.cut) problems.push(`${at}: ${line}`);
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

    if (!only || searchOnly) await verifySearch(page, theme, where(), problems);
    if (!only || studyOnly) await verifyStudy(page, theme, where(), problems);

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
