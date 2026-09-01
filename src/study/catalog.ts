import type { SearchDoc } from '../search/types.ts';

export interface StudyCatalogEntry {
  algorithmId: string;
  name: string;
  chapter: string;
  playerPath: string;
  notePath: string;
  order: number;
}

/**
 * Turn the published search corpus into the display catalog used by My Study.
 * Search already owns the inverse mapping from algorithm id to chapter, so a
 * second scanner here would be a second answer waiting to drift.
 */
export function buildStudyCatalog(docs: SearchDoc[]): StudyCatalogEntry[] {
  const seen = new Set<string>();
  const catalog: StudyCatalogEntry[] = [];

  for (const doc of docs) {
    if (doc.kind !== 'algorithm') continue;
    const algorithmId = doc.id.replace(/^algorithm:/, '');
    const anchor = `#algorithm-${algorithmId}`;
    if (!doc.path.endsWith(anchor)) {
      throw new Error(`${doc.id} does not point at its player: ${doc.path}`);
    }
    if (seen.has(algorithmId))
      throw new Error(`${doc.id} appears more than once in the study catalog.`);
    seen.add(algorithmId);
    catalog.push({
      algorithmId,
      name: doc.title,
      chapter: doc.chapter,
      playerPath: doc.path,
      notePath: doc.path.slice(0, -anchor.length) + `#study-note-${algorithmId}`,
      order: catalog.length,
    });
  }

  return catalog;
}
