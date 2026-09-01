# Loop Invariant — completion tracker

The working plan for finishing the book, and the record of where we got to. **This file is the
resume point.** If a session is interrupted, read "Resume here" below, then the phase you are in,
and pick up from the first unchecked box.

Keep it current: tick boxes as they land, and append a line to the [Session log](#session-log) at
the end of every working session. A stale tracker is worse than none.

---

## Resume here

> **Phase:** H — **complete. The book has search.** Phases A–G are closed: all 35 chapters and four
> appendices are written, all six renderers are built, 88 algorithms ship, and housekeeping — CI,
> deploy, the generated README, the skills — is closed too. `origin` is
> <https://github.com/ThomasRohde/clrs-visualized>, **Settings → Pages → Source is GitHub Actions**,
> the site serves at <https://thomasrohde.github.io/clrs-visualized/>, and **the deploy runs behind
> CI**, so a red commit cannot publish.
> **Next task:** **nothing is outstanding.** What is left in the
> [backlog](#tier-2-backlog) is eight ⬜ rows, two ❓ ones that need a 4e copy to settle, two ✏️
> changes to players that already ship, and three ⛔ decisions not to build something. Promoting
> another row is a decision, exactly as Phase G was.
> **Last completed:** **[Phase H](#phase-h--search)** — full-text search with BM25F ranking, built at
> build time and shipped as two static JSON files (about 100 KB and 127 KB gzipped, both under a
> budget `npm test` asserts). A ⌘K/`/` dialog and a linkable `/search` page rank 340 documents: every
> `##`/`###` section of every chapter, deep-linked to the anchor Astro already emits, and all 88
> algorithms, carrying their pseudocode and the wording of their legends and linking to the heading
> their player sits under. `tests/search-ranking.test.ts` — thirty golden queries against the real
> corpus — is the quality gate, and `verify:players` now drives the dialog by keyboard in all four
> theme/width combinations. Before that, **G5** — `miller-rabin` (§31.8 ★) and `boyer-moore`, which
> closed Phase G.
> **Phase G was optional in a way A–F were not**, and Phase H is optional in the same way: nothing in
> the backlog is a gap, and the book was complete without a search box. Nine of the twenty-four
> Tier-2 rows were promoted, chosen because each teaches something no player on the site shows, and
> the rest stay catalogued exactly as they were.

---

## Scope decisions

Settled at the outset so they don't get relitigated mid-grind.

| Question                      | Decision                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sequencing**                | Renderer-batched. Clear every chapter the current renderer serves, then build one new renderer and clear all of its chapters. Book order applies _within_ a phase, not across phases.                         |
| **Which chapters are "done"** | All 39 rows in `src/lib/book.ts` — 35 chapters and four appendices. Chapters with no animatable algorithm (1, 3, 34, appendices A–D) get a shorter prose-and-diagram treatment rather than being padded out.  |
| **Depth per chapter**         | **Tier 1** — the headline algorithms of the book's numbered sections. Starred sections, exercises and end-of-chapter problems are **Tier 2**: catalogued in the [backlog](#tier-2-backlog) but not built yet. |

Tier 2 is deliberately written down rather than dropped. Scaling up later is promoting rows out of
the backlog table into a phase — no restructuring of this document, no rework of what shipped.

---

## Status legend

| Mark | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| ✅   | Done and verified (see the definitions of done below)           |
| 🚧   | In progress                                                     |
| ⬜   | Not started                                                     |
| 🔒   | Blocked — the blocking item is named in the row                 |
| ❓   | Section contents need checking against the book before starting |
| ⛔   | Decided against, with the reason recorded — not pending work    |
| ✏️   | A change to a player that already ships, not a new one          |

---

## Definition of done

Nothing counts as ✅ until every box below is true. These are the two project skills
(`.claude/skills/add-algorithm`, `.claude/skills/add-chapter`) condensed to a checklist — read the
skill itself the first time you do either.

### An algorithm is done when

1. Recorder lives at `src/algorithms/<area>/<name>.ts`, 1-indexed (`[null, ...input]`), emitting at
   every meaningful step, with `stats` incremented immediately before the `emit` that shows the
   change.
2. Registered in **both** `src/algorithms/registry.ts` (static) and `src/algorithms/lazy.ts`
   (dynamic, `.js` extension in the import path). Forgetting `lazy.ts` is the classic failure.
3. Has an entry in `LEGENDS` in `src/visualizers/roles.ts`, worded for _this_ algorithm, listing
   every coded colour that appears on its chart and nothing else. That includes chart chrome, not
   just bar fills: the subarray bracket and the heap boundary are drawn in the scope colour and so
   earn an entry, worded to say which mark the reader should look for.
4. `complexity` is fully populated, and declares a `result` contract unless it sorts.
5. `npm test` passes — registry membership is what gets it covered; no per-algorithm test code.
   `tests/legends.test.ts` checks item 3 mechanically, in both directions, against what
   `rolesForStep` actually returns.
6. `npm run check` and `npm run lint` are clean.
7. `npm run verify:players` is clean — it steps every player through every step in both themes at
   three viewport sizes, and fails on console errors, dead players, blank canvases, missing
   narration or pseudocode highlight, panel height changing mid-trace, and any algorithm registered
   but embedded in no chapter.
8. Looked at once, with `npm run verify:players -- --shots --only <id>`: every variable marker sits
   over the bar it names. A marker keyed to the _input_ array is wrong on any step where the chart
   has moved to an output array — that shipped twice in chapter 8, and it is the one class of bug
   nothing automated catches.

### A chapter is done when

1. MDX at `src/content/chapters/<slug>.mdx`, filename matching the slug in `src/lib/book.ts`
   exactly.
2. Frontmatter complete; `algorithms:` lists every id embedded in the body.
3. **No colour is named in the prose.** Describe behaviour and structure and let the generated
   legend carry the colour — the palette differs per theme, and prose colour references are an
   unsynchronised second copy of the legend. Naming the _second_ cue (square tops, ink outlines) is
   fine, and is what a reader who can't separate the hues relies on.
4. Where the chapter compares two algorithms or two inputs, it points the reader at the **trace
   tape** first. Chapter 2's "Comparing them" is the worked example.
5. `npm run check` and `npm run verify:players` clean — the latter is what proves every embedded
   player actually loads and steps end to end.
6. Read once in each theme.

---

## Engine work

Cross-cutting changes to the platform. Each names what it blocks — that is why they are scheduled
where they are rather than all up front.

| Id     | Item                               | Blocks     | Status |
| ------ | ---------------------------------- | ---------- | ------ |
| **E1** | Generalize the test contract       | ch 5, 9    | ✅     |
| **E2** | `Step` payload beyond `array`      | Phase C on | ✅     |
| **E3** | Renderer dispatch in `player.ts`   | Phase C on | ✅     |
| **E4** | Per-module input model             | Phase C on | ✅     |
| **E5** | Complexity rows beyond sorting     | ch 5, 9    | ✅     |
| **E6** | Colour semantics for data colour   | ch 13      | ✅     |
| **E7** | Tape classification without arrays | Phase C on | ✅     |
| **E8** | A zero baseline for `array-bars`   | ch 4 (G2)  | ✅     |

**E1 — Generalize the test contract. ✅ Done in Phase A.** `AlgorithmModule.result` is a
`ResultContract`: a `kind` of `sorts` (the default, so no existing module changed) / `permutes` /
`preserves` / `transforms`, plus an optional `verify(input, trace)` returning a complaint string or
`null`. `Trace.output` carries whatever the algorithm _returned_ when that is not the array — the
order statistic, the number of hires, the final heap size — and only `verify` knows what its keys
mean. `transforms` waives every structural assertion, so the metadata test requires a `verify`
alongside it. Everything else in the suite stayed universal.

**E2 — `Step` payload beyond `array`. ✅ Done in Phase B.** `Step.array` is optional and
`Step.data?: StepData` is the sibling payload, as recommended — `Step` itself stayed a plain
interface, so `stats`, `note`, `proc`/`line` and the tape carried on untouched. Exactly one of the
two is set, and `createRecorder`'s `emit` is what guarantees it: its third argument is now
`StepPayload`, either the array (all 15 existing recorders, unchanged) or a structure, and the
structure path clones with `structuredClone` because a tree nests where an array `slice()` was
enough.

Three things came with it that were not obvious up front:

- **`Trace.finalArray` had to become optional too.** A tree algorithm has no final array, and
  making one up to satisfy the type is exactly the invented answer E5 got rid of. The three
  `result.kind`s that are claims _about the array_ (`sorts`, `permutes`, `preserves`) now assert
  it is present; `transforms` is what a structure algorithm declares, and its `verify` carries the
  contract. `MAX-HEAP`'s verify returns a complaint for a missing array rather than defaulting to
  `[]`, which would have passed vacuously.
- **`VisualizerKind` now names R1–R6** (`array-bars | cells | tree | graph | grid | plot`) instead
  of the old speculative `graph | tree | matrix`, so the kind a module declares, the renderer table
  below, and `StepData`'s `kind` are one vocabulary. `StepData` has members for `cells` and `tree`
  only — the two Phase C renderers. **Add a member when its renderer's phase arrives, not before**;
  the shapes there were written for R2 and R3 and will firm up when those renderers draw them.
- **The array assumptions in the suite are gone.** The well-formed test now checks that a step
  carries exactly one snapshot and that it matches the module's declared renderer — an `n+1`-long
  array for `array-bars`, a `data.kind` that agrees otherwise. `tests/legends.test.ts` runs its
  paint-vs-key check over array modules only, since `rolesForStep` is the _array_ renderer's colour
  decision; **each structure renderer owes the same both-directions check for its own steps.** The
  legend-wording tests still run over everything.

**E3 — Renderer dispatch. ✅ Done, first task of Phase C.** `src/visualizers/renderers.ts` is the
new seam: a `Renderer` interface (`draw`/`resize`), a shared `RenderOptions`, and
`RENDERER_LOADERS`, a kind-keyed map of dynamic imports. The player asks `loadRenderer` for the
kind its module declared and never imports a renderer again. `array-bars` is still its own Vite
chunk, so a chapter downloads the one renderer it uses.

`RENDERER_LOADERS` is deliberately **partial**: `VisualizerKind` names all six renderers the book
needs and five do not exist, so a module pointed at one of them throws a message naming the kind
and the file to write, rather than leaving a blank canvas for a reader to find.
`tests/renderers.test.ts` resolves every registered kind through the real dynamic import and checks
what comes back actually exports `draw` and `resize`.

**One convention note.** The loaders import `./array-bars.ts`, not `.js` as `lazy.ts` does. Both
build and chunk identically, but Node cannot resolve the `.js` form — which is why the test above
can invoke a renderer loader for real and no test can invoke an algorithm loader. Switching
`lazy.ts` to `.ts` would make "every algorithm has a working loader" a unit test instead of a
browser-only check, which is worth doing to the classic failure mode; left alone for now because
the `.js` form is written into the definition of done above.

**Why it moved out of Phase B** (decided 2026-08-28, after E2): dispatch written there would have
had exactly one destination, so the only testable claim was that array-bars still resolves — the
branch that matters, _a second renderer actually being selected_, cannot be exercised until R2
exists. **This did not weaken the gate**: E3 blocked Phase C's renderers, not its start, and E2 —
the seam R2's snapshot has to fit — was done. The rule that still holds: **no chapter of Phase C
ships before R2 is in.**

**E4 — Per-module input model. ✅ Done: half in Phase A, half in Phase B.** The descriptor exists:
`AlgorithmModule.input` is an optional `InputSpec` of `{ min, max, placeholder, note }`, and
`randomArray`/`parseCustomInput` take it, defaulting to the old 5‥78 behaviour so no existing
algorithm changed. Chapter 8 forced this early and could not have been written without it —
counting sort is illegible unless the keys are small, and radix sort wants exactly three digits.

**✅ The other half landed in Phase B.** `InputSpec` was extended, not replaced — the value-range
fields are untouched and still load-bearing for chapter 8's three algorithms. It now has two
layers: the value fields describe a list of numbers, and three hooks below them replace that idea
outright.

- **`generate(n)`** builds a fresh input for the size slider and Randomize, winning over `min`/`max`
  entirely. **`parse(text)`** replaces the comma-separated reader — supply it alongside `generate`,
  because a reader who can generate a graph but not type one cannot ask a specific question of it.
  **`size(input)`** feeds the `n` readout, defaulting to length.
- **`AlgorithmInput` is now the name of what a module is run on**, and `record`, `verify` and the
  hooks are all declared as _methods_ so that TypeScript compares their parameters bivariantly.
  **That is what makes widening the union a one-line change instead of a fifteen-file one** when
  Part VI needs a graph and chapter 32 needs a text/pattern pair. It is deliberately unsound; the
  player is what keeps it honest, since a module is only ever handed an input its own `generate` or
  `parse` produced. Today the union is still exactly `number[]`, so nothing has moved yet.
- **The player holds its input opaquely.** `baseArray: number[]` is now `baseInput: AlgorithmInput`;
  it is never inspected, only measured through `inputSize` and handed back to `record`. It is also
  `structuredClone`d on the way in and on the way to `record`, so a recorder that mutates its
  argument can no longer poison a re-record.
- **Three array assumptions outside the types went with it.** The size slider was hardcoded 4‥24
  (`minSize`/`maxSize`), the button said "Use this array" (`noun`), and the box's accessible name
  promised "numbers from 5 to 78" (`label`). Every default reproduces the old string exactly.
- **The suite asks the module for its input** rather than building one. The sorted/reversed/
  all-equal edge cases are skipped for a module with its own generator — a graph has no "reversed",
  and its degenerate cases are its own to declare.

**First used in anger in chapter 16.** The binary counter's input is not a list of anything: it is
_how many times to increment_. `generate(n)` returns `[n]` and `size(input)` reads it back out, so
the slider sets a number of operations and the readout still says what the reader set — and no part
of the player had to know. That is the shape E4 was for, and it cost one line in the module.

**E5 — Complexity rows beyond sorting. ✅ Done in Phase A.** `stable` and `inPlace` are now optional
and `ComplexityCard.astro` omits the rows a module does not answer, so `RANDOMIZED-SELECT` is no
longer made to invent a stability. `Complexity.extra` takes `[term, value]` rows appended after the
standard four, which turned out to be where the interesting fact usually lives — "Expected hires:
Hₙ ≈ ln n + 0.577", "Assumes: integer keys in 0‥k", "Comparisons: none — ever". The test asserts
the four universal rows, and that any optional or extra row present is non-empty.

**E6 — Colour semantics for data colour. ✅ Decided before R3, not before ch 13.** It had to move
earlier: the decision is about how a _node_ is drawn, so R3 would have had to be rewritten around
it otherwise.

**The channel is a badge, not the node.** An attribute is drawn as a small pill on the node's
shoulder, in the neutral ramp only, carrying a letter or a number — `B`/`R` for a red-black node,
`3` for a disjoint-set rank, `7` for an order-statistic size. The node itself keeps the site's
existing vocabulary: fill is the role, an ink outline is `move`, square corners are `done`. So the
two channels never compete, and a node can be red _and_ being compared without either fact being
lost.

Two consequences worth stating:

- **A two-valued attribute uses the pill's fill as well as its letter** — a black node's badge is
  filled, a red node's is hollow. "Two reds in a row" is then a pattern in shape, which is what a
  reader who cannot separate hues has to be able to see, and it is also how the violation
  `RB-INSERT-FIXUP` looks for reads on screen.
- **Attributes never appear in a legend.** The legend is the key to the coded colours, and an
  attribute is not one; `tests/legends.test.ts` would fail a key that listed one, because no role
  ever paints it.

**E7 — Tape without arrays. ✅ Done in Phase B.** It did survive E2 untouched, and it is no longer
being taken on trust: `classify` is exported and `tests/tape.test.ts` runs it over a trace with no
arrays in it at all, checking it still separates `move` / `look` / `scope` / `rest`, and separately
asserts that stripping `array` off every step of all 15 real traces changes not one classification.
That second test is the guard — a tape that quietly degrades to all-`rest` still draws, so the
failure would never announce itself.

**E8 — A zero baseline for `array-bars`. ✅ Done, ahead of G2.** `array-bars.ts` computes a
bar's height as `Math.max(3, (val / opts.maxValue) * plotH)`, so **a negative value draws as a 3px
stub** — visually identical to an ∞ sentinel, with its true value printed above it — and
`traceMaxValue` tracks only a maximum. Problem 4-1's maximum subarray is trivial unless the input
has negative numbers in it, so it cannot be drawn until this is fixed.

`RenderOptions` gains `minValue`, computed by a `traceMinValue` beside `traceMaxValue` and **fixed
for the whole trace** — the plot renderer's axis rule, restated, and for the same reason: a baseline
that moved between frames would move every bar on screen. **The baseline is gated on
`minValue < 0`**, so a trace with nothing negative in it draws exactly the pixels it draws today.
That gate is what keeps E8 from being a change to forty shipped players, and it is the same
guarantee the cells multi-row work gave when it learned to draw more than three rows.

`Tape`'s constructor gave up its TypeScript parameter property to get there: Node's native
type-stripping rejects those outright, and the module has to import cleanly in a test. Worth
knowing before writing another visualizer class.

Still worth **one look** when the first tree algorithm lands — the tests prove the classifier is
shape-independent, not that the resulting portrait of a tree run reads well.

### Renderers

| Id     | Renderer     | Serves                                                                       | Status |
| ------ | ------------ | ---------------------------------------------------------------------------- | ------ |
| **R1** | `array-bars` | All of Parts I–II                                                            | ✅     |
| **R2** | `cells`      | Linked lists, stacks, queues, hash chains, binary counter, string matching   | ✅     |
| **R3** | `tree`       | BSTs, red-black, B-trees, heaps-as-trees, Huffman, disjoint-set forests      | ✅     |
| **R4** | `graph`      | BFS/DFS, MST, shortest paths, flow, matching                                 | ✅     |
| **R5** | `grid`       | DP tables, matrices, adjacency matrices, FFT                                 | ✅     |
| **R6** | `plot`       | k-means, multiplicative weights, gradient descent — and ch 3's growth curves | ✅     |

Each new renderer exports `draw(canvas, step, opts)` and `resize(canvas, step, opts)`, reads every
colour from `ROLE_VAR` in `roles.ts` at draw time, and pairs each role with a non-hue second cue. The
transport, scrubbing, tape, narration, stats and pseudocode highlighting come for free.

**R2 as it stands. ✅ Complete.** `src/visualizers/cells.ts` draws labelled rows of boxes with the
value printed rather than plotted, an id-keyed role map (`rolesForCells`), a scope bracket over the
run currently _inside_ the structure, and `hi.pointers` — a `{ label: cellId }` map that draws the
variable names, so cells needs no equivalent of `array-bars`' per-procedure `markersFor` switch.
Second cue and third cue match the bars: `done` cells are square where every other cell is rounded,
and the cell being written gets an ink outline.

**Pointer arcs landed with §10.2**, and they are what let a structure be drawn whose order is not
its layout. Four things came with them:

- **A lane per pointer field under each row**, labelled `next` and `prev` at the left margin, decided
  from the snapshot rather than declared — a stack, whose cells carry neither field, lays out
  exactly as it did before. An arc's dip grows with its span, so a chain of one-step hops nests
  above the long arc a prepend creates instead of tangling with it.
- **`Cell.prev` joined `Cell.next`.** `null` is NIL and draws a labelled terminator; `undefined`
  means the structure has no such pointer and draws nothing. That distinction is load-bearing: it
  is how a freshly allocated object is drawn as unlinked, and how a spliced-out one stops showing
  the stale pointers it still holds.
- **An arc takes a role colour, exactly as a cell does** — `hi.links` is a `{ 'x3.next': 'move' }`
  map, keyed the way the book writes the field. It has to, because in `LIST-PREPEND` and
  `LIST-DELETE` the pointer assignment _is_ the step, and there is no cell to colour instead.
  `rolesForLinks` is exported for the same reason `rolesForCells` is: `tests/legends.test.ts` counts
  both, so a key that ignores the arcs fails.
- **Markers on one cell stack instead of overprinting.** `L.head` and `x` name the same object on
  the first line of every search, and before this they were drawn on top of each other.

**The multi-row grid landed with chapter 11 — and checking it before writing the recorder was the
right call.** The layout could not draw more than about three rows. It charged every structure for
a caption strip, a 34px marker lane and 16px between rows whether or not it used them, so five
buckets computed a 334px block for a canvas 184px tall and ran off the bottom of it. Four changes,
all of them the same idea — charge only for what the snapshot actually uses:

- **The caption strip, the marker lane and the row gap are derived now**, as the arc lanes already
  were. A hash table names its rows at the left margin, so no cell carries a label and no strip is
  paid for; markers hang above the first row on a leader line, which is only honest for one or two
  rows, so past that the lane goes as well.
- **Height is divided per row, cells served before lanes**, each with a floor, rather than the old
  "cell first, then whatever is spare". A single-row structure lands on exactly the numbers it had
  before — the stack and the list are pixel-identical — and five rows now fit a 190px canvas.
- **Cell width is capped at twice the cell height, and the block is centred.** Sizing to the widest
  row alone made a table whose longest chain is three draw 226px cells: three slabs across the
  panel. A list of nine cells is already narrower than the cap, so this moves nothing that shipped.
- **The scope bracket rises by what the row gap can spare** instead of a fixed 10px, so a bracket
  over one bucket no longer sits on the cells of the bucket above it.

**Three things stay row-local**, and the renderer's header comment now says so rather than leaving
it to be discovered: an arc can only reach a cell in its own row, the bracket takes its top from
the topmost cell it names, and markers assume the first row. **The one thing that does not fit is a
chain drawn with `next` arcs** — an arc lane costs 26px per row on top of the cells, and five rows
cannot afford that at the narrow breakpoint. So chapter 11 draws each chain head-first in list
order with adjacency carrying the order, and the chapter says so in as many words rather than
letting the reader assume the row is memory.

Also landed alongside: **`AlgorithmPlayer` clamps its `size` prop into the module's own
`minSize`/`maxSize`.** A chapter that embeds a player without naming a size gets 12, which is
outside an 11-slot table's range; the clamp is a no-op for every player that shipped before it.
(It still does not consult `defaultSize` — five shipped players would change starting size if it
did, so that is a deliberate separate decision, not an oversight.)

**Chapter 16 needed nothing new from it** — three more recorders, no renderer change — which is
the first time that has been true in Phase C and is the sign R2 is actually finished. What it did
do is settle what the **scope bracket** is for on this renderer: it is not "the structure", it is
whatever run of cells the sentence under it is about. It has now carried membership (the stack),
selection (a hash bucket), price (the bits an increment will flip, labelled with the count),
potential (Φ, the stack's height) and capacity (T.size, doubling as you watch). A recorder that
wants to say something about a contiguous run of cells should reach for it and label it.

Still unexercised: `CellRow.offset`, which is there for string matching's pattern shift `s`.

**A trap worth recording, found by looking at the first screenshot.** On this renderer, membership
of the structure is the _bracket_, not the fill — a cell inside the stack is painted `rest` exactly
like a cell outside it. The first legend read `['rest', 'in the array, but outside the stack']`,
which was simply false for the eight cells inside the bracket. `tests/legends.test.ts` passed it,
because it checks _which_ colours appear and cannot check what the words claim. Word a cells legend
for what the colour marks, and let the bracket speak for membership.

**R3 as it stands. ✅ Complete.** `src/visualizers/tree.ts` serves every tree in Parts III–V from
one module, and the two decisions that made that possible were taken before a line of chapter 12
was written:

- **A node is a box sized to its keys, not a circle.** A B-tree node holds several keys and a
  binary node holds one; one shape with the width following the key count meant chapter 18 needed
  **no renderer work at all**. A single-key node gets fully rounded ends, so it still reads as the
  circle a textbook draws, and grows to fit a long key — an interval tree's `[16, 21]`.
- **Layout is by leaf slot**, and an explicitly `null` child consumes a column. That is what makes
  a lean visible, and it hands the recorder control of the NIL squares without a flag: a leaf that
  declares no children draws nothing under it, and one that declares `[null, null]` draws both —
  which is what a red-black tree wants, because its black heights are counted through them.

Three things were added while the chapters were written, each because a chapter needed it:

- **`TreeData.roots`** — a forest. Huffman's queue is a stand of separate trees that merge two at a
  time, and a disjoint-set forest is one tree per set; both are unreadable if they overlap, so
  extra roots are laid out left to right with a gap.
- **Edge roles** (`hi.edges`, keyed `'parent>child'`), for the same reason the cells renderer has
  arc roles: following a pointer _is_ the step in a tree search, and there is often no node to
  colour that says which way the walk went. `rolesForEdges` is exported and counted by
  `tests/legends.test.ts`.
- **The level height is capped, not just divided out.** A five-procedure pseudocode panel makes the
  canvas 1200px tall, and a four-level tree given all of it becomes small nodes floating a long way
  apart. Spare height goes to the margins.

**Attribute badges are E6's channel**, and every augmented structure uses them: a red-black
colour, an order-statistic size, an interval's `max`, a disjoint-set rank. They are drawn from the
neutral ramp and never appear in a legend, so the fill stays free to say what the algorithm is
doing — a node can be red _and_ the one being rotated.

**Three scope decisions worth having written down**, all made the same way as chapter 10's queue:

- **Red-black deletion and B-tree deletion are prose, not players.** Both are the insertion idea
  inverted with more cases, and both would roughly double their chapter's pseudocode panel. The
  fixups that teach the idea are animated.
- **Chapter 19 is one player, not two.** `connected-components` was listed as a separate algorithm,
  but it _is_ the script a disjoint-set forest runs — make a set per vertex, walk the edges, union
  the ends — so a second module would have been the same trace with a different name.
- **Three procedure blocks are transcriptions of prose rather than of pseudocode** (`OS-INSERT`,
  `INTERVAL-INSERT`, and a four-line `B-TREE-SPLIT-CHILD` standing in for the book's seventeen).
  Each says so in a comment where it is defined. The B-tree case is the one worth defending:
  thirteen of those seventeen lines are the index shuffling that moves keys along inside an array,
  which chapter 2 already taught and which the picture does not show.

**R4 as it stands. ✅ Complete.** `src/visualizers/graph.ts` serves the whole of Part VI. Three
decisions, all taken before chapter 20 was written:

- **The recorder owns the layout, and it is fixed for the whole trace.** A graph has no canonical
  drawing and, unlike a tree, nothing in the structure to derive one from. Anything computed per
  frame would move vertices as the algorithm ran, which is the one thing a graph animation must
  never do: the reader is tracking where the search has got to. So a vertex carries a normalized
  `x`/`y` chosen by the code that built the network — source-left/sink-right for a flow network, two
  columns for a bipartite graph, topological layers for a DAG, a jittered grid for everything else.
  A snapshot whose vertices carry no position is laid out on a circle, which is what a graph the
  reader **typed** gets, and that is the honest thing to draw: there is nothing in an edge list to
  infer a layout from, and a guessed one would look like it meant something.
- **An edge takes a role colour, and here it carries more than the vertices do.** Half of Part VI is
  about which edges are in the answer — DFS tree edges, the edge being relaxed, the light edge
  crossing a cut, the augmenting path. `rolesForGraphEdges` is exported and counted by
  `tests/legends.test.ts`, and it resolves either orientation on an undirected graph so a recorder
  cannot silently name an edge the wrong way round.
- **`scope` is a ring per vertex, not a hull.** The members of a set in a graph are rarely next to
  each other, and a hull round scattered vertices swallows everything between them. The ring is the
  queue, the search stack, the frontier, the cut.

Two things were added by looking at the first screenshots, and neither was catchable by a test:

- **Everything that hangs off a vertex needs reserved room** — the badge on the top-right shoulder,
  the variable name underneath, the set caption along the top. All three were being cut in half at
  the canvas edge. The bands are reserved **unconditionally** rather than measured per step: the
  renderer cannot know from one snapshot whether another step has a caption, and a band that
  appeared only when used would move every vertex as the reader stepped through.
- **A ring round every vertex says nothing.** Chapter 24's ring is the residual-reachable set, which
  early in a run is the whole graph. It is now drawn only once it is a **proper** subset — so the
  ring means "a cut is forming", and on the last step it is the minimum cut itself.

**`badge.ts` came out of `tree.ts` to get here.** E6's pill is now one module both renderers import.
Two copies of it would have been two chances for a filled and a hollow badge to stop being told
apart by shape, which is the whole point of the decision.

**E4's widening was called in, and it cost one line.** `AlgorithmInput` is now
`number[] | GraphInput`, exactly as the E4 entry promised, because a graph cannot be described by
two bounds and encoding one as a list of numbers would make the reader type the encoding. The bill
beyond that line: a `size`/`traceMaxValue` guard each in `player.ts`, `structuredClone` instead of
`.slice()` in the test suite, and a `verify: (input: number[], …)` annotation on the twenty
array-shaped modules — bivariance on the **method** declarations is what kept that from being a
rewrite. `isGraphInput` is the narrowing helper.

**R5 as it stands. ✅ Complete.** `src/visualizers/grid.ts` draws tables: dynamic-programming
tables, matrices, transition tables, and chapter 32's text-over-pattern strips. It exists for one
narrow reason — **a dynamic-programming table is not a picture of a structure, it _is_ the
algorithm**, and what makes one teachable is seeing which already-filled cells the current one is
computed from. That is a relationship between three or four cells in a grid, and no other renderer
on the site can express it.

- **Arrows are a first-class highlight.** `hi.arrows` draws cell to cell and takes a role colour, so
  `rolesForArrows` is exported and counted by `tests/legends.test.ts`. Reconstructing the answer at
  the end of a DP run is a walk along them, and the FFT's butterfly is four of them at once.
- **A cell carries a `note` as well as a value** — the split point, the back-pointer, the state, the
  `L`/`U` triangle a factorization is in. A second fact in the same box, told apart by size and
  position rather than by a second hue, because a choice is data and E6 applies.
- **`scope` is a rectangle**, not a per-vertex ring as on R4: the interesting subsets of a table are
  contiguous — a row, a diagonal, a subproblem's region — so the bounding box is honest.
- **A recorder must emit the table at its final size from the first frame**, with unfilled entries
  as `null`. A table that grows rescales every cell mid-run, which the reader sees as something the
  algorithm did. KMP is the case that found this: with `q = 0` near the end of the text the pattern
  aligns past the last character, so the text row now carries `m − 1` empty columns to hang off.

Three fixes came from looking at screenshots, and none was catchable by a test: the scope caption
was printing through the column headings; pointer markers were landing on them (they are now grouped
by **column** into a two-line heading band, so a marker never covers a column's own label — harmless
when that label is an index, fatal when it is a letter of a sequence); and the corner note was drawn
in the neutral ramp, which made an LCS table's arrows invisible against a filled cell. The value
font is also fitted to the longest cell text, because chapter 30's `3.0+1.4i` is eight characters
where chapter 14's is one.

**`AlgorithmInput` was widened a second time**, to `number[] | GraphInput | TextInput`, for chapter
14's two sequences and chapter 32's text and pattern. One line again, plus one guard each in
`player.ts` and the suite. `isTextInput` is the narrowing helper.

### Landed alongside Phase A, not tracked as E-items

Small platform changes chapter 5, 8 and 9 forced. None of them is array-shaped, so none should need
revisiting during Phase B.

- **Aux rows are declared by the module.** `AlgorithmModule.aux` is a list of
  `{ key, label, hint }`, and a step fills them through `hi.aux[key]` with an `AuxBuffer` of
  `{ values, ptr, labels }` (1-indexed, like `Step.array`; `labels` captions the chips, which is
  what makes counting sort's `C[0‥k]` readable). This replaced the hardcoded `id === 'merge-sort'`
  branch in `AlgorithmPlayer.astro` and the merge-sort/insertion-sort special cases in the player's
  `renderAux`. A declared row that no step ever fills is a test failure, not a silent empty strip.
- **The renderer understands four more highlight keys**: `doneSet` (an explicit list of settled
  indices — counting and radix sort fill their output out of order, so neither a prefix nor a
  suffix describes what has settled), `marks` (the plural of `pivot`, for `MIN-AND-MAX`'s two
  running answers and `SELECT`'s five-element groups), `reading`, and `source` — the last of which
  merge sort had been emitting since day one while `rolesForStep` silently ignored it.
- **`null` and ±∞ render properly.** A `null` slot is an empty dashed outline, which is how
  counting sort's output array can start empty and fill; ±∞ draws a labelled stub rather than a
  NaN-height bar. The player's `maxValue` is now scanned over the whole trace, so
  `HEAP-INCREASE-KEY` raising a key above anything in the input no longer overflows the plot.
- **The narration box reserves three lines, not two.** Chapters that explain _why_ a step happened
  narrate in whole sentences; at two lines every such step shifted the transport by 8px.

---

## Phase roadmap

| Phase | Theme                 | New renderer | Chapters | Algorithms |
| ----- | --------------------- | ------------ | -------- | ---------- |
| ✅    | Shipped               | R1           | 3        | 4          |
| ✅    | Array-bars content    | —            | 3        | 11         |
| ✅    | Engine generalization | —            | 0        | 0          |
| ✅    | Data structures       | R2, R3       | 9        | 18         |
| ✅    | Graphs                | R4           | 5        | 12         |
| ✅    | Grids and matrices    | R5           | 6        | 17         |
| ✅    | Remainder and prose   | R6           | 13       | 22         |
| ✅    | Tier 2, first batch   | —            | 8 again  | 9          |

**All six phases are closed.** The phases were ordered so that no phase waited on a renderer a later
phase would build, and none did. The final count is 35 chapters, 4 appendices, 79 players and 6
renderers; [housekeeping](#housekeeping) is closed too.

**Phase G is the first promotion out of the [Tier-2 backlog](#tier-2-backlog), and it is optional in
a way A–F were not.** Nine rows, chosen because each teaches something no player on the site
currently shows; it revisits eight chapters rather than writing any, and it is the first phase whose
chapters were already ✅ before it started.

### Phase A — everything the current renderer already serves

No new renderer. Two small engine items, three chapters, and two backfills into chapters that are
already live but only cover part of their sections.

- [x] **E1** — test contract (do this first; ch 5 and 9 cannot be committed without it)
- [x] **E5** — complexity rows
- [x] **§6.5 backfill** — max-priority-queue procedures into the existing heapsort chapter
- [x] **§7.3 backfill** — randomized quicksort into the existing quicksort chapter
- [x] **Ch 5** — Probabilistic Analysis and Randomized Algorithms
- [x] **Ch 8** — Sorting in Linear Time
- [x] **Ch 9** — Medians and Order Statistics

Note: **chapter 4 is not in this phase.** In the 4th edition its numbered sections are matrix
multiplication and Strassen's algorithm — both grid work — so it sits in Phase E. Maximum subarray
moved to Problem 4-1 and is Tier 2.

### Phase B — the gate

**Complete.** No chapters shipped, which was the point: everything after it depends on these seams.

- [x] **E2** — `Step` payload
- [x] **E7** — verify the tape survives
- [x] **E4** — input model
- ~~**E3** — renderer dispatch~~ → moved to Phase C, to be written against R2. See its entry above
  for why, and for what that does and does not relax.

### Phase C — data structures (R2 cells, R3 tree)

Book order within the phase, but build E3 and R2 before ch 10, and R3 before ch 12.

- [x] **E3** — renderer dispatch _(first: R2 is written against it, not retrofitted into it)_
- [x] **R2** — cells/pointers renderer _(boxes, rows, scope bracket, pointer labels, and pointer arcs in labelled `next`/`prev` lanes)_
- [x] **Ch 10** — Elementary Data Structures _(§10.1–10.3 in prose; `stack` and `linked-list` players. The queue is prose only — its ring is the same row of boxes with two markers, and a third cells recorder would have taught nothing the stack has not)_
- [x] **Ch 11** — Hash Tables _(§11.1–11.4 in prose; `chained-hash` and `open-addressing`. The multi-row grid needed layout work before either could be drawn)_
- [x] **Ch 16** — Amortized Analysis _(§16.1–16.4 in prose; `multipop`, `binary-counter` and
      `dynamic-table`. Here rather than Phase A because all three want cells, not bars — and the
      renderer needed nothing new, which is the first time that has been true of a Phase C chapter)_
- [x] **R3** — tree renderer _(nodes sized to their keys so a B-tree needs no second renderer, layout by leaf column so a lean is visible, forests, NIL squares, edge roles, attribute badges)_
- [x] **E6** — data-colour decision _(taken before R3 rather than before ch 13: it decides how a node is drawn, so the renderer had to know it)_
- [x] **Ch 12** — Binary Search Trees _(§12.1–12.3; `bst`)_
- [x] **Ch 13** — Red-Black Trees _(§13.1–13.4 in prose; `red-black-tree` animates insertion. RB-DELETE is prose only — the same idea with four cases instead of three, and the insertion fixup is where it is learnable)_
- [x] **Ch 15** — Greedy Algorithms _(§15.1–15.4; `activity-selection`, `huffman`, `offline-caching`. The interval strip needed no R2 work at all — `CellRow.offset` was already the right primitive)_
- [x] **Ch 17** — Augmenting Data Structures _(§17.1–17.3; `order-statistic-tree`, `interval-tree`)_
- [x] **Ch 18** — B-Trees _(§18.1–18.3; `b-tree` at t = 2. The multi-key node model was designed into R3 up front, so this chapter cost no renderer work)_
- [x] **Ch 19** — Data Structures for Disjoint Sets _(§19.1–19.4; `disjoint-sets`, whose script **is** CONNECTED-COMPONENTS — see the R3 note for why that is one player and not two)_
- [ ] Optional: heap-as-tree view for ch 6, now that R3 exists _(still available, still optional: R3 would draw it unchanged)_

### Phase D — graphs (R4)

- [x] **R4** — graph renderer _(recorder-owned fixed layout, weight chips, dashed residual edges,
      role-coloured edges, per-vertex scope rings, E6 badges)_
- [x] **Ch 20** — Elementary Graph Algorithms _(§20.1–20.5; `bfs`, `dfs`, `topological-sort`,
      `strongly-connected-components`. The transpose is drawn — every arrow reverses in one frame)_
- [x] **Ch 21** — Minimum Spanning Trees _(§21.1–21.2; `mst-kruskal`, `mst-prim`. Kruskal's rings
      are chapter 19's disjoint sets, and Prim's key drop is chapter 6's DECREASE-KEY)_
- [x] **Ch 22** — Single-Source Shortest Paths _(§22.1–22.5; `bellman-ford`, `dag-shortest-paths`,
      `dijkstra` — one RELAX, three orders. §22.4's difference constraints are prose)_
- [x] **Ch 24** — Maximum Flow _(§24.1–24.3; `ford-fulkerson` and `edmonds-karp` as the same method
      with the path choice pinned down. Residual edges are dashed and come and go with the flow)_
- [x] **Ch 25** — Matchings in Bipartite Graphs _(§25.1; `bipartite-matching`. One player — see the
      scope note below, and the edition caveat)_

**Three scope decisions in this phase**, recorded the way Phase C's were:

- **Chapter 25 is one player.** `hopcroft-karp` was listed as a Tier-1 algorithm; it is a phase-based
  refinement of the same augmenting-path idea and needs a second layer of machinery — layered BFS
  plus a maximal set of vertex-disjoint paths — on top of what the player already shows. It is in
  the [backlog](#tier-2-backlog) now, alongside the weighted assignment problem.
- **Ford-Fulkerson shows the path it found; Edmonds-Karp shows the search that found it.** Emitting
  the residual search step by step in both would have doubled two already long traces to say the
  same thing twice. §24.3's point _is_ the search, so that is where it is drawn, and the two
  chapters' comparison section points at the trace tape for the difference.
- **`connected-components` is not a chapter-20 algorithm here.** It shipped in chapter 19 as the
  script a disjoint-set forest runs, so chapter 21's Kruskal is where Part VI meets it again.

**The chapter 25 edition caveat is now resolved — and chapter 25 is not finished.** Photographs of
the 4e contents (2026-08-30) confirm the guess that §25.1 is maximum bipartite matching, and show
two further numbered, unstarred sections that were not built: **§25.2 the stable-marriage problem**
(Gale-Shapley) and **§25.3 the Hungarian algorithm for the assignment problem**. Both sat at Tier 1
by this file's own rule, and **both have since been built** — see the top of the
[Phase F](#phase-f--remainder-and-prose) checklist.

Two corrections to §24 came out of the same check. **Edmonds-Karp is inside §24.2**, not a section
of its own, and **§24.3 is maximum bipartite matching** — the flow reduction, which chapter 24 now
covers in prose and which chapter 25's player then runs without the plumbing.

### Phase E — grids and matrices (R5)

- [x] **R5** — grid renderer _(row/column headings, per-cell value and note, cell-to-cell arrows, a
      rectangular scope, and a value font fitted to the longest entry)_
- [x] **Ch 4** — Divide-and-Conquer _(§4.1–4.6; `matrix-multiply`, `strassen` at the 2 × 2 base case.
      §4.3–4.5 are prose: substitution, recursion trees and the master method are techniques for
      reasoning on paper, not algorithms with a state to draw, and the chapter works all three
      through its own recurrences instead)_
- [x] **Ch 14** — Dynamic Programming _(§14.1–14.5; `rod-cutting`, `matrix-chain-order`, `lcs`,
      `optimal-bst` — four fill orders, and every one of them reconstructs its answer from the
      stored choices at the end)_
- [x] **Ch 23** — All-Pairs Shortest Paths _(§23.1–23.3; `apsp-matrix-multiply`, `floyd-warshall`,
      `transitive-closure` on the grid, `johnson` on the graph renderer — the reweighting is a graph
      transformation, and the V runs of Dijkstra are chapter 22's player)_
- [x] **Ch 28** — Matrix Operations _(§28.1–28.3; `lup-decomposition`, `lup-solve`. See the scope
      note below)_
- [x] **Ch 30** — Polynomials and the FFT _(§30.1–30.3; `iterative-fft`. See the scope note below)_
- [x] **Ch 32** — String Matching _(§32.1–32.4; `naive-string-matcher`, `rabin-karp`,
      `finite-automaton-matcher`, `kmp` — all four on the same text-over-shifted-pattern picture, so
      they can be compared directly)_

**Three scope decisions, and they moved four Tier-1 rows to the [backlog](#tier-2-backlog).** Each
follows chapter 19's precedent — a second player is not worth building when it would replay a trace
the reader has already stepped through, under a different name.

- **`recursive-fft` (§30.2) is prose.** It and `ITERATIVE-FFT` compute the _same butterfly diagram_;
  §30.3's own content is that the recursion's leaf order is the bit-reversal permutation and its
  combine steps are the stages. The iterative player is therefore the recursive algorithm with the
  recursion unrolled, and its first row is the recursion's fingerprint. A separate player would show
  the same values arriving in a different order — a fact about control flow, not about the
  transform.
- **`matrix-inverse` (§28.2) is prose.** Inverting is LUP-SOLVE run n times with the columns of the
  identity as right-hand sides: literally the same trace, n times over. What is genuinely distinct —
  that inversion and multiplication are equally hard — is a theorem, and the chapter states it.
- **`least-squares` (§28.3) is prose.** It is chapter 4's matrix multiplication to build `AᵀA` and
  `Aᵀy`, then LUP-SOLVE. Both players are already on the page; what is distinct is that
  positive-definiteness makes pivoting unnecessary, which is again a theorem.

**A trap this phase found, worth knowing before writing another chapter.** MDX has **indented code
blocks disabled**, so a four-space-indented display equation is a _paragraph_ — and any braces in it
are parsed as a JSX expression. `y_{k+m/2}` failed the build with `ReferenceError: k is not defined`,
and the other indented blocks were silently rendering as prose. Use fenced blocks, which is what
every chapter written before this phase already did.

> Worth considering: **chapter 14 is the single most-wanted visualization in the book.** If the
> schedule slips, promoting R5 + ch 14 to immediately after Phase B buys more reader value than
> anything in Phase C.

### Phase F — remainder and prose

**The three Tier-1 gaps the contents check exposed are closed.** They were the only places where a
✅ would have been describing an incomplete chapter; chapters 25 and 32 are now genuinely complete
at Tier 1, and Hopcroft-Karp is the only thing left in either, catalogued as Tier 2.

- [x] **§25.2 `gale-shapley`** — the stable-marriage problem. The preference-table worry came to
      nothing: the graph renderer draws only the proposals **actually made**, so the picture is the
      round's history as well as its state, and the current proposer's list lives in the aux strip
      one at a time. Stability is verified by its definition — every unmatched pair tested for
      mutual preference.
- [x] **§25.3 `hungarian`** — the assignment problem, on the grid: potentials are the row and
      column headings and each cell notes its slack, so a tight pair is a visible zero. Verified
      twice over — against brute force on all n! assignments, and against its own duality
      certificate, Σu + Σv equalling the cost.
- [x] **§32.5 `suffix-array`** — prefix doubling, with each suffix drawn at its own `offset` so
      the rows form a staircase under the text they came from and the row labels _are_ the suffix
      array. Ends with the two binary searches, which is what the structure is for.

Then the rest, in book order:

- [x] **Ch 1** — The Role of Algorithms in Computing _(prose)_ — §1.1's problem-versus-algorithm
      distinction, and §1.2's arithmetic worked through: the slow machine running merge sort in an
      interpreted language beats the fast one running insertion sort in assembly by 17× on ten
      million elements, and the gap only widens.
- [x] **Ch 3** — Characterizing Running Times _(prose, plus `asymptotic-bound` on R6 — the optional
      plot, built)_ — the player draws the Θ definition's two quantifiers. **It plots the ratio
      f(n)/n², not f.** §3.2's own figure draws f between c₁·n² and c₂·n², and over the two dozen
      values of n needed to see f settle a quadratic grows 600×, so the crossing happens in the
      bottom few pixels; dividing out n² is the same statement with the scale removed. The band
      becomes horizontal and n₀ is visibly where the ratio enters it. Its `verify` checks n₀ is both
      sufficient and minimal, and checks the inequality that makes the band always close,
      |f/n² − a| ≤ (|b| + |c|)/n. **The chapter's best moment is a disagreement**: §3.2 gets n₀ = 7
      on ½n² − 3n with its constants; this player gets 12 with blunter ones, and both are right.
- [x] **Ch 26** — Parallel Algorithms _(`p-fib` §26.1 on R3, `p-matrix-multiply` §26.2 on R5,
      `p-merge` §26.3 on R2)_ — the renderer question in the table resolved to **all three**, one per
      section, and no new renderer was needed. Work and span are computed exactly rather than
      asymptotically and each `verify` re-derives both from the DAG: p-fib's by counting strands and
      finding the longest path afresh, p-matrix-multiply's by asserting work is still n³ and span is
      n + 1, p-merge's by testing §26.3's **3/4 bound on every recursive call** — an implementation
      that halved the shorter run would merge perfectly and quietly have a linear span.
      **Scope decision: P-MERGE-SORT itself is not a player.** It is chapter 2's merge sort with a
      `spawn` in front of one call and `p-merge` in place of the other, so a player for it would
      replay a trace already on the site — the same reasoning that sent `recursive-fft` to the
      backlog. P-MERGE is the section's actual contribution and is what got built.
- [x] **Ch 27** — Online Algorithms _(§27.1 the elevator is prose; `move-to-front` §27.2 and
      `online-caching` §27.3 are players)_ — the chapter's measure is the **competitive ratio**, so
      both verifies compute the offline optimum and assert the bound against it: move-to-front's
      exactly, by DP over every reachable list order, and LRU's by Belady's rule from §15.4. The two
      brackets are the chapter in one mark — chapter 15's points forward over the requests still to
      come, this one backward over those already served, which is all an online policy may see.
- [x] **Ch 29** — Linear Programming _(prose; 4e drops simplex, so there is no procedure to animate)_
      — formulations, modelling, and duality as the chapter's real payload: weak duality makes a dual
      solution a **certificate**, and strong duality is what turns max-flow min-cut, König's theorem
      and the Hungarian algorithm's potentials into three faces of one result. Integer programming's
      NP-hardness is the sharpest demonstration in the book that difficulty lives in the details of a
      specification.
- [x] **Ch 31** — Number-Theoretic Algorithms _(`extended-euclid` §31.2, `modular-exponentiation`
      §31.6, `rsa` §31.7; §31.4 and §31.5 are prose, being consequences of the first; §31.8 is ★, so
      Miller-Rabin stays Tier 2)_ — extended Euclid is drawn as two passes in opposite directions
      over one table, and its generator builds inputs backwards from the answer so the size slider
      means "how many divisions". The generative test found a real RSA pitfall: an exponent
      congruent to 1 mod λ(n) makes the cipher the identity, which both the generator and the parser
      now refuse — and that guard turned out to be necessary without being sufficient, which the
      suite found intermittently while chapter 35 was being built. A message is fixed whenever its
      own order divides e − 1, so a handful of random messages can all be fixed by an e nowhere
      near 1 mod λ. Both now encrypt the actual message and look.
- [x] **R6, the plot renderer** — the last of the six, and no longer optional: chapter 33's three
      algorithms have no structure to draw at all. `src/visualizers/plot.ts` handles scattered
      points, polyline series, point-to-point links, reference rules and a scope box, with **the
      axis ranges owned by the recorder and fixed for the whole trace** — the graph renderer's
      layout rule again, and with more force, since a centroid that appeared to move because the
      axis rescaled would be a lie about the algorithm. A link is first-class because it is usually
      the cost: k-means' spokes squared _are_ its objective function. `tests/renderers.test.ts` now
      asserts every kind in `VisualizerKind` has a loader, which is a real invariant rather than a
      note about what is unwritten.
- [x] **Ch 33** — Machine-Learning Algorithms _(`k-means` §33.1, `multiplicative-weights` §33.2,
      `gradient-descent` §33.3, all on R6)_ — three algorithms with three grades of promise, and each
      `verify` asserts exactly the one its section proves and no more. k-means gets only "it reached
      a fixed point, and it got there downhill", because that is all §33.1 claims. Gradient descent's
      descent guarantee is **conditional**, so the check computes ηL per step from the curvature the
      step crosses and requires the decrease only where the theorem applies — the generative test
      found the unconditional version was false at η = 0.8. Multiplicative weights gets the regret
      bound itself, on top of a replay of the weights from scratch.
- [x] **Ch 34** — NP-Completeness _(prose, with the reduction chain as a diagram)_ — polynomial time
      as a robust definition rather than a good one, NP as checking rather than finding, and the
      thing most worth getting right: **the arrow points from the known-hard problem to yours**.
      Reduce a known NP-complete problem _to_ your problem, never the other way. The chain
      CIRCUIT-SAT → SAT → 3-CNF-SAT → {CLIQUE → VERTEX-COVER → HAM-CYCLE → TSP, SUBSET-SUM} is drawn,
      and the chapter ends by pointing at the three exits: approximate, exploit the instance, or
      change the problem.
- [x] **Ch 35** — Approximation Algorithms _(`approx-vertex-cover` §35.1, `approx-tsp-tour` §35.2,
      `greedy-set-cover` §35.3, `approx-subset-sum` §35.5; §35.4 is prose — two techniques rather
      than two algorithms, and 4e's chapter 29 has no simplex to animate)_ — every `verify` here
      computes the true optimum by brute force and asserts the section's bound on it: all 2^V vertex
      subsets, Held-Karp over all 2^V·V tours, every subfamily of F, and all 2ⁿ subset sums. The
      chapter is the one place where that is not extravagance but the subject, since a ratio is
      meaningless without the optimum it is a ratio to. Three of the four bounds are visible on the
      picture as well — the matching, the spanning tree, the length of L.
- [x] **Appendix A** — Summations — the three series that carry the book — arithmetic for Θ(n²), geometric for why divide-and-conquer is cheap and why a doubling table is Θ(1) amortised, harmonic for every surprising lg n — and the three ways to bound a sum you cannot evaluate.
- [x] **Appendix B** — Sets, Etc. — a glossary, written to flag the four definitions that turn out to be load-bearing: equivalence classes are what union-find maintains, partial orders are what a topological sort extends, "simple" is what makes longest-path NP-hard, and n − 1 edges is what Kruskal counts.
- [x] **Appendix C** — Counting and Probability — **linearity of expectation** as the technique, since it needs no independence and independence is exactly what is usually missing — the indicator-variable pattern that produces chapter 5's hiring bound, quicksort's expected comparisons and universal hashing's chain length is written out as a pattern.
- [x] **Appendix D** — Matrices — the operations Parts IV and VII assume, and the observation that four chapters use a matrix to mean four different things — adjacency, transition, DP table, transformation. The (min, +) semiring substitution is the one worth remembering, since it is what lets chapter 23 run one triple loop for shortest paths, closure and products alike.

### Phase G — the first Tier-2 promotion

Nine players across eight chapters that are already ✅ at Tier 1. **Every chapter here keeps its
Tier-1 spine untouched**: a promoted algorithm goes in a trailing `## Beyond the numbered sections`
heading at the end of the chapter, and in five of the eight the "What is not here" paragraph that
already names the algorithm becomes that section's introduction. The tier stays legible to the
reader, which is the point — these are exercises, problems and starred sections, and a page that
blurred them into the numbered ones would be claiming the book covers more than it does.

Batched so the convention is settled on the cheapest chapter first, the one engine change is
isolated, and the one large item stands alone.

- [x] **G1** — ch 2 and ch 7 on R1: `binary-search` (Ex. 2.3-6), `count-inversions` (Prob. 2-4),
      `hoare-partition` (Prob. 7-1). The pilot: it settles the trailing-section convention on the
      most-read chapter, and all three reuse scaffolding that already exists. Binary search is the
      highest-value row in the backlog — chapters 12, 26 and 32 all invoke one and none has a
      picture of it.

- [x] **E8** — the zero baseline. Landed on its own, and the no-op promise is asserted rather than
      eyeballed: a screenshot comparison cannot check it, because most players generate a random
      input and two runs differ for reasons unrelated to the change. The arithmetic came out of
      `draw()` as `barSpan`, and `tests/array-bars-axis.test.ts` writes out the old formula and
      checks the new function against it across the whole range. That test found the one case that
      would have moved — on an axis starting at zero there is no _below_ to draw in, so a −∞ stub
      would have hung outside the plot.
- [x] **G2** — ch 4: `maximum-subarray` (Prob. 4-1), the row E8 unblocked. **It is one player
      running two algorithms** — the divide-and-conquer, then Problem 4-1(d)'s single pass, on the
      same input and arriving at the same answer — because the two halves of the trace tape are the
      comparison the problem is really about. Two things only the screenshots caught: a bar hanging
      the full depth of the plot printed its value on the index labels, so a **signed** chart now
      reserves a fourth label lane below the bars; and the default input parser rejected a leading
      minus, so a reader could watch this and not type a case for it.
- [x] **G3** — ch 20 and ch 22 on R4: `articulation-points` (Prob. 20-2, with bridges) and
      `difference-constraints` (§22.4). Neither needed new machinery. **Chapter 22 now has a player
      for every one of its numbered sections**, which is what §22.4 being Tier 1 by this file's own
      rule always implied. The reduction is what the second player draws — the input box takes
      inequalities and the picture is the graph they become — because a player that only re-ran
      Bellman-Ford would have taught nothing chapter 22 had not.
- [x] **G4** — ch 25: `hopcroft-karp` (§25.1), alone, being the only row that added a layer of
      machinery rather than reusing one. **Chapter 25 now has a player for everything in it.** Two
      lines carry the algorithm and neither is the augmentation: `level[M[v]] == level[u] + 1`
      keeps a path shortest, and `level[u] = ∞` on the way out keeps the paths disjoint. `verify`
      asserts the property the algorithm exists for — the shortest augmenting path grows strictly
      every phase — rather than the O(√V) bound, which at ten vertices a lazy one-path-per-phase
      implementation would also satisfy.
- [x] **G5** — ch 31 and ch 32 on R5: `miller-rabin` (§31.8 ★) and `boyer-moore` (from ch 32's
      problems — the number is not asserted, since `toc-4/` can no longer settle it). Both slotted
      into a comparison their chapter had already set up, and neither needed renderer work.

**What G1 landed, and what the rest of Phase G inherits from it.** The trailing section works and
is the convention now. Two of the three findings are about the renderer rather than about any of
those algorithms:

- **`array-bars` has exactly two label lanes.** A third marker over adjacent bars goes back into
  lane 0, on top of the first. `low`/`mid`/`high` collided that way at 375px and `p`/`q`/`r` does
  not — which is also what MERGE-SORT calls them, so binary search's line 4 is now merge sort's
  line 2 character for character.
- **`rolesForStep` already claims some short names.** It reads `r` as merge's right-hand index and
  paints it `look`, so emitting a search bound under that name painted a bar as though it were
  being read, on every step. Invisible to every test and obvious in one screenshot. **Read
  `rolesForStep` before choosing a highlight key, not after.**

One test changed shape with them: the well-formed check measured a snapshot against
`input.length + 1`, which holds only until a module packs a parameter in front of its values. It
now measures through `inputSize` — the module's own answer, and the one the player puts in the n
readout.

---

### Phase H — search

Not a chapter and not an algorithm: the first cross-cutting **feature** since the deploy. The book
was finished and had no way to find anything in it — the home-page outline, the sidebar and the
prev/next pager are all positional, so a reader who remembered a sentence but not a chapter number
had nowhere to start.

Full-text search with BM25F ranking, built at build time and shipped as two static JSON files. No
service, no WASM, no runtime dependency: the corpus is 345 KB of MDX, 3,943 unique terms and 30k
(term, document) pairs, which is small enough that the whole index gzips to about 100 KB. Pagefind
was considered and rejected — it indexes rendered HTML, so every player's legend, narration and
transport chrome becomes page noise, it cannot tell an algorithm from a paragraph, and it cannot
deep-link into a player.

**340 documents, two kinds.** A section is one `##` or `###` of a chapter, deep-linked to the anchor
Astro already emits; an algorithm is one of the 88 registered modules, carrying its pseudocode, its
complexity and the wording of its legend, and linking to the heading its `<AlgorithmPlayer>` sits
under so Enter lands on the player.

- [x] **H1** — the analyzer and the BM25F core. `src/search/{tokenize,stem,bm25,query,snippet}.ts`,
      all DOM-free and imported straight into `node --test`, plus a vendored Porter stemmer checked
      against the published vectors. Three rules the corpus forced: Θ occurs 775 times and § 478, so
      the maths is spelled out as words a reader can type; `red-black`, `EXTRACT-MIN` and `§22.3`
      emit their parts _and_ the parts joined; and `if`/`then`/`while`/`return` are not stopwords,
      because the documents include pseudocode.
- [x] **H2** — the corpus, the two endpoints and `tests/search-ranking.test.ts` — thirty golden
      queries against the real index, which is the only thing keeping the weights honest. Writing it
      found that BM25F has no notion of a title being used up: "partition" put §7.1 "Partitioning"
      sixth, behind five algorithms that merely mention PARTITION in a field weighted 8.
- [x] **H3** — the dialog. Native `<dialog>` + `showModal()`, ARIA combobox, Ctrl/⌘-K and `/`. The
      browser pass in `verify:players` found three real bugs on its first run, two of them in the
      check rather than the product — see the notes below.
- [x] **H4** — `/search`, seeded from `?q=`, with a `<noscript>` static index of the whole site.
- [x] **H5** — this entry, the CLAUDE.md rules, and the CI job rename.

**What the ranking is, in one place.** BM25F rather than a sum of per-field BM25 scores, which would
pay a document twice for one occurrence sitting in two fields. Five fields — name 8, title 5, head
3, code 2.5, body 1 — folded into one pseudo-frequency **at build time**, because every term in it
is a fact about the corpus and none is a fact about the query. That halves the payload and makes
retuning a rebuild rather than a console away, which is the right side of the trade for an index
rebuilt on every deploy. Field averages are taken over the documents that _have_ the field: over all
of them, `name` (which only the 88 algorithms carry) would average to a fraction of a term and every
algorithm would be penalised for having a name at all.

**Three things that are deliberately not BM25.** A prefix expansion is damped and scored `max` per
document, not summed, or a document is rewarded for holding twenty words starting with "s". A term
with no postings is retried at a bounded edit distance, so `quicksot` finds Quicksort. And an exact
title match multiplies by 2.2 — narrow on purpose, set equality against the whole title, no partial
credit. That last one then had a worse bug than the one it fixed: keyed to the raw query it appeared
only on the last keystroke of a word, so "partitio" ranked the section sixth and "partition" first
and the list jumped under the reader's cursor. It compares against what each word _resolved_ to now.

**A quoted phrase is checked against the text, not the index.** That is why the index carries no
positions at all, and why it costs 100 KB rather than three times that: retrieval is on the
individual words, and the phrase is confirmed by scanning the stored text of at most thirty
candidates.

**Lessons that cost time, all four worth keeping.**

- **A closed `<dialog>` clears `open` synchronously and fires `close` in a queued task.** Anything
  reading `document.activeElement` the moment `open` goes false catches the focus-restoring handler
  before it has run. It failed on about one run in three, at whichever width happened to be
  quickest — the exact shape of a bug that gets called flaky and muted.
- **`waitForLoadState('networkidle')` returns immediately on an already-idle page**, so a click that
  navigates is read before it commits. `waitForURL` is the one that means anything.
- **`\p{No}` is not punctuation.** github-slugger drops superscripts, so §26.2's "…instead of n³"
  anchors at `…instead-of-n`. 212 of the site's 213 headings matched without it.
- **Fence tracking in the MDX chunker is load-bearing.** One line of `appendix-summations.mdx` reads
  `|x| < 1` inside a fenced block, and a tag-stripping regex let loose on it eats everything up to
  the next `>` on the page.
- **And one that only a screenshot caught, which is the rule this project already has.** The layout
  puts the dialog on every page, so `/search` has two elements carrying `data-el="search-results"` —
  and the dialog's comes first in the document. `mountSearchPage` used a bare `document.querySelector`
  and rendered every result into a closed `<dialog>`: the page said "38 results" above nothing at
  all. **The browser check passed**, because `querySelectorAll('.search-row')` finds rows inside a
  `display: none` dialog perfectly well. It now requires them to be inside the page's own container
  _and_ to have a height, and separately fails if any row lands in the dialog. The same shot showed
  the second problem: an algorithm's snippet was legend fragments and pseudocode joined with `·`,
  which reads as debris in a 220-character window, so that text is written as sentences now.

---

## Chapters

All 39, in book order. "Renderer" is what the chapter's players need — `—` means prose only.

### Part I — Foundations

| Ch  | Slug                           | Status | Phase  | Renderer | Tier-1 algorithms                                                                        |
| --- | ------------------------------ | ------ | ------ | -------- | ---------------------------------------------------------------------------------------- |
| 1   | `role-of-algorithms`           | ✅     | F      | —        | none — prose                                                                             |
| 2   | `getting-started`              | ✅     | — + G1 | R1       | `insertion-sort` ✅, `merge-sort` ✅ · Tier 2: `binary-search` ✅, `count-inversions` ✅ |
| 3   | `characterizing-running-times` | ✅     | F      | R6       | `asymptotic-bound` ✅ — the optional plot, built                                         |
| 4   | `divide-and-conquer`           | ✅     | E + G2 | R5 + R1  | `matrix-multiply` ✅, `strassen` ✅ · Tier 2: `maximum-subarray` ✅                      |
| 5   | `probabilistic-analysis`       | ✅     | A      | R1       | `hire-assistant` ✅, `permute-by-sorting` ✅, `randomize-in-place` ✅                    |

### Part II — Sorting and Order Statistics

| Ch  | Slug                           | Status | Phase  | Renderer | Tier-1 algorithms                                                                |
| --- | ------------------------------ | ------ | ------ | -------- | -------------------------------------------------------------------------------- |
| 6   | `heapsort`                     | ✅     | A      | R1       | `heapsort` ✅ · `max-priority-queue` (§6.5) ✅                                   |
| 7   | `quicksort`                    | ✅     | A + G1 | R1       | `quicksort` ✅ · `randomized-quicksort` (§7.3) ✅ · Tier 2: `hoare-partition` ✅ |
| 8   | `sorting-in-linear-time`       | ✅     | A      | R1       | `counting-sort` ✅, `radix-sort` ✅, `bucket-sort` ✅                            |
| 9   | `medians-and-order-statistics` | ✅     | A      | R1       | `minimum-maximum` ✅, `randomized-select` ✅, `select` ✅                        |

### Part III — Data Structures

| Ch  | Slug                         | Status | Phase | Renderer | Tier-1 algorithms                       |
| --- | ---------------------------- | ------ | ----- | -------- | --------------------------------------- |
| 10  | `elementary-data-structures` | ✅     | C     | R2       | `stack` ✅, `linked-list` ✅            |
| 11  | `hash-tables`                | ✅     | C     | R2       | `chained-hash` ✅, `open-addressing` ✅ |
| 12  | `binary-search-trees`        | ✅     | C     | R3       | `bst` ✅                                |
| 13  | `red-black-trees`            | ✅     | C     | R3       | `red-black-tree` ✅                     |

### Part IV — Advanced Design and Analysis Techniques

| Ch  | Slug                  | Status | Phase | Renderer | Tier-1 algorithms                                                     |
| --- | --------------------- | ------ | ----- | -------- | --------------------------------------------------------------------- |
| 14  | `dynamic-programming` | ✅     | E     | R5       | `rod-cutting` ✅, `matrix-chain-order` ✅, `lcs` ✅, `optimal-bst` ✅ |
| 15  | `greedy-algorithms`   | ✅     | C     | R2 + R3  | `activity-selection` ✅, `huffman` ✅, `offline-caching` ✅           |
| 16  | `amortized-analysis`  | ✅     | C     | R2       | `binary-counter` ✅, `multipop` ✅, `dynamic-table` ✅                |

### Part V — Advanced Data Structures

| Ch  | Slug                         | Status | Phase | Renderer | Tier-1 algorithms                                       |
| --- | ---------------------------- | ------ | ----- | -------- | ------------------------------------------------------- |
| 17  | `augmenting-data-structures` | ✅     | C     | R3       | `order-statistic-tree` ✅, `interval-tree` ✅           |
| 18  | `b-trees`                    | ✅     | C     | R3       | `b-tree` ✅                                             |
| 19  | `disjoint-sets`              | ✅     | C     | R3       | `disjoint-sets` ✅ — its script is CONNECTED-COMPONENTS |

### Part VI — Graph Algorithms

| Ch  | Slug                           | Status | Phase  | Renderer | Tier-1 algorithms                                                                                                |
| --- | ------------------------------ | ------ | ------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| 20  | `elementary-graph-algorithms`  | ✅     | D+G3   | R4       | `bfs` ✅, `dfs` ✅, `topological-sort` ✅, `strongly-connected-components` ✅ · Tier 2: `articulation-points` ✅ |
| 21  | `minimum-spanning-trees`       | ✅     | D      | R4       | `mst-kruskal` ✅, `mst-prim` ✅                                                                                  |
| 22  | `single-source-shortest-paths` | ✅     | D+G3   | R4       | `bellman-ford` ✅, `dag-shortest-paths` ✅, `dijkstra` ✅, `difference-constraints` ✅ (§22.4)                   |
| 23  | `all-pairs-shortest-paths`     | ✅     | E      | R4 + R5  | `apsp-matrix-multiply` ✅, `floyd-warshall` ✅, `transitive-closure` ✅, `johnson` ✅                            |
| 24  | `maximum-flow`                 | ✅     | D      | R4       | `ford-fulkerson` ✅, `edmonds-karp` ✅                                                                           |
| 25  | `bipartite-matching`           | ✅     | D+F+G4 | R4 + R5  | `bipartite-matching` ✅, `gale-shapley` ✅, `hungarian` ✅ · Tier 2: `hopcroft-karp` ✅                          |

### Part VII — Selected Topics

| Ch  | Slug                          | Status | Phase  | Renderer | Tier-1 algorithms                                                                                                                           |
| --- | ----------------------------- | ------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | `parallel-algorithms`         | ✅     | F      | R3+R5+R2 | `p-fib` ✅, `p-matrix-multiply` ✅, `p-merge` ✅ — P-MERGE-SORT is ch 2's sort with these two swapped in                                    |
| 27  | `online-algorithms`           | ✅     | F      | R2       | `move-to-front` ✅, `online-caching` ✅ — §27.1's elevator is an analysis, not an algorithm                                                 |
| 28  | `matrix-operations`           | ✅     | E      | R5       | `lup-decomposition` ✅, `lup-solve` ✅ — inverse and least squares are prose                                                                |
| 29  | `linear-programming`          | ✅     | F      | —        | **none** — §29.1–29.3 are formulations, modelling and duality; 4e drops simplex                                                             |
| 30  | `polynomials-and-the-fft`     | ✅     | E      | R5       | `iterative-fft` ✅ — `recursive-fft` is the same butterfly, so it is prose                                                                  |
| 31  | `number-theoretic-algorithms` | ✅     | F+G5   | R5       | `extended-euclid` ✅, `modular-exponentiation` ✅, `rsa` ✅ · Tier 2: `miller-rabin` ✅ (§31.8 ★) — §31.4 and §31.5 are prose               |
| 32  | `string-matching`             | ✅     | E+F+G5 | R5       | `naive-string-matcher` ✅, `rabin-karp` ✅, `finite-automaton-matcher` ✅, `kmp` ✅ (★ in 4e), `suffix-array` ✅ · Tier 2: `boyer-moore` ✅ |
| 33  | `machine-learning-algorithms` | ✅     | F      | R6       | `k-means` ✅, `multiplicative-weights` ✅, `gradient-descent` ✅                                                                            |
| 34  | `np-completeness`             | ✅     | F      | —        | none — §34.1–34.5 are definitions, reductions and proofs                                                                                    |
| 35  | `approximation-algorithms`    | ✅     | F      | R4+R5+R2 | `approx-vertex-cover` ✅, `approx-tsp-tour` ✅, `greedy-set-cover` ✅, `approx-subset-sum` ✅ — §35.4's randomization and LP are prose      |

### Part VIII — Appendices

| Ch  | Slug                                | Status | Phase | Renderer | Tier-1 algorithms |
| --- | ----------------------------------- | ------ | ----- | -------- | ----------------- |
| A   | `appendix-summations`               | ✅     | F     | —        | none              |
| B   | `appendix-sets`                     | ✅     | F     | —        | none              |
| C   | `appendix-counting-and-probability` | ✅     | F     | —        | none              |
| D   | `appendix-matrices`                 | ✅     | F     | —        | none              |

**Every ❓ is gone.** All 39 section lists above were checked against photographs of the 4e contents
on 2026-08-30 (`toc-4/`, seven pages, **untracked** — 21 MB of raw photographs, kept out of git;
what they said is transcribed below. Read them with Pillow: `rawpy` refuses them, but they are
Apple linear DNGs that open as TIFF). What that check changed is recorded in the
[edition section](#reference-material--mind-the-edition).

---

## Reference material — mind the edition

The PDF in the working directory is the **3rd edition**. This site targets the **4th**:
`src/lib/book.ts` is a 4e outline, and every chapter's `section:` frontmatter uses 4e numbering.

**The 4e contents are now on file**, photographed into `toc-4/` (untracked, but the findings below
are not), so no section list needs guessing again. Eight things that check corrected, all of which had been assumed from the 3e or from memory:

| Where     | Assumed                               | Actually, in 4e                                                       |
| --------- | ------------------------------------- | --------------------------------------------------------------------- |
| §4        | ends at 4.6                           | **4.7 Akra-Bazzi** as well (★)                                        |
| §11       | ends at 11.4                          | **11.5 Practical considerations**                                     |
| §12       | has a §12.4 on randomly built BSTs    | **three sections only** — 12.4 is gone                                |
| §24.3     | Edmonds-Karp                          | **Maximum bipartite matching**; Edmonds-Karp is inside §24.2          |
| §25       | unknown beyond §25.1                  | **25.2 stable marriage, 25.3 Hungarian** — both Tier 1, both unbuilt  |
| §29       | `simplex`                             | **no simplex at all** — formulations, modelling, duality              |
| §30.3     | "efficient FFT implementations"       | **FFT circuits**                                                      |
| §31 / §32 | includes `pollard-rho`; KMP unstarred | **no Pollard's rho**; **KMP is ★**, and **32.5 suffix arrays** is not |

**Safe to take from the 3e PDF:** pseudocode for the algorithms that didn't change between editions
— the sorts, order statistics, BSTs, red-black trees, B-trees, disjoint sets, the graph algorithms,
FFT, number theory, string matching, approximation. That's most of Tier 1. Match the transcription
style of the modules already in `src/algorithms/` rather than the PDF's typography; 4e also moved to
`A[1:n]` slice notation in places where 3e passes explicit bounds.

**Not safe to take from it:** chapter and section numbers, and anything in Part VII. Four 4e chapters
have no usable 3e counterpart at all — which is why the contents photographs were needed:

| 4e chapter                       | 3e counterpart                                      |
| -------------------------------- | --------------------------------------------------- |
| 25 Matchings in Bipartite Graphs | only §26.3, one section inside Maximum Flow         |
| 26 Parallel Algorithms           | 27 Multithreaded Algorithms — related, not the same |
| 27 Online Algorithms             | **none — new in 4e**                                |
| 33 Machine-Learning Algorithms   | **none — new in 4e**                                |

Chapter renumbering, 3e → 4e (confirmed against `toc-4/`):

| 3e                            | 4e     | 3e                        | 4e            |
| ----------------------------- | ------ | ------------------------- | ------------- |
| 1–13                          | 1–13   | 22 Elementary Graph       | 20            |
| 14 Augmenting Data Structures | **17** | 23 MST                    | 21            |
| 15 Dynamic Programming        | **14** | 24 Single-Source Paths    | 22            |
| 16 Greedy                     | **15** | 25 All-Pairs Paths        | 23            |
| 17 Amortized Analysis         | **16** | 26 Maximum Flow           | 24 (+ new 25) |
| 18 B-Trees                    | 18     | 28–32                     | 28–32         |
| 19 Fibonacci Heaps            | cut    | 33 Computational Geometry | cut           |
| 20 van Emde Boas Trees        | cut    | 34 NP-Completeness        | 34            |
| 21 Disjoint Sets              | **19** | 35 Approximation          | 35            |

Two more 4e differences that already affect the plan above: maximum subarray was demoted from a
numbered section (3e §4.1) to Problem 4-1, which is why ch 4 is matrix work and sits in Phase E; and
Part V lost Fibonacci heaps and van Emde Boas trees, which is why `book.ts` has only three chapters
there.

---

## Tier-2 backlog

Catalogued now so the decision to stay at Tier 1 is reversible without re-planning. Promote a row
into a phase when you want it; nothing here changes the shape of the work above.

**Read the status column before treating a row as work.** The table was written in one sitting at
the start and went six phases without being revisited, so by the time Phase G came to promote out of
it, six of its rows were no longer things to build: one had shipped, three had been decided against
in Phase E with the reason written down, and two were changes to a player that already exists rather
than new players. A backlog that lists settled decisions as open work is the same failure this
tracker exists to prevent, so they stay listed — marked, not deleted, since the decision is worth
more than the row.

| Ch  | Algorithm                                   | Source     | Renderer | Status                                                                   |
| --- | ------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| 2   | `linear-search`                             | Ex. 2.1-3  | R1       | ⬜                                                                       |
| 2   | `binary-search`                             | Ex. 2.3-6  | R1       | ✅ G1                                                                    |
| 2   | `bubble-sort`                               | Prob. 2-2  | R1       | ⬜                                                                       |
| 2   | `horner`                                    | Prob. 2-3  | R1       | ⬜                                                                       |
| 2   | `count-inversions`                          | Prob. 2-4  | R1       | ✅ G1                                                                    |
| 4   | `maximum-subarray`                          | Prob. 4-1  | R1       | ✅ G2                                                                    |
| 7   | `hoare-partition`                           | Prob. 7-1  | R1       | ✅ G1                                                                    |
| 7   | `tail-recursive-quicksort`                  | Prob. 7-4  | R1       | ⬜                                                                       |
| 8   | decision-tree lower bound                   | §8.1       | R3       | ⬜ needs a decision first — it is a proof, and has no procedure to panel |
| 9   | `select`'s worst-case regions               | §9.3       | R1       | ✏️ a marking on the shipped `select`, not a second player                |
| 11  | perfect hashing                             | 3e §11.5   | R2       | ❓ 4e's §11.5 is "Practical considerations" — check a 4e copy first      |
| 15  | `fractional-knapsack`                       | §15.2 ex   | R2       | ⬜                                                                       |
| 15  | task scheduling                             | 3e §16.5   | R2       | ❓ matroid material; 4e may not have it in ch 15 at all                  |
| 16  | `table-delete` and the two-regime potential | §16.4      | R2       | ✏️ a second procedure on the shipped `dynamic-table`                     |
| 20  | `euler-tour`                                | Prob. 20-3 | R4       | ⬜                                                                       |
| 20  | `articulation-points`, and bridges          | Prob. 20-2 | R4       | ✅ G3                                                                    |
| 22  | `difference-constraints`                    | §22.4      | R4       | ✅ G3 — the one row here that is a numbered, unstarred section           |
| 24  | push-relabel family                         | Problems   | R4       | ⬜ the largest thing left in the table                                   |
| 25  | `hopcroft-karp` — augmenting in phases      | §25.1      | R4       | ✅ G4                                                                    |
| 28  | `matrix-inverse`                            | §28.2      | R5       | ⛔ Phase E: it is LUP-SOLVE's trace, n times over                        |
| 28  | `least-squares`                             | §28.3      | R5       | ⛔ Phase E: both of its halves are already players on that page          |
| 30  | `recursive-fft`                             | §30.2      | R5       | ⛔ Phase E: the same butterfly the iterative player draws                |
| 31  | `miller-rabin` primality testing            | §31.8 (★)  | R5       | ✅ G5 — **R5, not the R2 first written here**: ch 31 landed on the grid  |
| 32  | `boyer-moore` — right-to-left, sublinear    | Prob. 32-1 | R5       | ✅ G5                                                                    |

**One row left the table rather than being marked.** `RSA end to end (§31.7)` was catalogued as Tier
2 before chapter 31 was written and then built as Tier 1 — §31.7 is a numbered, unstarred section,
so it was never Tier 2 by this file's own rule. The `rsa` player has been embedded in chapter 31
since 2026-08-30.

**Two rows are marked ❓ for the reason the chapter rows used to be**, and it cannot be resolved from
what is on disk: `toc-4/` was untracked and is gone from the working directory, so the 4e contents
are no longer photographable without the book to hand. Both rows carry 3e numbering, and 3e→4e is
exactly where this project has been wrong before.

---

## Housekeeping

Cross-cutting items that aren't chapters. The first one is genuinely urgent — a tracker is no use if
the work it tracks isn't checkpointed.

- [x] **Commit the working tree.** ~~18 modified files and 3 untracked sit on top of a single
      commit.~~ Done — `d75571f`, 22 files, on top of `57b44d8`.
- [x] **Resolve the branch.** ~~Work is on `master`; the repo's stated main branch is `main`.~~
      Renamed to `main` during the build, then back to `master` when the history was squashed and
      pushed to <https://github.com/ThomasRohde/clrs-visualized>. `deploy.yml` triggers on both
      names so the rename cannot silently stop the deploy.
- [x] **CI.** `.github/workflows/ci.yml`, three jobs, and — since the review pass — a
      `workflow_call` trigger, because it is also the deploy gate. **gates** runs `format:check`, `lint`, `check`,
      the README freshness check, `test` and `build`, cheapest first so a formatting slip fails in
      seconds. **players** runs `verify:players` in a real browser — Playwright is now a pinned
      devDependency rather than the global install the script fell back to, which is what unblocked
      it. **base-path** builds under a subpath and asserts every emitted link carries the prefix.
- [x] **Deploy.** `astro.config.mjs` reads `SITE_URL` and `BASE_PATH` from the environment rather
      than hardcoding a destination, because where this is served is a deployment decision and not a
      property of the source. `.github/workflows/deploy.yml` derives both from
      `actions/configure-pages`, so a GitHub Pages **project** site and a **user** site both work
      with no configuration at all. **The href() claim is now checked rather than asserted**:
      `scripts/check-base-path.mjs` reads every href and src in `dist/` and requires the prefix —
      1920 links, all of them correct, and the checker was confirmed to fail on a root build. The
      two steps that had to happen outside the repository are done: `origin` is
      <https://github.com/ThomasRohde/clrs-visualized>, and **Settings → Pages → Source** is set to
      **GitHub Actions**, serving <https://thomasrohde.github.io/clrs-visualized/>. **Deploy runs
      behind CI**: its first job is `uses: ./.github/workflows/ci.yml` and everything that touches
      Pages `needs` it, so a red commit cannot publish — a job dependency for the exact commit, not
      a wait on timing, and no input that skips it. CI no longer runs standalone on the default
      branch, because it runs inside Deploy there.
- [x] **Build time.** ~~Re-measure `npm run build` at the end of Phase C.~~ Measured at the end of
      Phase D: **40 pages in 3.3 s** with 43 lazy chunks, against 3 chapters and 4 algorithms at the
      start. It is flat — the per-algorithm chunking is doing its job, and nothing here needs
      attention before the remaining ~50 recorders land. **Re-measured at the end of Phase F: 40
      pages in 3.25 s with 93 lazy chunks and a 2.6 MB `dist/`.** The algorithm count went from 42 to
      79 and the chunk count doubled; the build time did not move. Per-algorithm chunking did its
      job and this item can be closed.
- [x] **README refresh.** **Generated, not retyped.** `scripts/sync-readme.mjs` (`npm run readme`)
      fills a marked block from `BOOK`, the chapter files that actually exist, and `ALGORITHMS` —
      counts, every chapter with the algorithms it embeds, and a renderer tally. `--check` fails if
      it is stale and CI runs it, so the README that claimed "six chapters, 33 stubs" for six months
      cannot happen again. The hand-written prose around the block was rewritten too.
- [x] **Search.** The one cross-cutting feature added after the book was finished. Full-text with
      BM25F ranking, built at build time into two static JSON files — no service, no runtime
      dependency, and Pagefind rejected with reasons. See [Phase H](#phase-h--search) for the design
      and the four lessons; `CLAUDE.md` carries the rules a future change has to keep.
- [x] **Update the skills.** `add-algorithm` no longer says grid and plot have no renderer: both now
      have their authority bullet (`rolesForGrid`/`rolesForArrows`, `rolesForPlot`/`rolesForPlotLines`)
      with the rules each imposes on a recorder — the grid's final-size rule, the plot's
      recorder-owned axes — plus the cells first-row bracket rule and how to widen `AlgorithmInput`.
      **`add-chapter` reviewed for the first time since Phase A**: the three MDX traps, how to link
      to another chapter through `chapterHref`, `verify:players --shots` as the verification pass
      with "then look at the images", and updating the tracker in the same change.

---

## Session log

Append one line per session: date, what landed, and where you stopped. Newest last.

| Date       | Landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Stopped at                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 2026-08-26 | This tracker. Surveyed the codebase; scope and sequencing settled. Committed the colour-role system, trace tape and hero to `main` (`d75571f`); renamed `master` to `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase A, about to start **E1**                                                                                   |
| 2026-08-27 | **Phase A complete.** E1 and E5, plus half of E4. Chapters 5, 8 and 9 written; 6 and 7 backfilled with §6.5 and §7.3. 11 recorders, taking the registry from 4 to 15. Added `tests/legends.test.ts`, which found real key/renderer drift in all four algorithms that had already shipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Phase B, about to start **E2**                                                                                   |
| 2026-08-28 | **E2 and E7.** `Step.array` optional, `Step.data` added with `cells`/`tree` shapes, `Trace.finalArray` optional, `VisualizerKind` realigned to R1–R6. Suite degeneralised off arrays. New `tests/tape.test.ts` pins the tape to being shape-independent; `Tape` lost its parameter property so Node can import it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Phase B, about to start **E3**                                                                                   |
| 2026-08-28 | **Phase B complete.** E4: `InputSpec` gained `generate`/`parse`/`size`, `AlgorithmInput` named the input type with method-declared bivariance so widening it later costs one line, the player now holds its input opaquely, and the slider bounds, button wording and box label stopped assuming an array. New `tests/input-model.test.ts`. **E3 resequenced into Phase C** to be written against R2 — recorded in its entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Phase C, about to start **E3**                                                                                   |
| 2026-08-28 | **E3.** `src/visualizers/renderers.ts`: a `Renderer` interface, shared `RenderOptions`, and `RENDERER_LOADERS` — a partial kind-keyed map of dynamic imports. The player dispatches on the module's `visualizer` and no longer imports a renderer; an unwritten kind throws a message naming it. New `tests/renderers.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Phase C, about to start **R2**                                                                                   |
| 2026-08-28 | **R2 + the first non-array algorithm + chapter 10.** `src/visualizers/cells.ts` (rows of boxes, id-keyed roles, scope bracket, `hi.pointers` labels); `stack` (§10.1 PUSH/POP/STACK-EMPTY) as the recorder that proves it, with no `finalArray` at all; `tests/legends.test.ts` extended to check cells keys and to fail any renderer with no checker; chapter 10 written for §10.1–10.3. The `add-algorithm` skill updated for the cells vocabulary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Phase C, next: the §10.2 linked-list recorder                                                                    |
| 2026-08-28 | **R2 closed and chapter 10 closed.** Pointer arcs on the cells renderer: a labelled lane per pointer field under each row, span-scaled dips so hops nest above long arcs, NIL terminators, `Cell.prev` alongside `Cell.next` with `null` vs `undefined` meaning NIL vs no-such-pointer, `hi.links` colouring an arc by role, and stacked markers where two variables name one cell. `linked-list` (§10.2 LIST-SEARCH / LIST-PREPEND / LIST-DELETE) is the recorder that proves it, laid out in allocation order so the arcs carry the ordering; `tests/legends.test.ts` now counts arc colours too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Phase C, next: **ch 11** hash tables                                                                             |
| 2026-08-29 | **Chapter 11, hash tables.** `chained-hash` (§11.2: `h` picks a row, chains drawn head-first, the walk and the splice delegated to §10.2) and `open-addressing` (§11.4: linear probing, clusters, and the DELETED slot a search has to cross). The cells renderer learned to draw more than three rows — caption strip, marker lane and row gap derived from the snapshot, height divided per row, cell width capped and the block centred, bracket rise scaled to the gap — with single-row layouts pixel-identical. `AlgorithmPlayer` now clamps `size` into the module's own range.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Phase C, next: **ch 16** amortized analysis                                                                      |
| 2026-08-29 | **Chapter 16, amortized analysis.** `multipop` (the aggregate argument, with cost / Φ / ĉ / running total kept live in the aux strip), `binary-counter` (bits drawn low-order-right, the scope bracket labelled with the increment's cost before it is paid) and `dynamic-table` (the bracket is T.size, doubling at insertions 2, 3, 5, 9). Each `verify` asserts that algorithm's own amortised bound — under 2n flips, at most 2n stack work, under 3n table writes — so the chapter's three claims are machine-checked on every generated input. No renderer changes were needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Phase C, next: **R3** the tree renderer                                                                          |
| 2026-08-29 | **Phase C closed: E6, R3 and chapters 12, 13, 15, 17, 18, 19.** E6 decided first (a neutral badge on the node's shoulder, so data never takes a coded colour) because R3 had to know it. `src/visualizers/tree.ts`: key-sized nodes, leaf-slot layout, forests, NIL squares, edge roles, badges. Nine recorders — `bst`, `red-black-tree`, `activity-selection`, `huffman`, `offline-caching`, `order-statistic-tree`, `interval-tree`, `b-tree`, `disjoint-sets` — each verifying a real property: the five red-black invariants and the height bound, a B-tree's key counts and equal leaf depths, greedy optimality against brute force, a disjoint-set partition against a flood fill. 325 tests, 30 players, all gates clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Phase D**, next: **R4** the graph renderer                                                                     |
| 2026-08-30 | **Phase D closed: R4 and chapters 20, 21, 22, 24, 25.** `src/visualizers/graph.ts`: recorder-owned layouts fixed for the whole trace, role-coloured edges, weight chips, dashed residual edges, per-vertex scope rings, E6 badges — with `drawBadge` lifted into `badge.ts` so the tree and graph renderers cannot drift on it. Twelve recorders, each verified against a theorem rather than a re-run: the parenthesis theorem, §22.5's two conditions, the MST cycle property, max-flow min-cut, Berge's theorem, and Edmonds-Karp's own V·E/2 bound and non-decreasing path lengths. `AlgorithmInput` widened to `number[] \| GraphInput` — E4's one-line promise, paid. 446 tests, 42 players, all gates clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Phase E**, next: **R5** the grid renderer (with ch 14 first)                                                   |
| 2026-08-30 | **Phase E closed: R5 and chapters 4, 14, 23, 28, 30, 32.** `src/visualizers/grid.ts`: cell-to-cell arrows as a first-class highlight, a `note` beside every value, a rectangular scope, a two-line heading band so a marker never hides a column label, and a value font fitted to the longest entry. Seventeen recorders. Verifies that are theorems rather than re-runs: Freivalds' randomized product check, matrix-chain order re-parsing and re-costing its own parenthesisation, optimal-BST re-walking its tree and charging every key and gap for its depth, the FFT against the Θ(n²) definition, LUP multiplied back out to PA = LU. Three scope decisions sent `recursive-fft`, `matrix-inverse` and `least-squares` to the backlog, each because its player would replay a trace already on the page. `AlgorithmInput` widened again, to add `TextInput`. 610 tests, 59 players, all gates clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Phase F**, next: the ❓ chapters need checking against a 4e copy first                                         |
| 2026-08-30 | **Every section list checked against the 4e contents, and the three Tier-1 gaps it exposed closed.** Photographs of the real table of contents settled all 39 rows and corrected eight of them — §4 runs to 4.7, §11 to 11.5, §12 has no 12.4, §24.3 is bipartite matching rather than Edmonds-Karp, §25.2 and §25.3 existed and were unbuilt, §29 has no simplex, §30.3 is FFT circuits, and KMP is starred where §32.5 is not. The three genuine gaps were then built: `gale-shapley` (§25.2), `hungarian` (§25.3, verified twice over — brute force on all n! assignments, and its own duality certificate) and `suffix-array` (§32.5, each suffix drawn at its own offset so the rows form a staircase). Chapters 25 and 32 are complete at Tier 1; Hopcroft-Karp is the only Tier-2 item left in either.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Phase F** proper, next: **ch 31** number theory                                                                |
| 2026-08-30 | **Chapter 31, number theory.** `extended-euclid`, `modular-exponentiation` and `rsa` — the third is the first two put together, and the chapter says so. Extended Euclid is two passes in opposite directions over one table: down the columns the pair shrinks by division, back up the coefficients assemble one subtraction per level, and the arrows reverse at the bottom. Its generator builds inputs backwards from the answer by running the recurrence upwards, so the size slider means "how many divisions" and a long descent is guaranteed rather than lucky — Lamé's theorem used as a construction. The generative test found a real RSA pitfall: an exponent congruent to 1 mod λ(n) makes M^e = M for every message, so the cipher is the identity; generator and parser now both refuse such an e. **Landed on R5, not the R2 this table predicted** — the chapter is tabular, not pointer-shaped. 676 tests, 65 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Phase F**, next: **ch 27** online algorithms                                                                   |
| 2026-08-31 | **Chapter 27, online algorithms.** `move-to-front` (§27.2) and `online-caching` (§27.3), on R2. The chapter measures competitive ratio rather than running time, so each verify computes the offline optimum and asserts the bound: move-to-front's exactly, by DP over every reachable list order (after paying to reach an item, an offline algorithm may move it forward for free — the same freedom MTF has), and LRU's by Belady's rule from §15.4, which that section proves optimal. Neither shares code with the algorithm under test. The two brackets are the chapter in one mark: chapter 15's points forward over requests still to come, this one backward over those already served. Both players take the same input, so a reader can type one sequence into both. One collision found only by looking — the bracket caption and a pointer marker are both drawn above the first row. 696 tests, 67 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Phase F**, next: **ch 35** approximation algorithms                                                            |
| 2026-08-31 | **Chapter 35, approximation algorithms.** `approx-vertex-cover` and `approx-tsp-tour` on R4, `greedy-set-cover` on R5, `approx-subset-sum` on R2; §35.4 is prose, being two techniques rather than two algorithms. Every `verify` computes the true optimum — all 2^V vertex subsets, Held-Karp over the tours, every subfamily of F, all 2ⁿ subset sums — and asserts the section's ratio against it, which is the one chapter where brute-forcing the optimum is the subject rather than an extravagance. TSP's cost is the Euclidean distance rounded **up**, because ⌈·⌉ preserves the triangle inequality where ordinary rounding can lose it by 1 and take the guarantee with it, and its input box asks for **points** rather than an edge list for the same reason. Measured against the optimum, vertex cover runs at 1.84× and reaches its bound of 2 routinely, TSP at 1.17×, subset sum at 0.977 of a promised 0.6 — the chapter says so. **Three things only the screenshots caught:** the TSP map drew into two-thirds of the canvas (now scaled to fill it, uniformly, since that one picture has to be metrically honest); `done` was being spent on the spanning tree, leaving the tour phase nothing to fill in; and a cells scope caption is drawn in the gap above its row, which only the _first_ row has a band for — L now sits above S, and the rule is in CLAUDE.md. Also fixed: the RSA guard from ch 31 was necessary but not sufficient and failed the suite intermittently, and `noun` is used as `Use this {noun}`, so eight plural ones were made singular. 736 tests, 71 players.                                                                                                                                                                                                                                                                                                                                                                    | **Phase F**, next: **ch 26** parallel algorithms                                                                 |
| 2026-08-31 | **An independent review's fourteen issues, closed one commit each, on `review-fixes`.** Three correctness bugs first: Johnson reweighted from a potential that does not exist and ran Dijkstra on negative edges, Floyd-Warshall called a negative diagonal a matrix of shortest distances, and LUP solve turned a zero pivot into `x_i = 0` and reported a vector that does not satisfy `Ax = b`. Each now reaches a terminal state that names the failure, and each verifier checks it by a route that shares no code with the thing it checks — `negativeCycleVertices` is per-source Bellman-Ford, `determinant` is cofactor expansion. LUP decomposition stops at `error` instead of emitting Done as well, and its space is Θ(n), because π is n entries and is the part you keep. Then the claims: the all-pairs chapter no longer credits four players with behaviour two of them do not have, the hero no longer promises every algorithm in the book, and the site says 35 chapters and four appendices rather than 39 chapters. **Four things changed shape rather than wording.** Deploy runs behind CI as a job dependency (ci.yml is now `workflow_call`), so a red commit cannot publish. The keyboard target is chosen after `init()` resolves and by document order, not by which chunk arrived first. `draft: true` finally means something, in all four places that list chapters. And **every canvas now carries its state in words** — `describe.ts`, read from the renderer's own `roles()` so it cannot drift from the picture, associated by `aria-describedby`, with the narration's live region silenced during playback. `verify:players` gained a **dark@375** row and a clipping check, which found legends cut off on every renderer family and three genuine height shifts; the narration box now measures its own reserve rather than assuming three lines. 997 tests, all gates clean, `verify:players` clean across four theme/width combinations. | Merged as [#15](https://github.com/ThomasRohde/clrs-visualized/pull/15)                                          |
| 2026-08-31 | **The Tier-2 backlog planned and cleaned up, and G1 built.** Six of its twenty-three rows had stopped being work — `RSA end to end` shipped as Tier 1, three were decided against in Phase E with reasons recorded, and two are changes to shipped players rather than new ones — so they are marked rather than deleted, and two more are ❓ against 4e numbering that `toc-4/` can no longer settle. Nine rows promoted into a new **Phase G**, each chosen because it teaches something no player on the site shows. G1 built three on R1. `binary-search`: bounds named p/q/r so line 4 is merge sort's line 2 character for character, with the target packed in front of the values so half the generated searches fail. `count-inversions`: MERGE-INVERSIONS is MERGE line for line plus one, and the counted run is captioned in the L row rather than on the bars, because by then those elements are in the buffer and A is being overwritten from p upwards. `hoare-partition`: the whole point is that QUICKSORT′ recurses on (p, q) and not (p, q−1), so nothing is ever painted settled until the last step, and verify reads 7-1(b) and (c) straight off the trace. Two traps found only by looking — array-bars has two marker lanes, and `rolesForStep` already reads `r`. 1033 tests, 82 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Phase G**, next: **E8**, then ch 4's `maximum-subarray`                                                        |
| 2026-08-31 | **E8 and G2.** `array-bars` learned an axis that goes below zero — `RenderOptions.minValue`, computed over the whole trace by `traceMinValue` and fixed for its duration, with the baseline gated on a negative value actually appearing so forty shipped players keep the pixels they had. That promise cannot be checked by comparing screenshots, since most players generate a random input, so the arithmetic came out of `draw()` as `barSpan` and `tests/array-bars-axis.test.ts` writes out the old formula and asserts the new one against it. Writing that test found the one case that would have moved: a −∞ stub hanging below a baseline that has the index labels under it. Then `maximum-subarray` — one player, two algorithms, the same answer, and the trace tape as the comparison. Two more found only by looking: a full-depth negative bar printed its value on the index row, so a signed chart reserves a lane below the bars, and the default parser rejected a leading minus. 1051 tests, 83 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Phase G**, next: **G3** — `articulation-points` and `difference-constraints` on R4                             |
| 2026-08-31 | **G3, the two graph problems on R4.** `articulation-points` (Prob. 20-2): one depth-first search finds every cut vertex and every bridge, given `low[v]` — the earliest discovery time reachable from v's subtree using at most one back edge. Everything happens on the way back up, and the difference between the bridge test (`v.low > u.d`) and the cut-vertex test (`v.low ≥ u.d`) is the whole content of the problem. One `d/low` badge rather than two bare numbers, per chapter 20's own precedent; `verify` removes each vertex and each edge and counts components, which is the definition rather than the recurrence. `difference-constraints` (§22.4): a numbered section, Tier 1 by this file's rule, ruled prose because it is a reduction — so the player is the **translation**, with inequalities in the input box and the graph they become on screen. `verify` checks a feasible answer against the constraints that were typed rather than the estimates it was read off, and backs infeasibility with `negativeCycleVertices`. **Chapter 22 now has a player for every numbered section.** One legend wording fix no test can catch: `done` paints tree edges as well as finished vertices. 1075 tests, 85 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Phase G**, next: **G4** — `hopcroft-karp`, alone                                                               |
| 2026-08-31 | **G4, `hopcroft-karp`.** §25.1's own algorithm uses one augmenting path per search; this one uses every disjoint shortest path it can find in a phase, which is worth a factor of √V. Two lines carry it and neither is the augmentation: `level[M[v]] == level[u] + 1` is what keeps a path shortest, and `level[u] = ∞` on the way out is what keeps the paths disjoint, so a phase costs O(E) rather than O(E) per path. NIL is a real vertex in the bookkeeping — every free right vertex leads to one virtual sink — which is what lets the BFS stop at the right layer and the DFS need no special case for the end of a path. `verify` checks Berge's theorem through the same helper §25.1's player uses, and then the property this algorithm exists for: the shortest augmenting path is strictly longer every phase. The O(E√V) bound is not worth asserting at ten vertices, since a one-path-per-phase implementation would meet it — but it would repeat a length. The odd-length check found that levels and edges had been conflated: a level counts left vertices, and a path of level ℓ has 2ℓ − 1 edges. 1087 tests, 86 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Phase G**, next: **G5** — `miller-rabin` and `boyer-moore` on R5                                               |
| 2026-08-31 | **G5, and Phase G closed.** `miller-rabin` (§31.8 ★): Fermat's test is useless against Carmichael numbers, and Miller-Rabin's fix costs nothing — a prime has only two square roots of 1, so a squaring chain reaching 1 from anything else is a proof. `verify` checks the **guarantee** rather than the probability: a prime is never called composite however unlucky the bases, and a composite that survives s trials is allowed only if no row held an unreported witness. The candidate pool is chosen rather than random, because a random odd number is composite for a reason the first base finds instantly. `boyer-moore` (ch 32's problems): the fifth matcher on the same picture, reading right to left, with γ as the corner note on each pattern cell and λ as a second aux row. Its `verify` checks something stronger than the answer — every jump is recorded and every position it skipped is tested, because agreeing with the naive matcher only proves this input was handled right, while "no shift steps over an occurrence" is what both heuristics exist to preserve. Two fixes from looking: `done` named only the current trial, so a settled row lost its colour; and `doneSet` is an array-bars key the grid renderer does not read. 1111 tests, 88 players.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Phase G complete.** Nothing outstanding                                                                        |
| 2026-09-01 | **Phase H — search.** Full-text with BM25F ranking, built at build time into two prerendered JSON files (101 KB and 127 KB gzipped, both under a budget `npm test` asserts). 340 documents: every `##`/`###` section deep-linked to the anchor Astro already emits, and all 88 algorithms — inverted out of the `<AlgorithmPlayer>` tag in a chapter body, down to the heading it sits under, so Enter lands on the player. One analyzer over query and document alike, which is what makes spelling out Θ and emitting `red-black` as three terms free; the pseudocode keywords are deliberately not stopwords. `tests/search-ranking.test.ts` is the point — thirty golden queries against the real corpus, because the weights are unfalsifiable on their own. It found the one thing that made search feel broken: BM25F has no notion of a title being used up, so "partition" put §7.1 sixth behind five algorithms that merely mention PARTITION. The fix then had a worse bug than the one it fixed, keyed to the raw query so it only fired on the last keystroke of a word. `verify:players` now drives the dialog by keyboard in all four theme/width combinations and found three more, two of them in the check rather than the product — an already-idle page satisfies `waitForLoadState` instantly, and a closed `<dialog>` fires `close` in a queued task after clearing `open`. 1154 tests, all gates clean, subpath build checked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Nothing outstanding.** The [backlog](#tier-2-backlog) is the only work left, and promoting a row is a decision |
