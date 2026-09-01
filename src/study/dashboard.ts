import { browserStudyRepository } from './browser.ts';
import type { StudyCatalogEntry } from './catalog.ts';
import type { AlgorithmStudyRecord, StudyRepository } from './repository.ts';

const query = <T extends HTMLElement>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`My Study is missing element "${selector}".`);
  return found;
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const bookmark = (): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 14 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2.25 1.25h9.5v13L7 11.2l-4.75 3.05z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
};

const dateLabel = (timestamp: number | null): string => {
  if (timestamp === null) return 'Saved note';
  return `Edited ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(timestamp)}`;
};

class StudyDashboard {
  private readonly root: HTMLElement;
  private readonly catalog: StudyCatalogEntry[];
  private readonly repository: StudyRepository;
  private readonly loading: HTMLElement;
  private readonly error: HTMLElement;
  private readonly errorText: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private readonly content: HTMLElement;
  private readonly favorites: HTMLUListElement;
  private readonly notes: HTMLUListElement;
  private readonly favoritesEmpty: HTMLElement;
  private readonly notesEmpty: HTMLElement;
  private readonly favoritesCount: HTMLElement;
  private readonly notesCount: HTMLElement;
  private readonly status: HTMLElement;
  private readonly records = new Map<string, AlgorithmStudyRecord>();

  constructor(root: HTMLElement, catalog: StudyCatalogEntry[], repository: StudyRepository) {
    this.root = root;
    this.catalog = catalog;
    this.repository = repository;
    this.loading = query(root, '[data-study-dashboard-loading]');
    this.error = query(root, '[data-study-dashboard-error]');
    this.errorText = query(root, '[data-study-dashboard-error-text]');
    this.retry = query<HTMLButtonElement>(root, '[data-study-dashboard-retry]');
    this.content = query(root, '[data-study-dashboard-content]');
    this.favorites = query<HTMLUListElement>(root, '[data-study-favorites]');
    this.notes = query<HTMLUListElement>(root, '[data-study-notes]');
    this.favoritesEmpty = query(root, '[data-study-favorites-empty]');
    this.notesEmpty = query(root, '[data-study-notes-empty]');
    this.favoritesCount = query(root, '[data-study-favorites-count]');
    this.notesCount = query(root, '[data-study-notes-count]');
    this.status = query(root, '[data-study-dashboard-status]');
    this.retry.addEventListener('click', () => void this.hydrate());
  }

  async hydrate(): Promise<void> {
    this.root.dataset.studyDashboardState = 'loading';
    this.root.setAttribute('aria-busy', 'true');
    this.loading.hidden = false;
    this.error.hidden = true;
    this.content.hidden = true;
    this.retry.disabled = true;

    try {
      const records = await this.repository.list();
      this.records.clear();
      for (const record of records) this.records.set(record.algorithmId, record);
      this.render();
      this.root.dataset.studyDashboardState = 'ready';
      this.root.setAttribute('aria-busy', 'false');
      this.loading.hidden = true;
      this.content.hidden = false;
      this.status.textContent = 'My Study loaded.';
    } catch {
      this.root.dataset.studyDashboardState = 'unavailable';
      this.root.setAttribute('aria-busy', 'false');
      this.loading.hidden = true;
      this.error.hidden = false;
      this.content.hidden = true;
      this.errorText.textContent =
        'My Study couldn’t open browser storage. Check this site’s storage permissions, then try again.';
      this.status.textContent = 'My Study is unavailable.';
    } finally {
      this.retry.disabled = false;
    }
  }

  private render(): void {
    const favorites = this.catalog.filter((entry) => this.records.get(entry.algorithmId)?.favorite);
    const notes = this.catalog
      .filter((entry) => (this.records.get(entry.algorithmId)?.note.trim().length ?? 0) > 0)
      .sort((a, b) => {
        const aTime = this.records.get(a.algorithmId)?.noteChangedAt ?? 0;
        const bTime = this.records.get(b.algorithmId)?.noteChangedAt ?? 0;
        return bTime - aTime || a.order - b.order;
      });

    this.favorites.replaceChildren(...favorites.map((entry) => this.favoriteRow(entry)));
    this.notes.replaceChildren(...notes.map((entry) => this.noteRow(entry)));
    this.favoritesEmpty.hidden = favorites.length > 0;
    this.notesEmpty.hidden = notes.length > 0;
    this.favoritesCount.textContent = String(favorites.length);
    this.notesCount.textContent = String(notes.length);
  }

  private favoriteRow(entry: StudyCatalogEntry): HTMLLIElement {
    const row = element('li', 'study-saved-row study-favorite-row');
    row.dataset.studyFavoriteId = entry.algorithmId;

    const copy = element('div', 'study-saved-copy');
    const link = element('a', 'study-saved-title');
    link.href = entry.playerPath;
    link.textContent = entry.name;
    const where = element('span', 'study-saved-where mono');
    where.textContent = entry.chapter;
    copy.append(link, where);

    const remove = element('button', 'study-remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${entry.name} from favorites`);
    remove.title = 'Remove from favorites';
    remove.append(bookmark(), document.createTextNode('Remove'));
    remove.addEventListener('click', () => void this.removeFavorite(entry, remove));
    row.append(copy, remove);
    return row;
  }

  private noteRow(entry: StudyCatalogEntry): HTMLLIElement {
    const record = this.records.get(entry.algorithmId)!;
    const row = element('li', 'study-saved-row study-note-row');
    row.dataset.studyNoteId = entry.algorithmId;

    const head = element('div', 'study-note-row-head');
    const copy = element('div', 'study-saved-copy');
    const link = element('a', 'study-saved-title');
    link.href = entry.notePath;
    link.textContent = entry.name;
    const where = element('span', 'study-saved-where mono');
    where.textContent = `${entry.chapter} · ${dateLabel(record.noteChangedAt)}`;
    copy.append(link, where);
    const open = element('a', 'study-open-note mono');
    open.href = entry.notePath;
    open.textContent = 'Open note →';
    head.append(copy, open);

    const excerpt = element('p', 'study-note-excerpt');
    excerpt.textContent = record.note;
    row.append(head, excerpt);
    return row;
  }

  private async removeFavorite(entry: StudyCatalogEntry, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    this.status.textContent = `Removing ${entry.name} from favorites…`;
    try {
      const record = await this.repository.setFavorite(entry.algorithmId, false);
      this.records.set(entry.algorithmId, record);
      this.render();
      this.status.textContent = `${entry.name} removed from favorites.`;
    } catch {
      button.disabled = false;
      this.status.textContent = `Couldn’t remove ${entry.name}. Try again.`;
    }
  }
}

function readCatalog(): StudyCatalogEntry[] {
  const payload = document.querySelector<HTMLScriptElement>('#study-catalog');
  if (!payload?.textContent) throw new Error('My Study has no algorithm catalog.');
  return JSON.parse(payload.textContent) as StudyCatalogEntry[];
}

export function mountStudyDashboard(repository = browserStudyRepository()): void {
  const root = document.querySelector<HTMLElement>('[data-study-dashboard]');
  if (!root || root.dataset.studyMounted === 'true') return;
  root.dataset.studyMounted = 'true';
  const dashboard = new StudyDashboard(root, readCatalog(), repository);
  void dashboard.hydrate();
}
