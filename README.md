# Loop Invariant

An interactive, animated companion to _Introduction to Algorithms_ (Cormen, Leiserson, Rivest &
Stein, 4th edition). Every algorithm here plays back step by step against the pseudocode it comes
from, with the executing line highlighted in lockstep with the data.

"Every algorithm here" is the book's **headline algorithms** — its named procedures — and not the
exercises, starred sections and end-of-chapter problems around them. Those are catalogued in the
Tier-2 backlog in [docs/PROGRESS.md](docs/PROGRESS.md). The counts below are generated from the
registry, so they cannot drift from what is actually built.

Built with [Astro](https://astro.build). Static output, no client framework — the interactive parts
are plain TypeScript and Canvas.

## Quick start

```bash
npm install
npm run dev      # http://localhost:4321
```

| Command                  | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Dev server with hot reload                          |
| `npm run build`          | Static build into `dist/`                           |
| `npm run preview`        | Serve the built site locally                        |
| `npm test`               | Generative correctness tests for every algorithm    |
| `npm run check`          | Astro + TypeScript diagnostics                      |
| `npm run lint`           | ESLint over `.ts` and `.astro`                      |
| `npm run format`         | Prettier, including `.astro` and `.mdx`             |
| `npm run verify:players` | Step every player in a real browser, in both themes |
| `npm run readme`         | Regenerate the contents block below from the code   |

## What's here

<!-- generated:contents -->

**All 35 chapters and 4 appendices**, covering **83 algorithms** across **6 renderers** — the book’s headline algorithms rather than every exercise and variant.

### Part I — Foundations

- **1. The Role of Algorithms in Computing** — prose
- **2. Getting Started** — Insertion Sort, Merge Sort, Binary Search, Counting Inversions
- **3. Characterizing Running Times** — Asymptotic Bounds
- **4. Divide-and-Conquer** — Matrix Multiplication, Strassen's Algorithm, Maximum Subarray
- **5. Probabilistic Analysis and Randomized Algorithms** — Hire Assistant, Permute by Sorting, Randomize in Place

### Part II — Sorting and Order Statistics

- **6. Heapsort** — Heapsort, Max-Priority Queue
- **7. Quicksort** — Quicksort, Randomized Quicksort, Hoare's Partition
- **8. Sorting in Linear Time** — Counting Sort, Radix Sort, Bucket Sort
- **9. Medians and Order Statistics** — Minimum and Maximum, Randomized Select, Select (Median of Medians)

### Part III — Data Structures

- **10. Elementary Data Structures** — Stack (PUSH and POP), Doubly Linked List (SEARCH, PREPEND, DELETE)
- **11. Hash Tables** — Hash Table with Chaining, Open Addressing (Linear Probing)
- **12. Binary Search Trees** — Binary Search Tree
- **13. Red-Black Trees** — Red-Black Tree (RB-INSERT)

### Part IV — Advanced Design and Analysis Techniques

- **14. Dynamic Programming** — Rod Cutting, Matrix-Chain Order, Longest Common Subsequence, Optimal Binary Search Tree
- **15. Greedy Algorithms** — Activity Selection, Huffman Codes, Offline Caching
- **16. Amortized Analysis** — Stack with MULTIPOP, Binary Counter (INCREMENT), Dynamic Table (TABLE-INSERT)

### Part V — Advanced Data Structures

- **17. Augmenting Data Structures** — Order-Statistic Tree, Interval Tree
- **18. B-Trees** — B-Tree (t = 2)
- **19. Data Structures for Disjoint Sets** — Disjoint-Set Forest

### Part VI — Graph Algorithms

- **20. Elementary Graph Algorithms** — Breadth-First Search, Depth-First Search, Topological Sort, Strongly Connected Components
- **21. Minimum Spanning Trees** — Kruskal's Algorithm, Prim's Algorithm
- **22. Single-Source Shortest Paths** — Bellman-Ford, DAG Shortest Paths, Dijkstra's Algorithm
- **23. All-Pairs Shortest Paths** — All-Pairs by Matrix Squaring, Floyd-Warshall, Transitive Closure, Johnson's Algorithm
- **24. Maximum Flow** — Ford-Fulkerson, Edmonds-Karp
- **25. Matchings in Bipartite Graphs** — Maximum Bipartite Matching, Gale-Shapley, The Hungarian Algorithm

### Part VII — Selected Topics

- **26. Parallel Algorithms** — P-FIB and the Computation DAG, Parallel Matrix Multiplication, Parallel Merge
- **27. Online Algorithms** — Move-to-Front, Online Caching (LRU)
- **28. Matrix Operations** — LUP Decomposition, LUP Solve
- **29. Linear Programming** — prose
- **30. Polynomials and the FFT** — Iterative FFT
- **31. Number-Theoretic Algorithms** — Extended Euclid, Modular Exponentiation, RSA
- **32. String Matching** — Naive String Matcher, Rabin-Karp, Finite-Automaton Matcher, Knuth-Morris-Pratt, Suffix Array
- **33. Machine-Learning Algorithms** — k-Means Clustering, Multiplicative Weights, Gradient Descent
- **34. NP-Completeness** — prose
- **35. Approximation Algorithms** — Approximate Vertex Cover, Approximate TSP Tour, Greedy Set Cover, Approximate Subset Sum

### Part VIII — Appendix: Mathematical Background

- **A — Summations** — prose
- **B — Sets, Etc.** — prose
- **C — Counting and Probability** — prose
- **D — Matrices** — prose

### Renderers

- `array-bars` — bar charts, for anything array-shaped (19)
- `cells` — rows of boxes with pointer arcs — lists, stacks, hash chains, string matching (13)
- `tree` — rooted trees and forests, with nodes sized to their keys (8)
- `graph` — graphs, with recorder-owned layouts fixed for the whole trace (16)
- `grid` — tables and matrices, with cell-to-cell dependency arrows (23)
- `plot` — continuous data — scatters, curves and series (4)

<!-- /generated:contents -->

## How it fits together

The central idea is that **an algorithm never animates itself**. It runs normally and _records_ a
trace — one `Step` per meaningful event — and a separate player replays that trace. This buys three
things: the algorithm source stays close to the book's pseudocode, it can be tested in plain Node
with no DOM, and one player drives every chapter.

```
src/
  algorithms/          Pure step-recorders. No DOM, no imports from the site.
    types.ts             Step / Trace / AlgorithmModule contracts
    registry.ts          Build-time list of every algorithm
    lazy.ts              Client-side dynamic imports (one chunk per algorithm)
    sorting/ graphs/ dp/ …   One file per algorithm, grouped by area
  visualizers/
    array-bars.ts cells.ts tree.ts graph.ts grid.ts plot.ts
                         One Canvas renderer per kind of structure
    renderers.ts         Kind → renderer, as dynamic imports
    roles.ts             The six coded colours, and what each means per algorithm
    describe.ts          The canvas in words, for screen readers
    player.ts            Playback: transport, scrubbing, code highlighting
    tape.ts              The trace tape, classified from Step alone
  components/
    AlgorithmPlayer.astro   Markup + styles for one visualizer
    ComplexityCard.astro    Complexity table + commentary
  content/chapters/    One MDX file per written chapter
  lib/
    book.ts              The book's structure: parts, chapters, slugs
    paths.ts             Base-path-aware URL helper
tests/                 Generative suites, run by `node --test`
scripts/
  verify-players.mjs   Browser pass over every embedded player
  check-base-path.mjs  Asserts a subpath build carries its prefix
  sync-readme.mjs      Regenerates the contents block above
docs/PROGRESS.md       The plan of record, and the session log
```

### Colour is information

Six coded colours carry every visual state on the site, defined once in `src/styles/tokens.css` and
given per-algorithm wording in `src/visualizers/roles.ts` — which is also what generates the
on-screen key, so the legend and the picture cannot drift apart. `tests/legends.test.ts` enforces
both directions: a key that promises a colour no step paints fails the build, and so does a step
that paints one the key never mentions.

Hue is never the only channel. Settled bars are square-topped, moving ones get an ink outline, and
facts about the _data_ — a red-black node's colour, a centroid's population — are drawn as neutral
badges rather than borrowing a coded colour.

### The picture, in words

A canvas is a bitmap, so every player also writes its state out as a sentence — the array or the
structure, the buffers beside it, and what the step is emphasising, named with the same wording the
on-screen key uses. It lives in a visually hidden element the canvas points at with
`aria-describedby`, and is rewritten on every step and every new input. It is deliberately not a
live region; instead the narration stops announcing while the trace is playing and starts again
when it is paused. `tests/describe.test.ts` asserts that two steps read out the same words exactly
when they draw the same picture, so nothing on screen goes unsaid.

### Verification, not re-running

Every algorithm declares what a correct run produces. Where the book proves a theorem, the test
asserts the theorem rather than re-running the algorithm and comparing: the parenthesis theorem,
max-flow min-cut, the MST cut property, Berge's theorem, competitive ratios against a brute-forced
offline optimum, approximation bounds against a brute-forced true optimum.

This has caught real bugs that reading would not have — an RSA exponent that made the cipher the
identity function, a gradient-descent guarantee asserted unconditionally when it only holds below a
curvature bound, a parallel merge that would have had a linear span.

## Adding a chapter

Copy `src/content/chapters/_template.mdx` to `<slug>.mdx`, where `<slug>` matches the entry in
`src/lib/book.ts`. Write prose, and drop in `<AlgorithmPlayer id="..." />` wherever a visualization
helps. The sidebar, home page and progress bar update themselves.

Set `draft: true` in the frontmatter while it is still being written. A draft is **readable in
`npm run dev`**, with a banner on it, and in a production build behaves exactly as if the file were
not there: its route serves the unwritten stub, it is dimmed in the sidebar and on the home page,
and it is left out of the generated contents above. Clear the flag to publish. The rule lives in
`src/lib/drafts.ts`; every surface goes through it, and `tests/drafts.test.ts` fails any that
doesn't.

There is a `add-chapter` skill in `.claude/skills/` with the full checklist, including two MDX traps
that will otherwise cost you an afternoon.

## Adding an algorithm

Write a recorder in `src/algorithms/<area>/<name>.ts`, register it in **both** `registry.ts` and
`lazy.ts`, give it a `LEGENDS` entry in `roles.ts`, and reference it from a chapter. `npm test`
picks it up automatically — no new test code is needed for the algorithm itself.

The `add-algorithm` skill in `.claude/skills/` has the full contract: which highlight keys each
renderer understands, what `result` / `aux` / `input` / `complexity.extra` are for, and the rules
each renderer imposes on its recorder.

## Deploying

Nothing is hardcoded. `astro.config.mjs` reads two environment variables:

| Variable    | Meaning                                  |
| ----------- | ---------------------------------------- |
| `SITE_URL`  | The absolute origin                      |
| `BASE_PATH` | The subpath, when not served at the root |

`.github/workflows/deploy.yml` derives both from `actions/configure-pages`, so a GitHub Pages
project site works with no configuration at all — push, and set Settings → Pages → Source
to "GitHub Actions".

**Deploy runs behind CI, as a job dependency rather than a hope.** `ci.yml` is a reusable workflow
(`workflow_call`), and deploy.yml's first job is `uses: ./.github/workflows/ci.yml`; everything that
touches Pages `needs` it. So nothing publishes until types, lint, formatting, README freshness, the
generative suite, the browser pass over every player and the subpath link check have all passed
**for the commit being published** — a manual `workflow_dispatch` included, since there is no input
that turns the gate off. Adding a job to `ci.yml` adds it to the gate; in exchange, CI does not run
standalone on `master`/`main`, because it runs inside Deploy there. `tests/workflows.test.ts`
asserts the whole chain, and was checked by removing the dependency and watching it fail.

Every internal link goes through `href()` / `chapterHref()` in `src/lib/paths.ts`, and CI builds
under a subpath and asserts that every emitted link carries the prefix. That check exists because a
hardcoded `/chapters/…` works perfectly on a root deploy and 404s on a subpath one, which is the
kind of bug nobody finds locally.

## Design notes

A few decisions worth knowing before editing, each of which fixed a real bug:

- **Animated regions are fixed-height.** The narration box reserves three lines; a sentence that
  wraps past its reserve shoves the transport down on every step where it appears, which is
  invisible in a screenshot and obvious when stepping.
- **A graph's layout belongs to its recorder** and is fixed for the whole trace. A layout
  recomputed per frame moves vertices as the algorithm runs, and the reader is tracking where the
  search has got to. The same rule applies to a plot's axes, with more force.
- **A grid emits its table at final size from the first frame**, unfilled entries drawn as dashed
  outlines. A table that grows rescales every cell mid-run, and the rescaling reads as something
  the algorithm did.
- **Colours are read from CSS custom properties at draw time.** A theme change redraws rather than
  rebuilding renderer state.
- **Three theme states, not two.** `:root` carries the full light palette; `prefers-color-scheme`
  and `[data-theme]` only _redefine_ tokens. A colour defined solely inside a media query goes
  missing when the viewer's setting is "system".
- **Canvas backing stores are sized from the canvas's own box**, never its parent's — the parent's
  includes padding, and sizing to that silently stretches every frame.

## Licence and attribution

The site's own code and prose — everything under `src/`, `scripts/` and `tests/` — is **MIT
licensed**; see [LICENSE](LICENSE) for the terms and the full scope. Take it, fork it, ship it.

That licence covers this repository's work and nothing else. Pseudocode transcribed from
_Introduction to Algorithms_, 4th edition, along with the book's algorithm names, section numbering
and chapter structure, remains © MIT Press and is reproduced here for study and commentary. This is
an unofficial companion, not endorsed by the authors or by MIT Press. Reusing the code is a matter
of the MIT licence; reusing the book's pseudocode is a matter between you and MIT Press.
