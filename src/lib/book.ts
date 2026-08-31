/**
 * The structure of Introduction to Algorithms, 4th edition.
 *
 * This is the spine of the site: navigation, the index page and the progress
 * tracker are all generated from it. A chapter becomes a real page as soon as
 * a matching MDX file exists in src/content/chapters/ — until then it renders
 * as a stub so the whole book is browsable from day one.
 */

export interface ChapterOutline {
  /** Chapter number as printed in the book. */
  number: number;
  title: string;
  /** URL slug; must match the MDX filename in src/content/chapters/. */
  slug: string;
}

export interface PartOutline {
  /** Roman numeral as printed in the book. */
  numeral: string;
  title: string;
  chapters: ChapterOutline[];
}

const ch = (number: number, title: string, slug: string): ChapterOutline => ({
  number,
  title,
  slug,
});

export const BOOK: PartOutline[] = [
  {
    numeral: 'I',
    title: 'Foundations',
    chapters: [
      ch(1, 'The Role of Algorithms in Computing', 'role-of-algorithms'),
      ch(2, 'Getting Started', 'getting-started'),
      ch(3, 'Characterizing Running Times', 'characterizing-running-times'),
      ch(4, 'Divide-and-Conquer', 'divide-and-conquer'),
      ch(5, 'Probabilistic Analysis and Randomized Algorithms', 'probabilistic-analysis'),
    ],
  },
  {
    numeral: 'II',
    title: 'Sorting and Order Statistics',
    chapters: [
      ch(6, 'Heapsort', 'heapsort'),
      ch(7, 'Quicksort', 'quicksort'),
      ch(8, 'Sorting in Linear Time', 'sorting-in-linear-time'),
      ch(9, 'Medians and Order Statistics', 'medians-and-order-statistics'),
    ],
  },
  {
    numeral: 'III',
    title: 'Data Structures',
    chapters: [
      ch(10, 'Elementary Data Structures', 'elementary-data-structures'),
      ch(11, 'Hash Tables', 'hash-tables'),
      ch(12, 'Binary Search Trees', 'binary-search-trees'),
      ch(13, 'Red-Black Trees', 'red-black-trees'),
    ],
  },
  {
    numeral: 'IV',
    title: 'Advanced Design and Analysis Techniques',
    chapters: [
      ch(14, 'Dynamic Programming', 'dynamic-programming'),
      ch(15, 'Greedy Algorithms', 'greedy-algorithms'),
      ch(16, 'Amortized Analysis', 'amortized-analysis'),
    ],
  },
  {
    numeral: 'V',
    title: 'Advanced Data Structures',
    chapters: [
      ch(17, 'Augmenting Data Structures', 'augmenting-data-structures'),
      ch(18, 'B-Trees', 'b-trees'),
      ch(19, 'Data Structures for Disjoint Sets', 'disjoint-sets'),
    ],
  },
  {
    numeral: 'VI',
    title: 'Graph Algorithms',
    chapters: [
      ch(20, 'Elementary Graph Algorithms', 'elementary-graph-algorithms'),
      ch(21, 'Minimum Spanning Trees', 'minimum-spanning-trees'),
      ch(22, 'Single-Source Shortest Paths', 'single-source-shortest-paths'),
      ch(23, 'All-Pairs Shortest Paths', 'all-pairs-shortest-paths'),
      ch(24, 'Maximum Flow', 'maximum-flow'),
      ch(25, 'Matchings in Bipartite Graphs', 'bipartite-matching'),
    ],
  },
  {
    numeral: 'VII',
    title: 'Selected Topics',
    chapters: [
      ch(26, 'Parallel Algorithms', 'parallel-algorithms'),
      ch(27, 'Online Algorithms', 'online-algorithms'),
      ch(28, 'Matrix Operations', 'matrix-operations'),
      ch(29, 'Linear Programming', 'linear-programming'),
      ch(30, 'Polynomials and the FFT', 'polynomials-and-the-fft'),
      ch(31, 'Number-Theoretic Algorithms', 'number-theoretic-algorithms'),
      ch(32, 'String Matching', 'string-matching'),
      ch(33, 'Machine-Learning Algorithms', 'machine-learning-algorithms'),
      ch(34, 'NP-Completeness', 'np-completeness'),
      ch(35, 'Approximation Algorithms', 'approximation-algorithms'),
    ],
  },
  {
    numeral: 'VIII',
    title: 'Appendix: Mathematical Background',
    chapters: [
      ch(0, 'A — Summations', 'appendix-summations'),
      ch(0, 'B — Sets, Etc.', 'appendix-sets'),
      ch(0, 'C — Counting and Probability', 'appendix-counting-and-probability'),
      ch(0, 'D — Matrices', 'appendix-matrices'),
    ],
  },
];

/** Flat list of every chapter, in book order. */
export const ALL_CHAPTERS: Array<ChapterOutline & { part: PartOutline }> = BOOK.flatMap((part) =>
  part.chapters.map((c) => ({ ...c, part })),
);

/**
 * The numbered chapters, 1–35.
 *
 * An appendix carries `number: 0`, which is the whole of the distinction — so
 * these two lists are derived here rather than filtered at each call site. The
 * flat count is 39, and "39 chapters" was written on the index page, in the
 * generated README and in the tracker before anyone noticed that four of them
 * are appendices.
 */
export const CHAPTERS: ChapterOutline[] = ALL_CHAPTERS.filter((c) => c.number > 0);

/** Appendices A–D. Numbered 0, because the book does not number them. */
export const APPENDICES: ChapterOutline[] = ALL_CHAPTERS.filter((c) => c.number === 0);

export function findChapter(slug: string) {
  return ALL_CHAPTERS.find((c) => c.slug === slug);
}

/** "§6" or "Appendix" — the label shown above a chapter title. */
export function chapterLabel(c: ChapterOutline): string {
  return c.number > 0 ? `Chapter ${c.number}` : 'Appendix';
}
