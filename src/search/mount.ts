/**
 * The only file in `src/search/` that touches the DOM.
 *
 * Everything it calls — the analyzer, the ranking, the snippet chooser — is a
 * pure function tested in Node, which is the same division `player.ts` makes
 * against `keyboard-target.ts`, `tape.ts` and `describe.ts`. What is left here
 * is genuinely browser work: fetching, focus, and keys.
 *
 * **Both payloads are fetched, and only one is waited for.** The index alone
 * ranks, groups and renders a complete result list; the text turns each row's
 * second line into the sentence the reader's words actually appear in, and
 * lets a `"quoted phrase"` be confirmed rather than approximated. It lands a
 * moment later and the rows upgrade where they stand. Hovering or focusing the
 * button starts both, so by the first keystroke they are usually resident.
 *
 * **The list is a combobox, not a menu.** Focus never leaves the input —
 * arrowing moves `aria-activedescendant` — because a reader who has typed
 * three letters and pressed Down is still typing. The rows are real anchors so
 * that middle-click, ⌘-click and the browser's own status bar keep working,
 * with `role="option"` over the top for anything reading the page aloud.
 */
import { href } from '../lib/paths.ts';
import { rank } from './query.ts';
import { snippet } from './snippet.ts';
import type { SearchIndex, SearchResult, SearchText } from './types.ts';

/** Rows in the dialog. The page shows more. */
const DIALOG_LIMIT = 8;
const PAGE_LIMIT = 40;
/**
 * How long to wait before telling a screen reader the count.
 *
 * The results themselves are rendered on the keystroke — the index is in
 * memory and a query costs a couple of milliseconds — but a live region
 * announced per keystroke is unusable, which is the same conclusion
 * `player.ts` reached about the narration during playback.
 */
const ANNOUNCE_MS = 500;

let payloads: Promise<{ index: SearchIndex }> | null = null;
/** Filled in when the second fetch lands, which may be after the first render. */
let text: string[] | null = null;
/**
 * Everything to repaint once the snippets arrive.
 *
 * A set rather than one slot because `/search` carries the dialog as well —
 * the layout puts it on every page — so two lists are listening there, and a
 * single callback would leave whichever mounted first showing its fallback
 * line forever.
 */
const whenTextReady = new Set<() => void>();

/**
 * Fetch the index, and start the text behind it.
 *
 * Both URLs go through `href()`. CI's base-path job reads the hrefs in `dist/`
 * and cannot see a `fetch()`, so this is the only thing standing between a
 * subpath deploy and two 404s — `tests/search-index.test.ts` asserts it.
 */
function load(): Promise<{ index: SearchIndex }> {
  if (payloads) return payloads;

  // Started, and deliberately never awaited. A missing or slow snippet payload
  // costs snippets and quoted phrases and nothing else; ranking already has
  // everything it needs.
  void fetch(href('/search-text.json'))
    .then((response) => (response.ok ? (response.json() as Promise<SearchText>) : null))
    .then((payload) => {
      text = payload?.text ?? null;
      if (text) for (const repaint of whenTextReady) repaint();
    })
    .catch(() => {});

  payloads = fetch(href('/search-index.json'))
    .then((response) => {
      if (!response.ok) throw new Error(`search index: ${response.status}`);
      return response.json() as Promise<SearchIndex>;
    })
    .then((index) => ({ index }));

  return payloads;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** The snippet, with the matched words wrapped in `<mark>`. */
function highlight(into: HTMLElement, body: string, ranges: Array<[number, number]>): void {
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) into.append(body.slice(at, from));
    into.append(el('mark', 'search-hit', body.slice(from, to)));
    at = to;
  }
  if (at < body.length) into.append(body.slice(at));
}

function renderRow(index: SearchIndex, result: SearchResult, at: number, id: string): HTMLElement {
  const doc = index.docs[result.doc]!;

  const row = document.createElement('a');
  row.className = 'search-row';
  row.href = doc.u;
  row.id = `${id}-opt-${at}`;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');
  row.dataset.at = String(at);

  const head = el('span', 'search-row-head');
  head.append(el('span', `search-kind${doc.k === 'a' ? ' is-algorithm' : ''}`, doc.e));
  head.append(el('span', 'search-row-title', doc.t));
  // A section already says which chapter it is in; an algorithm's own title is
  // often the chapter's too, and repeating it reads as a mistake.
  if (doc.c !== doc.t) head.append(el('span', 'search-row-where', doc.c));
  row.append(head);

  const line = el('span', 'search-row-text');
  if (text) {
    const chosen = snippet(text[result.doc] ?? '', result.matched);
    highlight(line, chosen.text, chosen.ranges);
  } else {
    line.textContent = doc.m;
  }
  row.append(line);

  return row;
}

/**
 * One result list, wherever it is rendered.
 *
 * The dialog and the `/search` page differ in how many rows they show and in
 * what happens on Enter; everything else — ranking, the active row, the ARIA —
 * is the same object, because two copies of combobox key handling is two
 * chances for one of them to be wrong.
 */
class ResultList {
  private results: SearchResult[] = [];
  /** How many matched, which is not how many are rendered. */
  private total = 0;
  private active = -1;
  private index: SearchIndex | null = null;
  private announcing: ReturnType<typeof setTimeout> | null = null;
  private query = '';
  /** Whatever the markup put in the list before any search ran. */
  private readonly placeholder: Element[];

  constructor(
    private readonly id: string,
    private readonly input: HTMLInputElement,
    private readonly list: HTMLElement,
    private readonly status: HTMLElement,
    private readonly limit: number,
    private readonly onCount: (count: number, query: string) => void,
  ) {
    this.placeholder = [...list.children];
    this.input.addEventListener('input', () => this.run(this.input.value));
    this.input.addEventListener('keydown', (event) => this.onKey(event));
    this.list.addEventListener('mousemove', (event) => {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('.search-row');
      if (row?.dataset.at) this.select(Number(row.dataset.at), false);
    });
  }

  /** Re-render what is already on screen — used when the snippets land. */
  refresh(): void {
    if (this.query) this.run(this.query);
  }

  run(query: string): void {
    this.query = query;
    if (!query.trim()) {
      // Back to the suggestions the markup shipped with, rather than an empty
      // box that reads as a search which found nothing.
      this.results = [];
      this.total = 0;
      this.active = -1;
      this.list.replaceChildren(...this.placeholder);
      this.setExpanded(false);
      this.input.removeAttribute('aria-activedescendant');
      this.onCount(0, '');
      this.announce();
      return;
    }

    void load()
      .then(({ index }) => {
        this.index = index;
        // A slower keystroke may have overtaken this one.
        if (this.query !== query) return;
        // Ranked in full, shown in part: the footer has to say how many results
        // it is not showing, and the total is free here.
        const all = rank(index, query, { text: text ?? undefined });
        this.total = all.length;
        this.results = all.slice(0, this.limit);
        this.paint();
      })
      .catch(() => {
        this.results = [];
        this.list.replaceChildren(
          el('p', 'search-empty', 'Search is unavailable — try reloading the page.'),
        );
        this.setExpanded(false);
      });
  }

  private paint(): void {
    const index = this.index;
    if (!index) return;

    this.active = this.results.length > 0 ? 0 : -1;
    this.list.replaceChildren(
      ...this.results.map((result, at) => renderRow(index, result, at, this.id)),
    );

    if (this.query.trim() && this.results.length === 0) {
      this.list.replaceChildren(el('p', 'search-empty', `Nothing matches “${this.query.trim()}”.`));
    }

    this.setExpanded(this.results.length > 0);
    this.paintActive();
    this.onCount(this.total, this.query.trim());
    this.announce();
  }

  private setExpanded(open: boolean): void {
    this.input.setAttribute('aria-expanded', String(open));
  }

  private announce(): void {
    if (this.announcing) clearTimeout(this.announcing);
    this.announcing = setTimeout(() => {
      const query = this.query.trim();
      if (!query) {
        this.status.textContent = '';
        return;
      }
      const n = this.total;
      this.status.textContent =
        n === 0 ? `No results for ${query}.` : `${n} result${n === 1 ? '' : 's'} for ${query}.`;
    }, ANNOUNCE_MS);
  }

  private rows(): HTMLElement[] {
    return [...this.list.querySelectorAll<HTMLElement>('.search-row')];
  }

  private paintActive(): void {
    const rows = this.rows();
    rows.forEach((row, at) => {
      const on = at === this.active;
      row.setAttribute('aria-selected', String(on));
      row.classList.toggle('is-active', on);
    });
    const current = rows[this.active];
    if (current) {
      this.input.setAttribute('aria-activedescendant', current.id);
      current.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  private select(at: number, scroll = true): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    this.active = ((at % rows.length) + rows.length) % rows.length;
    if (scroll) this.paintActive();
    else {
      rows.forEach((row, i) => {
        row.setAttribute('aria-selected', String(i === this.active));
        row.classList.toggle('is-active', i === this.active);
      });
      this.input.setAttribute('aria-activedescendant', rows[this.active]!.id);
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.select(this.active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.select(this.active - 1);
    } else if (event.key === 'Home' && this.rows().length > 0) {
      event.preventDefault();
      this.select(0);
    } else if (event.key === 'End' && this.rows().length > 0) {
      event.preventDefault();
      this.select(this.rows().length - 1);
    } else if (event.key === 'Enter') {
      const row = this.rows()[this.active];
      if (row) {
        event.preventDefault();
        row.click();
      }
    }
  }
}

/** Ctrl/⌘-K anywhere, and `/` when the reader is not already typing. */
function isOpenShortcut(event: KeyboardEvent): boolean {
  if (event.key === 'k' && (event.metaKey || event.ctrlKey)) return true;
  if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return false;
  // The same guard `player.ts` uses, for the same reason: a reader typing an
  // array into a player's input box is not asking for the search dialog.
  const focused = document.activeElement;
  const tag = focused?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return false;
  return !(focused instanceof HTMLElement && focused.isContentEditable);
}

export function mountSearchDialog(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#site-search');
  const trigger = document.querySelector<HTMLButtonElement>('#site-search-btn');
  if (!dialog || !trigger) return;

  const input = dialog.querySelector<HTMLInputElement>('[data-el="search-input"]')!;
  const list = dialog.querySelector<HTMLElement>('[data-el="search-results"]')!;
  const status = dialog.querySelector<HTMLElement>('[data-el="search-status"]')!;
  const all = dialog.querySelector<HTMLAnchorElement>('[data-el="search-all"]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-el="search-close"]')!;
  const key = dialog.ownerDocument.querySelector<HTMLElement>('[data-el="search-key"]');

  // The chip on the button has to name the key this machine actually uses, or
  // it is worse than no chip at all.
  if (key && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) {
    key.textContent = '⌘K';
  }

  const results = new ResultList('search', input, list, status, DIALOG_LIMIT, (count, query) => {
    // Named with the number, because "see all results" beside eight rows does
    // not tell a reader whether there are nine of them or ninety.
    all.hidden = !query || count <= DIALOG_LIMIT;
    all.textContent = `See all ${count} results →`;
    all.href = `${href('/search/')}?q=${encodeURIComponent(query)}`;
  });

  whenTextReady.add(() => results.refresh());

  // Warm both payloads before they are needed. By the time a reader has moved
  // the pointer to the button and clicked it, the fetch is usually done.
  for (const event of ['pointerenter', 'focus'] as const) {
    trigger.addEventListener(event, () => void load().catch(() => {}), { once: true });
  }

  const open = (): void => {
    if (dialog.open) return;
    void load().catch(() => {});
    dialog.showModal();
    input.select();
  };

  trigger.addEventListener('click', open);
  close.addEventListener('click', () => dialog.close());
  document.addEventListener('keydown', (event) => {
    if (!isOpenShortcut(event) || dialog.open) return;
    event.preventDefault();
    open();
  });

  // Clicking the backdrop — the dialog element itself is everything outside
  // the panel — closes, which is what every reader expects of a modal.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  // `showModal()` returns focus on its own in current browsers; doing it here
  // as well costs nothing and covers the ones that do not.
  dialog.addEventListener('close', () => trigger.focus());
}

export function mountSearchPage(): void {
  const form = document.querySelector<HTMLFormElement>('#search-page');
  if (!form) return;

  const input = form.querySelector<HTMLInputElement>('[data-el="search-input"]')!;
  const list = document.querySelector<HTMLElement>('[data-el="search-results"]')!;
  const status = document.querySelector<HTMLElement>('[data-el="search-status"]')!;
  const count = document.querySelector<HTMLElement>('[data-el="search-count"]')!;

  const results = new ResultList('search-page', input, list, status, PAGE_LIMIT, (n, query) => {
    count.textContent = query ? `${n} result${n === 1 ? '' : 's'} for “${query}”` : '';
    // Keep the address bar in step, so the search can be linked or reloaded.
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  });

  whenTextReady.add(() => results.refresh());
  form.addEventListener('submit', (event) => event.preventDefault());

  const initial = new URL(window.location.href).searchParams.get('q') ?? '';
  if (initial) {
    input.value = initial;
    results.run(initial);
  }
  input.focus();
}
