import { IndexedDbStudyRepository } from './indexed-db.ts';
import type { StudyRepository } from './repository.ts';

let repository: StudyRepository | null = null;

/** One lazy repository per page, shared by every player on that page. */
export function browserStudyRepository(): StudyRepository {
  repository ??= new IndexedDbStudyRepository(globalThis.indexedDB);
  return repository;
}
