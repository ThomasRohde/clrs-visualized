/**
 * The persistence boundary for a reader's personal study state.
 *
 * The browser implementation lives in indexed-db.ts, but the UI only knows
 * this interface. A future account-backed repository can therefore replace
 * IndexedDB without teaching the player or the study page about transport,
 * authentication or conflict resolution.
 */

export const STUDY_SCHEMA_VERSION = 1 as const;

export interface AlgorithmStudyRecord {
  schemaVersion: typeof STUDY_SCHEMA_VERSION;
  algorithmId: string;
  favorite: boolean;
  note: string;
  favoriteChangedAt: number | null;
  noteChangedAt: number | null;
}

export interface StudyRepository {
  get(algorithmId: string): Promise<AlgorithmStudyRecord | null>;
  list(): Promise<AlgorithmStudyRecord[]>;
  setFavorite(algorithmId: string, favorite: boolean): Promise<AlgorithmStudyRecord>;
  setNote(algorithmId: string, note: string): Promise<AlgorithmStudyRecord>;
}

export type StudyClock = () => number;

const validTime = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

/**
 * Validate data at the repository boundary rather than trusting what happens
 * to be in the object store. Unknown/future records are ignored, so one bad
 * row cannot make every other bookmark and note unreadable.
 */
export function normalizeStudyRecord(value: unknown): AlgorithmStudyRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== STUDY_SCHEMA_VERSION) return null;
  if (typeof record.algorithmId !== 'string' || record.algorithmId.trim().length === 0) return null;
  if (typeof record.favorite !== 'boolean' || typeof record.note !== 'string') return null;
  if (!validTime(record.favoriteChangedAt) || !validTime(record.noteChangedAt)) return null;

  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    algorithmId: record.algorithmId,
    favorite: record.favorite,
    note: record.note,
    favoriteChangedAt: record.favoriteChangedAt,
    noteChangedAt: record.noteChangedAt,
  };
}

export function emptyStudyRecord(algorithmId: string): AlgorithmStudyRecord {
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    algorithmId,
    favorite: false,
    note: '',
    favoriteChangedAt: null,
    noteChangedAt: null,
  };
}

export function withFavorite(
  current: AlgorithmStudyRecord | null,
  algorithmId: string,
  favorite: boolean,
  changedAt: number,
): AlgorithmStudyRecord {
  const base = current ?? emptyStudyRecord(algorithmId);
  return {
    ...base,
    algorithmId,
    favorite,
    favoriteChangedAt: changedAt,
  };
}

export function withNote(
  current: AlgorithmStudyRecord | null,
  algorithmId: string,
  note: string,
  changedAt: number,
): AlgorithmStudyRecord {
  const base = current ?? emptyStudyRecord(algorithmId);
  return {
    ...base,
    algorithmId,
    note,
    noteChangedAt: changedAt,
  };
}

const copy = (record: AlgorithmStudyRecord): AlgorithmStudyRecord => ({ ...record });

/** A deterministic repository for unit tests and non-browser consumers. */
export class MemoryStudyRepository implements StudyRepository {
  private readonly records = new Map<string, AlgorithmStudyRecord>();
  private readonly clock: StudyClock;

  constructor(initial: unknown[] = [], clock: StudyClock = Date.now) {
    this.clock = clock;
    for (const value of initial) {
      const record = normalizeStudyRecord(value);
      if (record) this.records.set(record.algorithmId, copy(record));
    }
  }

  async get(algorithmId: string): Promise<AlgorithmStudyRecord | null> {
    const record = this.records.get(algorithmId);
    return record ? copy(record) : null;
  }

  async list(): Promise<AlgorithmStudyRecord[]> {
    return [...this.records.values()].map(copy);
  }

  async setFavorite(algorithmId: string, favorite: boolean): Promise<AlgorithmStudyRecord> {
    const next = withFavorite(
      this.records.get(algorithmId) ?? null,
      algorithmId,
      favorite,
      this.clock(),
    );
    this.records.set(algorithmId, next);
    return copy(next);
  }

  async setNote(algorithmId: string, note: string): Promise<AlgorithmStudyRecord> {
    const next = withNote(this.records.get(algorithmId) ?? null, algorithmId, note, this.clock());
    this.records.set(algorithmId, next);
    return copy(next);
  }
}
