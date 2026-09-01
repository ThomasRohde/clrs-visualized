import { browserStudyRepository } from './browser.ts';
import type { AlgorithmStudyRecord, StudyRepository } from './repository.ts';

const SAVE_DELAY_MS = 400;

type RetryAction = () => Promise<void>;

interface StudyElements {
  root: HTMLElement;
  favorite: HTMLButtonElement;
  favoriteLabel: HTMLElement;
  details: HTMLDetailsElement;
  presence: HTMLElement;
  input: HTMLTextAreaElement;
  retry: HTMLButtonElement;
  status: HTMLElement;
  availability: HTMLElement;
}

const query = <T extends HTMLElement>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Study tools are missing element "${selector}".`);
  return found;
};

function elementsFor(root: HTMLElement): StudyElements {
  const studyRoot = query<HTMLElement>(root, '[data-study-root]');
  return {
    root: studyRoot,
    favorite: query<HTMLButtonElement>(studyRoot, '[data-study-el="favorite"]'),
    favoriteLabel: query(studyRoot, '[data-study-el="favorite-label"]'),
    details: query<HTMLDetailsElement>(studyRoot, '[data-study-el="note-details"]'),
    presence: query(studyRoot, '[data-study-el="note-presence"]'),
    input: query<HTMLTextAreaElement>(studyRoot, '[data-study-el="note-input"]'),
    retry: query<HTMLButtonElement>(studyRoot, '[data-study-el="retry"]'),
    status: query(studyRoot, '[data-study-el="status"]'),
    availability: query(studyRoot, '[data-study-el="availability"]'),
  };
}

class PlayerStudyTools {
  private readonly repository: StudyRepository;
  private readonly id: string;
  private readonly name: string;
  private readonly elements: StudyElements;
  private favorite = false;
  private favoriteBusy = false;
  private lastPersistedNote = '';
  private noteTimer: number | null = null;
  private saveSequence = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private retryAction: RetryAction | null = null;

  constructor(player: HTMLElement, repository: StudyRepository) {
    this.repository = repository;
    this.id = player.dataset.algorithm ?? '';
    if (!this.id) throw new Error('Study tools need a player algorithm id.');
    this.name = player.querySelector<HTMLElement>('.stage-name')?.textContent?.trim() || this.id;
    this.elements = elementsFor(player);
    this.wire();
  }

  async hydrate(): Promise<void> {
    this.setStatus('Loading…');
    this.elements.root.dataset.studyState = 'loading';
    this.elements.root.setAttribute('aria-busy', 'true');
    this.elements.favorite.disabled = true;
    this.elements.input.disabled = true;

    try {
      const record = await this.repository.get(this.id);
      this.apply(record);
      this.elements.root.dataset.studyState = 'ready';
      this.elements.root.setAttribute('aria-busy', 'false');
      this.elements.favorite.disabled = false;
      this.elements.input.disabled = false;
      this.elements.availability.hidden = true;
      this.clearRetry();
      this.setStatus(record ? 'Saved locally' : 'Ready');
      this.openDeepLink();
    } catch {
      this.elements.root.dataset.studyState = 'unavailable';
      this.elements.root.setAttribute('aria-busy', 'false');
      this.elements.favorite.disabled = true;
      this.elements.input.disabled = true;
      this.elements.availability.hidden = false;
      this.elements.availability.textContent = 'Saving is unavailable in this browser.';
      this.showRetry(() => this.hydrate());
      this.setStatus('Study tools unavailable in this browser.');
    }
  }

  private apply(record: AlgorithmStudyRecord | null): void {
    this.favorite = record?.favorite ?? false;
    this.paintFavorite();
    this.lastPersistedNote = record?.note ?? '';
    this.elements.input.value = this.lastPersistedNote;
    this.paintNotePresence();
  }

  private paintFavorite(): void {
    this.elements.favorite.setAttribute('aria-pressed', String(this.favorite));
    this.elements.favorite.setAttribute(
      'aria-label',
      this.favorite ? `Remove ${this.name} from My study` : `Save ${this.name} to My study`,
    );
    this.elements.favorite.title = this.favorite ? 'Remove from My study' : 'Save to My study';
    this.elements.favoriteLabel.textContent = this.favorite ? 'Favorited' : 'Favorite';
  }

  private paintNotePresence(): void {
    this.elements.presence.hidden = this.elements.input.value.trim().length === 0;
  }

  private wire(): void {
    this.elements.favorite.addEventListener('click', () => void this.toggleFavorite());
    this.elements.input.addEventListener('input', () => {
      this.paintNotePresence();
      this.scheduleNoteSave();
    });
    this.elements.input.addEventListener('blur', () => this.flushNote());
    this.elements.retry.addEventListener('click', () => void this.retry());
    window.addEventListener('hashchange', () => this.openDeepLink());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushNote();
    });
    window.addEventListener('pagehide', () => this.flushNote());
  }

  private async toggleFavorite(intended = !this.favorite): Promise<void> {
    if (this.favoriteBusy) return;
    const previous = this.favorite;
    this.favorite = intended;
    this.favoriteBusy = true;
    this.paintFavorite();
    this.elements.favorite.disabled = true;
    this.clearRetry();
    this.setStatus('Saving…');

    try {
      const record = await this.repository.setFavorite(this.id, intended);
      this.favorite = record.favorite;
      this.paintFavorite();
      this.setStatus('Saved locally');
    } catch {
      this.favorite = previous;
      this.paintFavorite();
      this.showRetry(() => this.toggleFavorite(intended));
      this.setStatus('Couldn’t save favorite.');
    } finally {
      this.favoriteBusy = false;
      this.elements.favorite.disabled = this.elements.root.dataset.studyState !== 'ready';
    }
  }

  private scheduleNoteSave(): void {
    if (this.noteTimer !== null) window.clearTimeout(this.noteTimer);
    this.setStatus('Saving…');
    this.clearRetry();
    this.noteTimer = window.setTimeout(() => this.flushNote(), SAVE_DELAY_MS);
  }

  private flushNote(force = false): void {
    if (this.noteTimer !== null) {
      window.clearTimeout(this.noteTimer);
      this.noteTimer = null;
    }
    const value = this.elements.input.value;
    if (!force && value === this.lastPersistedNote) {
      if (this.elements.root.dataset.studyState === 'ready') this.setStatus('Saved locally');
      return;
    }

    const sequence = ++this.saveSequence;
    this.setStatus('Saving…');
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        // A newer edit superseded this queued write before it began.
        if (sequence < this.saveSequence) return;
        try {
          const record = await this.repository.setNote(this.id, value);
          this.lastPersistedNote = record.note;
          if (sequence === this.saveSequence && this.elements.input.value === value) {
            this.clearRetry();
            this.setStatus('Saved locally');
          }
        } catch {
          if (sequence === this.saveSequence) {
            this.showRetry(async () => {
              this.flushNote(true);
              await this.writeChain;
            });
            this.setStatus('Couldn’t save note.');
          }
        }
      });
  }

  private openDeepLink(): void {
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (target !== this.elements.details.id) return;
    this.elements.details.open = true;
    requestAnimationFrame(() => this.elements.input.focus({ preventScroll: true }));
  }

  private showRetry(action: RetryAction): void {
    this.retryAction = action;
    this.elements.retry.hidden = false;
  }

  private clearRetry(): void {
    this.retryAction = null;
    this.elements.retry.hidden = true;
  }

  private async retry(): Promise<void> {
    const action = this.retryAction;
    if (!action) return;
    this.elements.retry.disabled = true;
    try {
      await action();
    } finally {
      this.elements.retry.disabled = false;
    }
  }

  private setStatus(message: string): void {
    this.elements.status.textContent = message;
  }
}

export function mountStudyPlayers(repository = browserStudyRepository()): void {
  document.querySelectorAll<HTMLElement>('.viz[data-algorithm]').forEach((player) => {
    if (player.dataset.studyMounted === 'true') return;
    player.dataset.studyMounted = 'true';
    const tools = new PlayerStudyTools(player, repository);
    void tools.hydrate();
  });
}
