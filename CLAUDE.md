# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Loop Invariant" — an interactive, animated companion to CLRS (Introduction to Algorithms, 4th ed.), built as an Astro static site with no client-side UI framework (plain TypeScript + `.astro` components + Canvas).

The book is the **4th edition**, and `src/lib/book.ts` plus every chapter's `section:` frontmatter follow its numbering. A 3rd-edition PDF may be sitting in the working directory: its pseudocode is fine for the algorithms that didn't change between editions, but its chapter and section numbers are not, and Part IV/V renumber heavily. See the edition section of `docs/PROGRESS.md` before taking anything from it.

## Progress tracking

`docs/PROGRESS.md` is the plan of record for finishing the book and the resume point after an interruption. **Read it before starting any chapter or algorithm work**, and treat updating it as part of the work rather than as cleanup afterwards:

- Tick a box in the same change that lands it. A checked box means the relevant definition of done in that file is actually satisfied — not that the code was written.
- Keep the **Resume here** block at the top pointing at the genuine next task, and append a row to the **Session log** at the end of a working session.
- Engine items **E1–E7** each name what they block. Don't start a chapter whose row is marked 🔒 — do the blocker first, or the work will be rewritten.
- The scope decisions recorded there (renderer-batched sequencing, all 39 chapters, Tier 1 depth) are settled. If one genuinely needs to change, change it in the file and say so; don't quietly work to a different plan.
- When a chapter or algorithm lands, its row moves to ✅ **and** the phase checklist above it gets ticked. Two places, like `registry.ts` and `lazy.ts`.

## Commands

- `npm run dev` / `npm start` — dev server at http://localhost:4321
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm run check` — Astro type/diagnostics check
- `npm test` — runs `node --test "tests/**/*.test.ts"` (Node's built-in test runner, not vitest/jest). Run a single test with `node --test --test-name-pattern="<name>" "tests/**/*.test.ts"`.
- `npm run lint` — ESLint (flat config, `eslint.config.js`), covers `.ts` and `.astro` files.
- `npm run format` / `npm run format:check` — Prettier, including `.astro` files via `prettier-plugin-astro`.
- `npm run verify:players` — steps every player in a real browser, in both themes. See below.

## Verifying in the browser

Both definitions of done in `docs/PROGRESS.md` end with "step through it in both themes", and `npm test` cannot do that. **`npm run verify:players` is that pass, automated** — don't hand-roll a Playwright script, and don't burn turns on the MCP browser tools, which are unreliable here (`plugin:playwright:playwright` has timed out at session start and the `claude-in-chrome` extension has reported "not connected"). Check them once if you like; the script is the fallback that works.

```
npm run verify:players                        # assert only
npm run verify:players -- --shots             # …and write a PNG per player to .player-shots/
npm run verify:players -- --only select       # one chapter or algorithm, while iterating
```

It starts a dev server if one isn't already up, stops it after, and exits non-zero on any problem. It walks **every** step of every player across light@1440 / dark@1440 / light@900 / **dark@375** and reports: console and page errors, players that never reach `data-ready`, canvases that drew nothing, steps with no narration or without exactly one highlighted code line, panel height changing mid-trace, **text cut off with no way to scroll to it**, and any registered algorithm embedded in no chapter.

The 375 row is below the player's own 620px container breakpoint and is where the layout rules above are actually load-bearing; the clipping check asks whether the nearest ancestor that _clips_ cuts an element off, so the pseudocode panel scrolling horizontally is fine and a legend entry disappearing under `overflow: hidden` is not.

**What it still can't see, so look at `--shots` yourself:** whether each variable marker sits over the bar it actually names. A marker keyed to the _input_ array is wrong on any step where the chart has moved to an output array — that shipped twice in chapter 8 and only an eye caught it.

Three environment facts the script encodes, worth knowing if you touch it:

- **Playwright is a devDependency** (pinned, 1.58.2) as of the housekeeping pass, so CI can run this script; browsers still come from `npx playwright install chromium` and are cached outside the project. `loadChromium()` tries the bare specifier first and falls back to the global install (`npm root -g`) — keep the fallback, it is what makes the script work in a tree that has not been `npm install`ed.
- **Never spawn a server through `npm`** — `Start-Process -FilePath npm` fails outright with "%1 is not a valid Win32 application" because `npm` is a `.cmd` shim, and going through the shim leaves a process you can't reliably kill. The script spawns `node node_modules/astro/bin/astro.mjs dev` directly. If you do start a dev server from the shell instead, use the PowerShell tool's `run_in_background` and **poll the port** — the background task reports "completed, exit code 0" while the server is still happily serving.
- **Node strips types natively here**, so `await import('../src/algorithms/registry.ts')` works from a plain `.mjs` — that's how the coverage check reads `ALGORITHM_IDS`. Recorders are DOM-free, which is what makes that safe.

**Two shell gotchas that cost time.** Bash heredocs mangle these files (a `<<'EOF'` block failed with `unexpected EOF looking for matching '`) — use the Write tool for file content and short `node -e` scripts for surgical edits. And a PostToolUse formatter rewrites files after every Write, so it normalises quotes: a follow-up `sed` matching `from 'playwright'` will miss because the file now says `from "playwright"`.

## Architecture

- Algorithms never animate themselves. Each one is a **recorder**: a pure TS function that runs the algorithm and calls `emit(...)` to push `Step`s onto a `Trace` (see `src/algorithms/types.ts`). No DOM code lives here — recorders are plain, unit-testable Node functions.
- A single **player** (`src/visualizers/player.ts`) replays any trace: transport controls, the trace tape, and pseudocode-line highlighting. It **dispatches on the module's `VisualizerKind`** through `RENDERER_LOADERS` in `src/visualizers/renderers.ts` and never imports a renderer itself, so each chapter downloads only the renderer it uses. **All six exist**: `array-bars` (Parts I–II), `cells` (rows of boxes, pointer arcs, interval strips), `tree` (binary and multi-key nodes, forests, NIL leaves), `graph` (Part VI — role-coloured edges, weight chips, dashed residual edges, per-vertex scope rings), `grid` (DP tables, matrices, transition tables, text-over-pattern strips — cell-to-cell arrows, a `note` beside every value, a rectangular scope) and `plot` (R6, chapter 33 — scattered points, polyline series, point-to-point links, reference rules, a scope box). A new renderer is a module exporting `draw(canvas, step, opts)`, `resize(canvas, step, opts)` and `roles(step)`, plus a line in `RENDERER_LOADERS` and the `rolesFor…` exports that `tests/legends.test.ts` counts what it paints with. `roles` is the union of those maps and is part of the `Renderer` contract, because two things read the renderer's colour decision: the key, and `describe.ts`, which turns it into the canvas's text alternative. A kind with no entry throws a message naming the file to write rather than drawing nothing.
- **A graph's layout belongs to the recorder, and is fixed for the whole trace.** `graph.ts` will not invent one: a vertex carries a normalized `x`/`y` chosen by the code that built the network (see `src/algorithms/graphs/graph-input.ts`), because a layout recomputed per frame would move vertices as the algorithm runs, and the reader is tracking where the search has got to. Vertices with no position are laid out on a circle — which is what a graph the reader typed gets. Anything that hangs off a vertex (the badge, the marker label, the set caption) has a band reserved for it **unconditionally**, since a band that appeared only on the steps that used one would shift every vertex mid-trace.
- **A plot recorder owns its axes, and they are fixed for the whole trace.** `PlotData` declares
  `xRange`/`yRange` and `plot.ts` never infers them. This is the graph renderer's layout rule
  restated where it bites hardest: axes refitted per frame would move every point on screen as the
  algorithm ran, and a k-means centroid that appeared to shift because the axis shifted would be a
  lie about the algorithm. Multiplicative weights computes its y-range from the whole loss sequence
  before emitting a single step, for exactly this reason.
- **A cells recorder brackets its _first_ row.** `scope`'s caption is drawn in the gap above the
  row it brackets, and only the first row has a band reserved for it (`MARKER_LANE`); the gap
  between rows is 16px, which a 10px caption plus the bracket's rise does not fit into. A caption
  above any other row is drawn across the cells of the row above and is invisible in a screenshot
  taken on a step that has no scope. Chapter 35's subset sum puts L above S for exactly this
  reason, even though S is the input.
- **A grid recorder must emit its table at final size from the first frame**, with unfilled entries as `null` (which draw as dashed outlines). A table that grows rescales every cell mid-run, and the reader reads the rescaling as something the algorithm did. Chapter 32 pads the text row with `m − 1` empty columns for exactly this reason: with `q = 0` near the end of the text, KMP aligns the pattern past the last character.
- **MDX has indented code blocks disabled.** A four-space-indented display equation is a _paragraph_, and any braces in it are parsed as a JSX expression — `y_{k+m/2}` fails the build with `ReferenceError: k is not defined`, and everything else renders as prose without anyone noticing. Use fenced blocks (` ``` `) for pseudocode and equations; inline backticks are safe.
- **Two more MDX traps, both from the prose chapters.** Braces are JSX _anywhere_ in MDX, not only in
  indented blocks: `Pr{A ∪ B}` in a sentence fails the build with `Invalid Character` — wrap any
  formula containing braces in backticks. And **no line may start with `<`**: Prettier (proseWrap
  `preserve`) treats a line beginning with a tag as a block node and inserts a blank line before it,
  silently splitting one paragraph into two. Cross-chapter links go through
  `<a href={chapterHref('slug')}>` per the base-path rule below, so keep them mid-line — if a
  paragraph would begin with one, put a word in front of it. `grep -n "^<a href" src/content/chapters/*.mdx`
  should return nothing.
- **`AlgorithmInput` is `number[] | GraphInput | TextInput`.** It was widened in Phase D and the bivariant _method_ declarations on `record`/`verify`/the `InputSpec` hooks are what kept that to one line — an array-shaped module annotates its own callbacks `(input: number[], …)` and is otherwise untouched. Narrow with `isGraphInput` / `isTextInput`. Widening it again for Part VII should cost the same — it has now cost one line twice.
- The **trace tape** (`src/visualizers/tape.ts`) is renderer-agnostic: it classifies each step from `step.stats` deltas plus changes in `step.proc`/`hi.range`, all of which live on the shared `Step`. Any new visualizer kind gets the tape for free — don't reimplement it.
- `src/algorithms/registry.ts` is the build-time list of all algorithms (`ALGORITHMS[]`); `src/algorithms/lazy.ts` provides the client-side dynamic-import chunks. **Adding an algorithm means updating both files** — forgetting `lazy.ts` is the easiest mistake to make (see the `add-algorithm` skill).
- Chapters are MDX files in `src/content/chapters/`, validated against the zod schema in `content.config.ts` and structured via `src/lib/book.ts`. Chapters embed algorithms with `<AlgorithmPlayer id="..." />`.

## Conventions

- Relative imports must include the `.ts` extension (e.g. `from '../types.ts'`) — required by `allowImportingTsExtensions` in tsconfig.json so the same source runs unmodified under both Vite (site build) and Node's native TS type-stripping (tests).
- Algorithm arrays are 1-indexed internally (`[null, ...input]`) to mirror CLRS's pseudocode numbering — tests assert `step.array.length === n + 1`.
- Filenames are kebab-case (`insertion-sort.ts`); `.astro` components are PascalCase; procedure-name keys in pseudocode match the book's SCREAMING_CASE (`QUICKSORT`, `PARTITION`, `MERGE`).
- Colour is information, not decoration. Six coded colours (`--c-rest/look/move/done/mark/scope`) each carry exactly one meaning, defined in `src/styles/tokens.css` and mapped to per-algorithm wording in `src/visualizers/roles.ts` — which is also what generates the on-screen legend, so the key and the bars cannot drift apart. UI chrome uses the neutral ramp only and must never borrow a coded colour. Because hue alone is not a safe channel, the renderer pairs each role with a second cue (settled bars are square-topped, moving bars get an ink outline).
- **Data is not a role (E6).** A red-black node's colour, a disjoint-set node's rank, an order-statistic node's size are facts about the _data_, not visual states, and they must never borrow a coded colour — a red node drawn in `--c-move` would be indistinguishable from a node being written. The channel for them is a **badge**: a small pill drawn on the node's shoulder, in the neutral ramp only, carrying a letter or a number. A two-valued attribute uses the pill's fill as well as its letter (a black node's badge is filled, a red node's is hollow), so "two reds in a row" is a shape pattern and not a hue one. Nodes keep the site's usual vocabulary underneath: fill is the role, an ink outline means `move`, square corners mean `done` (on a graph vertex, a square instead of a circle). Attributes never appear in a legend, because they are not colours. The pill itself lives in `src/visualizers/badge.ts` and is imported by every renderer that draws one — two copies would be two chances for a filled and a hollow badge to stop being told apart by shape, which is the whole point of the decision.
- **A canvas is a bitmap, so every player carries its state in words as well.** `src/visualizers/describe.ts` turns a `Step` into a sentence — the array or the structure, the aux buffers beside it, and what the step is emphasising, named with the same legend wording the sighted reader gets. The player writes it into a visually hidden element the canvas points at with `aria-describedby`, rewritten on every step and every new input. It is **not** a live region: announced on every frame of playback it would be unusable, so instead the narration's `aria-live` is switched off while playing and back to `polite` when paused. `tests/describe.test.ts` asserts the invariant that matters — two steps describe identically exactly when they draw identically, so nothing on screen goes unsaid.
- A legend lists **every coded colour that appears on the chart, and nothing else** — chart chrome included, not just bar fills. The subarray bracket and the heap boundary are drawn in the scope colour and so earn a `scope` entry, worded to name the mark rather than a bar. `tests/legends.test.ts` enforces both directions against what `rolesForStep` actually returns, so a key that promises a colour no step produces fails the build.
- `AlgorithmModule` carries four optional declarations beyond the pseudocode: `result` (what a correct run produces, which is what lets non-sorting algorithms be tested at all), `aux` (rows of chips for values that live outside the array), `input` (the key range the player generates and accepts), and `complexity.extra` (rows beyond the standard four). `stable`/`inPlace` are optional — omit them where the question is meaningless rather than inventing an answer.
- CSS theming has three states, not two: base values on `:root`, then overrides under `prefers-color-scheme` AND `[data-theme]`. A color defined only inside a media query breaks the "system" theme setting. Canvas renderers read colors from CSS custom properties at draw time, so a theme change triggers a redraw rather than requiring rebuilt renderer state.
- Keep animated UI regions fixed-height (narration box, aux buffers, pseudocode panel) so step changes don't cause layout jump/scroll. **The narration box measures its own reserve** rather than assuming three lines: `reserveNoteHeight()` in `player.ts` clones every distinct narration into an absolutely positioned probe, lays the probe out once, and reserves the tallest. Three lines is right at 1440 and short by two at 375, and a superscript (`D⁰`) raises a line box by 11px without adding a line at all — a note that wraps past its reserve shifts the transport under it on every step where it appears, which is invisible in a screenshot and obvious when stepping.
- Size a canvas backing store from **the canvas's own** `clientWidth`/`clientHeight`, never from its parent's rect — the parent's box includes padding, and sizing to that silently stretches every frame. Observe size with a `ResizeObserver` on the player root, not a `window` resize listener: the component also changes width when web fonts land and when the sidebar collapses, and neither fires a window resize.
- Astro's scoped styles are applied at build time and **never reach nodes the player injects with `innerHTML`** (the aux value chips). Styles for injected markup belong in `src/styles/global.css`, with a comment saying why.
- The player sizes itself with `@container` queries, not viewport media queries: it renders both beside the chapter sidebar and full-width on the index, so the viewport is not what determines how much room it has.
- `astro.config.mjs` has no `site`/`base` set yet. Internal links must go through `href()`/`chapterHref()` in `src/lib/paths.ts` rather than hardcoded paths, so a future base-path change (e.g. GitHub Pages) doesn't require touching call sites.
