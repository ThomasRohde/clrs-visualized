import {
  normalizeStudyRecord,
  withFavorite,
  withNote,
  type AlgorithmStudyRecord,
  type StudyClock,
  type StudyRepository,
} from './repository.ts';

const DATABASE = 'loop-invariant-study';
const DATABASE_VERSION = 1;
const ALGORITHMS = 'algorithms';

type Mutate = (current: AlgorithmStudyRecord | null) => AlgorithmStudyRecord;

const storageError = (message: string, cause?: unknown): Error => {
  const error = new Error(message);
  if (cause !== undefined) error.cause = cause;
  return error;
};

/** Native IndexedDB implementation of the study persistence boundary. */
export class IndexedDbStudyRepository implements StudyRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory | undefined;
  private readonly clock: StudyClock;

  constructor(
    factory: IDBFactory | undefined = globalThis.indexedDB,
    clock: StudyClock = Date.now,
  ) {
    this.factory = factory;
    this.clock = clock;
  }

  async get(algorithmId: string): Promise<AlgorithmStudyRecord | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ALGORITHMS, 'readonly');
      const request = transaction.objectStore(ALGORITHMS).get(algorithmId);
      request.onsuccess = () => resolve(normalizeStudyRecord(request.result));
      request.onerror = () => reject(storageError('Could not read study data.', request.error));
      transaction.onabort = () =>
        reject(storageError('Could not read study data.', transaction.error));
    });
  }

  async list(): Promise<AlgorithmStudyRecord[]> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ALGORITHMS, 'readonly');
      const request = transaction.objectStore(ALGORITHMS).getAll();
      request.onsuccess = () => {
        resolve(
          request.result
            .map((value) => normalizeStudyRecord(value))
            .filter((value): value is AlgorithmStudyRecord => value !== null),
        );
      };
      request.onerror = () => reject(storageError('Could not read study data.', request.error));
      transaction.onabort = () =>
        reject(storageError('Could not read study data.', transaction.error));
    });
  }

  setFavorite(algorithmId: string, favorite: boolean): Promise<AlgorithmStudyRecord> {
    return this.update(algorithmId, (current) =>
      withFavorite(current, algorithmId, favorite, this.clock()),
    );
  }

  setNote(algorithmId: string, note: string): Promise<AlgorithmStudyRecord> {
    return this.update(algorithmId, (current) =>
      withNote(current, algorithmId, note, this.clock()),
    );
  }

  private async update(algorithmId: string, mutate: Mutate): Promise<AlgorithmStudyRecord> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ALGORITHMS, 'readwrite');
      const store = transaction.objectStore(ALGORITHMS);
      const read = store.get(algorithmId);
      let next: AlgorithmStudyRecord | null = null;

      read.onsuccess = () => {
        next = mutate(normalizeStudyRecord(read.result));
        store.put(next);
      };
      read.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        if (next) resolve({ ...next });
        else reject(storageError('Could not update study data.'));
      };
      transaction.onerror = () =>
        reject(storageError('Could not update study data.', transaction.error ?? read.error));
      transaction.onabort = () =>
        reject(storageError('Could not update study data.', transaction.error ?? read.error));
    });
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    if (!this.factory) return Promise.reject(storageError('IndexedDB is not available.'));

    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(DATABASE, DATABASE_VERSION);

      request.onupgradeneeded = (event) => {
        const database = request.result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        if (oldVersion < 1) database.createObjectStore(ALGORITHMS, { keyPath: 'algorithmId' });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(storageError('Could not open study storage.', request.error));
      request.onblocked = () => reject(storageError('Study storage is open in another tab.'));
    });

    this.databasePromise = pending.catch((error) => {
      this.databasePromise = null;
      throw error;
    });
    return this.databasePromise;
  }
}
