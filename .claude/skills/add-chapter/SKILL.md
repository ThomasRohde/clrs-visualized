---
name: add-chapter
description: Write a new chapter for Loop Invariant (clrs-visualized) from the CLRS table of contents, using the existing MDX template. Use when the user wants to add/write/fill in a book chapter or section.
---

Add a new chapter. The full CLRS table of contents (all parts/chapters, with their slugs) already exists in `src/lib/book.ts` as browsable stubs — you are almost always filling in an _existing_ slug, not inventing a new one.

## 1. Pick the slug

Find the target chapter's `slug` in `src/lib/book.ts` (`ALL_CHAPTERS` / `BOOK`). If the user names a chapter by number or title, look it up there rather than guessing a filename — the MDX filename must match this slug exactly.

## 2. Create the file

Copy `src/content/chapters/_template.mdx` to `src/content/chapters/<slug>.mdx`. Fill in frontmatter:

```yaml
title: <matches the title in book.ts>
section: '§<n>' or 'Chapter <n>'
summary: One sentence, shown under the title and on the home page.
algorithms: [<algorithm ids used in this chapter, if any>]
```

`algorithms` must list every id referenced by an `<AlgorithmPlayer>` in the body — `content.config.ts`'s zod schema and the build both enforce that every id is registered in `src/algorithms/registry.ts`. If the algorithm doesn't exist yet, use the `add-algorithm` skill first (or note that it's needed and stop).

## 3. Write the body

Ordinary Markdown/MDX. Follow the book's own structure and section numbering for the prose. Embed players and complexity tables inline wherever they're discussed:

```mdx
<AlgorithmPlayer id="merge-sort" />
<AlgorithmPlayer id="merge-sort" size={16} />

<ComplexityCard id="merge-sort">
  **Recurrence:** T(n) = 2T(n/2) + Θ(n), which solves to Θ(n log n).
</ComplexityCard>
```

`ComplexityCard` reads its table straight from the algorithm module (no separate data entry); whatever is inside the tags becomes commentary next to it.

### Three MDX traps, each of which has cost an afternoon

**Braces are JSX, anywhere.** Not only in indented blocks — `Pr{A ∪ B}` in an ordinary sentence fails the build with `Invalid Character`, and `y_{k+m/2}` fails with `ReferenceError: k is not defined`. Wrap any formula containing braces in backticks.

**Indented code blocks are disabled.** A four-space-indented display equation is a _paragraph_, so it renders as prose and nobody notices. Use fenced blocks (` ``` `) for pseudocode and equations.

**No line may start with `<`.** Prettier (proseWrap `preserve`) treats a line beginning with a tag as a block node and inserts a blank line before it, silently splitting one paragraph into two. Cross-chapter links are JSX, so keep them mid-line; if a paragraph would begin with one, put a word in front of it. `grep -n "^<a href" src/content/chapters/*.mdx` should return nothing.

### Linking to another chapter

Import the helper and use it inline — never a hardcoded path, because the site has to survive being deployed under a subpath and CI asserts that it does:

```mdx
import { chapterHref } from '../../lib/paths.ts';

…which is what <a href={chapterHref('sorting-in-linear-time')}>chapter 8</a>'s lower bound rests on.
```

Keep animated/interactive regions in mind when writing prose around them — narration boxes, aux buffers, and the pseudocode panel are fixed-height by design (see CLAUDE.md) so stepping through an algorithm doesn't jump the page.

### Never name a colour in the prose

Do not write "the green bars are the sorted prefix" or "the gold bar is the `key`". Every player renders its own legend from `src/visualizers/roles.ts`, and the palette differs between light and dark themes — prose that hard-codes a colour is a second, unsynchronised copy of the legend that goes stale the moment the palette moves. Three chapters had to be rewritten for exactly this reason.

Describe **behaviour and structure** instead, and let the legend carry the colour:

| Instead of                              | Write                                                                 |
| --------------------------------------- | --------------------------------------------------------------------- |
| "the gold bar is the `key`"             | "the key leaves the array entirely while larger elements shift right" |
| "the dashed band shows the subarray"    | "the bracket over the chart marks the subarray this call owns"        |
| "once a bar turns green it never moves" | "once a bar squares off it never moves again"                         |

The second cue is safe to name — settled bars really are square-topped and moving bars really are outlined, in both themes, and that is what a reader who cannot separate the hues is relying on.

### Point at the tape when comparing runs

Each player's scrubber is a **trace tape**: one tick per recorded step, coloured by whether it compared, moved, or changed scope. It is the cheapest way to make an asymptotic claim concrete — insertion sort on reversed input is a solid block of writes, merge sort is one short figure repeated at every level of the recursion. Whenever a chapter asks the reader to compare two algorithms or two inputs, tell them to look at the tapes before stepping through (chapter 2's "Comparing them" section is the worked example).

## 4. Verify

- `npm run check` — catches frontmatter schema violations and unregistered algorithm ids.
- `npm run build` — the only thing that catches the MDX traps above.
- `npm run verify:players -- --only <slug> --shots` — steps every player the chapter embeds, in both themes at three widths, and fails on console errors, a blank canvas, missing narration, the wrong number of highlighted lines, or panel height changing mid-trace. **Then look at the images.** Every screenshot-only bug this project has had was invisible to that script: a marker over the wrong bar, a caption printed through a column heading, a graph drawn into a corner of its canvas, a link drawn behind the gridlines.
- Read the chapter once in **each theme**. Anything in the prose that only makes sense in one of them is a colour reference that should have been a behaviour reference.
- Update `docs/PROGRESS.md` in the _same_ change: tick the Phase checklist box **and** the chapter table row, move the Resume block, and append a session-log line. Two chapters shipped without this and the tracker described a book that did not exist.
