/**
 * The colour vocabulary, and what it means per algorithm.
 *
 * Six roles carry every visual state on the site. A role maps to exactly one
 * CSS custom property, and the legend above each visualization is generated
 * from the same table the renderer draws from — so a colour on screen and its
 * entry in the key can never drift apart.
 *
 * Hue is never the only channel: `done` bars are drawn with square tops where
 * every other bar is rounded, and `move` bars get an ink outline. See
 * array-bars.ts.
 */

export type Role = 'rest' | 'look' | 'move' | 'done' | 'mark' | 'scope';

export const ROLE_VAR: Record<Role, string> = {
  rest: '--c-rest',
  look: '--c-look',
  move: '--c-move',
  done: '--c-done',
  mark: '--c-mark',
  scope: '--c-scope',
};

/**
 * Which roles an algorithm actually uses, and what they mean *in that
 * algorithm*. "Being compared" is generic; "the key looking for its slot" is
 * what a reader of chapter 2 needs.
 *
 * The rule is **every coded colour that appears on the chart is in the key**,
 * and nothing else is. That covers chart chrome as well as bar fills: the
 * subarray bracket and the heap boundary are drawn in the scope colour, so
 * they earn an entry, worded to say which mark the reader is looking for.
 *
 * `tests/legends.test.ts` enforces both directions of that rule against what
 * `rolesForStep` actually returns, so an entry here that no step produces —
 * or a role a step produces that is missing here — fails the build rather
 * than quietly shipping a key that lies.
 */
/**
 * A key: each coded colour paired with what it means for one algorithm.
 *
 * Named because two things read it — the on-screen key, and `describe.ts`,
 * which uses the same words for the same states so a screen reader is not
 * given a second vocabulary for the six roles.
 */
export type Legend = Array<[Role, string]>;

export const DEFAULT_LEGEND: Legend = [
  ['look', 'being compared'],
  ['move', 'being moved'],
  ['done', 'in final position'],
  ['rest', 'untouched'],
];

export const LEGENDS: Record<string, Legend> = {
  'difference-constraints': [
    ['look', 'the constraint being tested, and the variable it reads'],
    ['move', 'the edge just added, or the estimate it just lowered'],
    ['mark', 'v₀, the variable being read off, or the constraints that conflict'],
    ['done', 'a shortest-path tree edge, and the solution once it is final'],
    ['rest', "not yet drawn, or not this step's business"],
  ],
  'articulation-points': [
    ['scope', 'the ring round the vertices the search is currently inside'],
    ['look', 'the edge being classified, and the vertex at its far end'],
    ['move', 'the vertex just discovered'],
    ['mark', 'a cut vertex, or a bridge — the answers, as they are found'],
    ['done', 'a tree edge of the search, and a vertex whose low is final'],
    ['rest', 'not yet reached'],
  ],
  'maximum-subarray': [
    ['scope', 'the bracket over the subarray this call owns'],
    ['look', 'the element being added to the running sum'],
    ['mark', 'the best subarray found so far'],
    ['done', 'the answer, once both algorithms have found it'],
    ['rest', 'outside this call, or not yet reached'],
  ],
  'hoare-partition': [
    ['scope', 'the bracket over the subarray this call owns'],
    ['look', 'compared with the pivot value x'],
    ['move', 'the pair being exchanged across the split'],
    ['mark', 'q, the split point — not an element in its final place'],
    ['done', 'sorted, which nothing is until the last step'],
    ['rest', 'outside this call'],
  ],
  'count-inversions': [
    ['scope', 'the bracket over the subarray this call owns'],
    ['look', 'copied out to L or R, and the front of each'],
    ['move', 'written back into A'],
    ['done', 'merged, sorted, and counted'],
    ['rest', 'outside this call'],
  ],
  'binary-search': [
    ['scope', 'the bracket over the interval still being searched'],
    ['look', 'A[q], the one element this iteration reads'],
    ['mark', 'v, found'],
    ['done', 'ruled out — v cannot be here'],
    ['rest', 'still in the interval, still unread'],
  ],
  'insertion-sort': [
    ['mark', 'the key'],
    ['look', 'compared with the key'],
    ['move', 'shifting right'],
    ['done', 'sorted prefix'],
    ['rest', 'not yet reached'],
  ],
  'merge-sort': [
    ['scope', 'the subarray this call owns'],
    ['look', 'copied out to L or R, and the front of each'],
    ['move', 'written back into A'],
    ['done', 'merged and settled'],
    ['rest', 'outside this call'],
  ],
  quicksort: [
    ['mark', 'the pivot'],
    ['look', 'compared with the pivot'],
    ['move', 'swapping'],
    ['scope', 'the subarray this call owns'],
    ['done', 'a settled pivot — it never moves again'],
    ['rest', 'outside this call'],
  ],
  // `scope` here is the labelled dashed line, not a bar fill — but it is the
  // scope colour on the chart, so it belongs in the key. The wording says
  // which mark it is, so the reader is not left hunting for a coloured bar.
  heapsort: [
    ['rest', 'still in the heap'],
    ['look', 'parent vs. children'],
    ['move', 'swapping down'],
    ['scope', 'the heap boundary line'],
    ['done', 'extracted and sorted'],
  ],
  'max-priority-queue': [
    ['mark', 'the key an operation names'],
    ['look', 'compared while sinking or rising'],
    ['move', 'being written or exchanged'],
    ['scope', 'the heap-size boundary line'],
    ['rest', 'inside the queue'],
    ['done', 'outside the queue'],
  ],
  'randomized-quicksort': [
    ['mark', 'the slot the coin flip picked'],
    ['look', 'compared with the pivot'],
    ['move', 'swapping'],
    ['scope', 'the subarray this call owns'],
    ['done', 'a settled pivot — it never moves again'],
    ['rest', 'outside this call'],
  ],
  // Counting sort's chart is A while the counts are taken and B afterwards,
  // so "in final position" means B has been written there — which is also why
  // nothing is ever compared.
  'counting-sort': [
    ['look', 'the element being counted'],
    ['move', 'landing in the output'],
    ['done', 'placed, and never moved again'],
    ['rest', 'not yet reached'],
  ],
  'radix-sort': [
    ['look', 'the element whose digit is being read'],
    ['move', 'landing in this pass’s output'],
    ['done', 'placed by this pass'],
    ['rest', 'not yet reached'],
  ],
  'bucket-sort': [
    ['look', 'being assigned to a bucket, or compared inside one'],
    ['move', 'being written'],
    ['scope', 'the bucket being sorted'],
    ['done', 'its bucket is finished'],
    ['rest', 'not yet reached'],
  ],
  'minimum-maximum': [
    ['mark', 'the running minimum and maximum'],
    ['look', 'the element being compared'],
    ['rest', 'not yet examined, or already dismissed'],
  ],
  'randomized-select': [
    ['mark', 'the slot the coin flip picked'],
    ['look', 'compared with the pivot'],
    ['move', 'swapping'],
    ['scope', 'the part that might still hold the answer'],
    ['done', 'a pivot, now in its final position'],
    ['rest', 'discarded, and never sorted'],
  ],
  select: [
    ['mark', 'the group being sorted, or a group median'],
    ['look', 'the two elements being compared'],
    ['move', 'swapping'],
    ['scope', 'the part that might still hold the answer'],
    ['done', 'settled and out of play'],
    ['rest', 'discarded, and never sorted'],
  ],
  'hire-assistant': [
    ['mark', 'the assistant currently employed'],
    ['look', 'the candidate being interviewed'],
    ['rest', 'interviewed and passed over, or not yet seen'],
  ],
  'permute-by-sorting': [
    ['look', 'the priority being compared'],
    ['move', 'moving, with its priority'],
    ['done', 'in priority order so far'],
    ['rest', 'not yet reached'],
  ],
  stack: [
    ['scope', 'the bracket over S[1‥top] — what is actually in the stack'],
    ['mark', 'S.top — the element pushed most recently'],
    ['move', 'being written by PUSH'],
    ['look', 'the value POP is handing back'],
    ['rest', 'a slot no operation is touching this step'],
  ],
  // On this renderer a pointer is drawn as an arc, and an arc takes a role
  // colour exactly as a cell does — so every entry here has to name the arc
  // as well as the box, or the key describes half of what is on screen.
  'linked-list': [
    ['mark', 'L.head — the front of the list'],
    ['look', 'the object being compared, and the arrow about to be followed'],
    ['move', 'the pointer being assigned, and the object that holds it'],
    ['done', 'spliced out — still in its slot, no longer in the list'],
    ['rest', 'in the list, and untouched this step'],
  ],
  // Membership of a bucket is the *bracket* here, not a fill: an object in
  // the chain h picked looks exactly like one in any other chain, which is
  // the honest picture — the table treats all five buckets alike.
  'chained-hash': [
    ['scope', 'the bracket over T[h(k)] — the one bucket this operation reads'],
    ['look', 'the object being compared as the walk goes down the chain'],
    ['move', 'the object just prepended to a chain'],
    ['done', 'spliced out of its chain'],
    ['rest', 'an object in some chain, untouched this step'],
  ],
  'open-addressing': [
    ['mark', 'h(k) — the slot the key asked for'],
    ['look', 'the slot being probed'],
    ['move', 'the slot being written'],
    ['done', 'DELETED — emptied, but deliberately not NIL'],
    ['rest', 'a key sitting where an earlier probe left it'],
  ],
  // Nothing settles in a counter and nothing is marked, so this key is four
  // entries: the bracket is the price of the increment, and it is on screen
  // before the first bit flips.
  'binary-counter': [
    ['scope', 'the bits this increment will flip — its cost, before it is paid'],
    ['look', 'the bit the loop is testing'],
    ['move', 'the bit being flipped'],
    ['rest', 'a bit this increment never reaches'],
  ],
  multipop: [
    ['scope', 'the bracket over S[1‥top] — its width is the potential Φ'],
    ['mark', 'S.top — the object a pop would hand back next'],
    ['move', 'the slot PUSH is writing'],
    ['look', 'the object being popped'],
    ['rest', 'a slot no operation is touching this step'],
  ],
  'dynamic-table': [
    ['scope', 'the bracket over T.size — the table as actually allocated'],
    ['look', 'the items an expansion is about to copy'],
    ['move', 'the slot being written'],
    ['rest', 'an item already in the table'],
  ],
  // The first tree key. `scope` is the hull round the subtree that can still
  // hold the key — the halving a search tree does, drawn — and an edge takes
  // a role colour because following a pointer is often the whole step.
  bst: [
    ['scope', 'the subtree that can still hold the key'],
    ['look', 'the node being compared, and the edge about to be followed'],
    ['move', 'the pointer being written, and the node it now points at'],
    ['mark', 'the node the operation names'],
    ['rest', 'a node this step does not touch'],
  ],
  // The node's *colour* is not in this key and must not be: it is data, drawn
  // as a badge, and the fill still belongs to whatever the fixup is doing.
  'red-black-tree': [
    ['scope', 'the four nodes the case is about: z, its parent, grandparent and uncle'],
    ['look', 'the uncle, or the node being compared on the way down'],
    ['move', 'a node being recoloured or rotated'],
    ['mark', 'z — where the two reds in a row are'],
    ['rest', 'a node this step does not touch'],
  ],
  // A row is an activity and a column is a unit of time, so two bars in one
  // column is an overlap. The key is worded for bars rather than for cells.
  'activity-selection': [
    ['mark', 'the last activity chosen — only its finish time still matters'],
    ['look', 'the activity being tested against it'],
    ['done', 'chosen, and never reconsidered'],
    ['rest', 'not chosen, or not yet reached'],
  ],
  // The character on a leaf is a badge, not a colour: it is data. The key is
  // about the queue — which trees are being merged, and which are waiting.
  huffman: [
    ['scope', 'the two smallest trees, about to become one'],
    ['look', 'the roots EXTRACT-MIN just took'],
    ['move', 'the node that replaces them'],
    ['done', 'the finished code tree'],
    ['rest', 'still waiting in the queue'],
  ],
  // The bracket is the future, and the future is the only thing the eviction
  // rule reads — so it earns an entry worded as the run of requests to come.
  'offline-caching': [
    ['scope', 'the requests still to come — all the eviction rule looks at'],
    ['mark', 'the request being served'],
    ['look', 'the block that is being evicted, or that the hit found'],
    ['move', 'the block being brought into the cache'],
    ['done', 'a request already served'],
    ['rest', 'a request not yet reached, or a block sitting in the cache'],
  ],
  // The size badges are data and so are not in this key. What is coloured is
  // the walk: down for OS-SELECT, up for OS-RANK.
  'order-statistic-tree': [
    ['scope', 'the subtree the answer must be in'],
    ['look', 'a node on the path, or a subtree being counted in'],
    ['move', 'the node just inserted'],
    ['mark', 'the node the query is about'],
    ['rest', 'a node this step does not touch'],
  ],
  'interval-tree': [
    ['scope', 'the subtree the walk is about to commit to'],
    ['look', 'the interval being tested, and the edge being followed'],
    ['move', 'the interval just inserted'],
    ['mark', 'the overlap the search found'],
    ['rest', 'an interval this step does not touch'],
  ],
  'b-tree': [
    ['scope', 'the child the search will read next — everything else is ruled out'],
    ['look', 'the node being scanned, or the full child about to split'],
    ['move', 'a node the split rewrote'],
    ['mark', 'the node the key ends up in, or the parent taking a median'],
    ['rest', 'a node this step does not read'],
  ],
  // Ranks are badges, not colours. What is coloured is the walk to the root
  // and the re-pointing that follows it.
  'disjoint-sets': [
    ['scope', 'the set — or the two sets about to become one'],
    ['look', 'the nodes FIND-SET walked past'],
    ['move', 'a node being re-pointed, by compression or by a union'],
    ['mark', 'the root that identifies the set'],
    ['done', 'every vertex, once the edges have all been processed'],
    ['rest', 'a vertex this step does not touch'],
  ],
  // The first graph key. Two things are coloured that were not before: the
  // *edge* being examined, and the tree edges that are the answer. The ring
  // is the queue — membership of a set, which is not a fill anywhere on this
  // renderer, exactly as the cells bracket is not.
  bfs: [
    ['mark', 'u — the vertex just taken off the queue'],
    ['look', 'the edge being examined, and the vertex at its far end'],
    ['move', 'a vertex just discovered: its d and π written, once'],
    ['scope', 'the ring round the vertices in Q — the frontier'],
    ['done', 'finished, and the tree edges that reached it'],
    ['rest', 'not yet discovered'],
  ],
  // The colour at the far end of an edge is what classifies it, so the key
  // has to answer for the ring as well as for the fills: the ring is grey,
  // and grey is exactly the set a back edge can point at.
  dfs: [
    ['mark', 'u — the vertex the search is currently inside'],
    ['look', 'the edge being classified, and the vertex at its far end'],
    ['move', 'a vertex just discovered, and stamped with its d'],
    ['scope', 'the ring round the grey vertices — the path the search took here'],
    ['done', 'finished, with both stamps, and the tree edges'],
    ['rest', 'white — not yet reached by any search'],
  ],
  'topological-sort': [
    ['mark', 'the vertex whose edges are being checked'],
    ['look', 'the edge being followed, and the vertex it leads to'],
    ['move', 'a vertex just discovered, or just placed on the front of the list'],
    ['scope', 'the ring round the vertices still waiting to finish'],
    ['done', 'already on the list, and the tree edges of the search'],
    ['rest', 'not yet reached'],
  ],
  'strongly-connected-components': [
    ['mark', 'the vertex being explored from'],
    ['look', 'the edge being followed, and the vertex at its far end'],
    ['move', 'a vertex just reached by the search'],
    ['scope', 'the search stack, and then the component being grown'],
    ['done', 'assigned to a finished component'],
    ['rest', 'not yet reached by this phase'],
  ],
  // No `mark` here: nothing in Kruskal is a named vertex. The rings are the
  // disjoint sets of chapter 19, which is where the cycle test comes from.
  'mst-kruskal': [
    ['look', 'the edge being considered, and its two ends'],
    ['move', 'the edge just taken into A'],
    ['scope', 'the rings round the sets this edge would join'],
    ['done', 'an edge already in A, and every vertex once the tree is complete'],
    ['rest', 'an edge or vertex this step does not touch'],
  ],
  'mst-prim': [
    ['mark', 'u — the vertex EXTRACT-MIN just took'],
    ['look', 'the edge being priced, and the vertex across it'],
    ['move', 'a vertex whose key just dropped — a cheaper way into the tree'],
    ['scope', 'the ring round the frontier: one edge from the tree'],
    ['done', 'in the tree, and the edge that put it there'],
    ['rest', 'still at key ∞ — no edge to the tree yet'],
  ],
  // `mark` is the current answer rather than a single vertex: the source, and
  // the parent edges that make up the tree as it stands. It gets rewired as
  // the passes go on, which is the thing to watch.
  'bellman-ford': [
    ['mark', 'the source, and the parent edges making up the tree so far'],
    ['look', 'the edge being relaxed, and both its ends'],
    ['move', 'a vertex whose estimate just came down'],
    ['scope', 'the ring round the vertices reached so far, this pass'],
    ['done', 'proved — the final pass found no edge left to relax'],
    ['rest', 'still at ∞'],
  ],
  'dag-shortest-paths': [
    ['mark', 'u — the vertex the order has reached'],
    ['look', 'the edge being relaxed, and the vertex across it'],
    ['move', 'a vertex whose estimate just came down'],
    ['scope', 'the ring round vertices reached but not yet final'],
    ['done', 'passed in the order, so its estimate is final'],
    ['rest', 'still at ∞'],
  ],
  dijkstra: [
    ['mark', 'u — the vertex EXTRACT-MIN just settled'],
    ['look', 'the edge being relaxed, and the vertex across it'],
    ['move', 'a vertex whose estimate just came down — DECREASE-KEY'],
    ['scope', 'the ring round the frontier: reachable, not yet settled'],
    ['done', 'settled, and the edge on its shortest path'],
    ['rest', 'still at ∞'],
  ],
  // The ring here is the reachable set of the residual network, which at the
  // end of the run *is* the minimum cut — so it earns an entry worded for
  // what it becomes, not just for what it is mid-run.
  'ford-fulkerson': [
    ['mark', 's and t — the source and the sink'],
    ['look', 'the augmenting path this round will use'],
    ['move', 'an edge whose flow just changed'],
    ['scope', 'the ring round what the residual network still reaches — at the end, the cut'],
    ['done', 'an edge at capacity, and the cut side once no path is left'],
    ['rest', 'a vertex or edge this round does not touch'],
  ],
  'edmonds-karp': [
    ['mark', 's and t — the source and the sink'],
    ['look', 'the vertices the search just reached, and the shortest path it found'],
    ['move', 'an edge whose flow just changed'],
    ['scope', 'the ring round what the search has reached — at the end, the cut'],
    ['done', 'an edge at capacity, and the cut side once no path is left'],
    ['rest', 'not reached by this search'],
  ],
  'bipartite-matching': [
    ['mark', 'the unmatched vertex this search started from'],
    ['look', 'the edge being tried, and the vertex across it'],
    ['move', 'an edge joining M, and the pair it now matches'],
    ['scope', 'the ring round the vertices already tried in this search'],
    ['done', 'matched — and the edges of M'],
    ['rest', 'unmatched, and not tried this search'],
  ],
  // The first grid key. What is new here is the **arrow**: a dependency
  // between two cells takes a coded colour, because "this entry came from
  // those two" is the recurrence and there is no cell that says it alone.
  'rod-cutting': [
    ['look', 'the price and the earlier revenue this entry is adding up'],
    ['move', 'the entry just written'],
    ['scope', 'the first cuts available for this length'],
    ['mark', 'the cutting the stored choices reconstruct'],
    ['done', 'an entry already final — it is never recomputed'],
    ['rest', 'a value this step is not using'],
  ],
  // Five entries, not six: in a triangular table every entry that holds a
  // value has already been computed, so `done` claims all of them, and nothing
  // is ever left in `rest`. A key lists what the renderer paints and no more.
  'matrix-chain-order': [
    ['look', 'the two subchains this split would combine'],
    ['move', 'the entry being computed'],
    ['scope', 'the diagonal being filled — all the chains of this length'],
    ['mark', 'the entries the stored splits reconstruct'],
    ['done', 'an entry already final'],
  ],
  lcs: [
    ['look', 'the entries this one could come from'],
    ['move', 'the entry being written, and the arrow saying where it came from'],
    ['scope', 'the zero row and column — nothing is common with an empty sequence'],
    ['mark', 'the path back that spells out the subsequence'],
    ['done', 'an entry already final'],
  ],
  'optimal-bst': [
    ['look', 'the two subtrees this choice of root would join'],
    ['move', 'the entry being computed'],
    ['scope', 'the diagonal being filled — all the subtrees of this size'],
    ['mark', 'the stretches the stored roots reconstruct'],
    ['done', 'an entry already final'],
  ],
  'matrix-multiply': [
    ['look', 'the row of A and the column of B this entry comes from'],
    ['mark', 'the two entries being multiplied right now'],
    ['move', 'the entry being accumulated'],
    ['scope', 'the row of C being filled'],
    ['done', 'an entry already computed'],
    ['rest', 'an entry this step is not reading'],
  ],
  strassen: [
    ['look', 'the entries a product reads, or the products a sum combines'],
    ['move', 'the product or entry just computed'],
    ['scope', 'the seven products, where the definition needs eight'],
    ['done', 'already computed'],
    ['rest', 'an entry this step is not reading'],
  ],
  // The cross of row k and column k is the only route an improvement can
  // take, so it earns `mark` — it is what the reader should be watching, and
  // it is a set of cells rather than a single named one.
  'floyd-warshall': [
    [
      'mark',
      'row k and column k — the cross an improvement comes through; then a negative diagonal entry',
    ],
    ['look', 'the two entries a route through k would use'],
    ['move', 'the entry being tested, or just improved'],
    ['scope', 'row k, the round now being allowed'],
    ['done', 'the finished matrix'],
    ['rest', 'an entry this step is not reading'],
  ],
  'transitive-closure': [
    ['mark', 'row k and column k — the only route a new 1 can take'],
    ['look', 'the two entries that would make this pair connected'],
    ['move', 'the entry being tested, or just turned on'],
    ['scope', 'row k, the round now being allowed'],
    ['done', 'the finished closure'],
    ['rest', 'an entry this step is not reading'],
  ],
  'apsp-matrix-multiply': [
    ['look', 'the row of L and the column of L this entry minimises over'],
    ['mark', 'the pair that actually achieved the minimum'],
    ['move', 'the entry being written into the square'],
    ['scope', 'the row of the square being filled'],
    ['done', 'an entry already computed'],
    ['rest', 'an entry this step is not reading'],
  ],
  johnson: [
    ['mark', 's while the potential is found, then the vertex Dijkstra runs from'],
    ['look', 'the edge being reweighted, and its two ends'],
    ['move', 'an edge whose weight just changed, or a distance just corrected'],
    ['scope', 'the ring round the vertices this run reaches'],
    ['done', 'settled by this run of Dijkstra, and its shortest-path tree'],
    ['rest', 'a vertex this step does not touch'],
  ],
  // The four matchers share a picture — the text over the pattern, shifted —
  // so their keys are worded to say what is different about each, not to
  // describe the same layout four times.
  'naive-string-matcher': [
    ['scope', 'the window this shift is testing'],
    ['look', 'a pair of characters that agree'],
    ['mark', 'the mismatch that kills this shift'],
    ['move', 'an occurrence, the moment it is confirmed'],
    ['done', 'an occurrence already found'],
    ['rest', 'a character this step is not looking at'],
  ],
  'rabin-karp': [
    ['scope', 'the window this shift is testing'],
    ['look', 'a residue that rules the shift out, or the characters a roll uses'],
    ['mark', 'a residue that matches — a candidate, not yet a match'],
    ['move', 'the residue just rolled, or an occurrence confirmed'],
    ['done', 'an occurrence already found'],
    ['rest', 'a character or residue this step is not using'],
  ],
  'finite-automaton-matcher': [
    ['scope', 'the row of δ for the current state'],
    ['look', 'the character read, and the transition it selects'],
    ['move', 'the state just entered, or an occurrence confirmed'],
    ['mark', 'the accepting state'],
    ['done', 'an occurrence already found'],
    ['rest', 'a character or transition this step is not using'],
  ],
  kmp: [
    ['scope', 'the characters matched so far — the prefix q counts'],
    ['look', 'a pair of characters that agree'],
    ['mark', 'a mismatch, and the fallback it forces'],
    ['move', 'a π entry just written, or an occurrence confirmed'],
    ['done', 'an occurrence already found'],
    ['rest', 'a character this step is not looking at'],
  ],
  // Four arrows into every pair of cells: both inputs feed both outputs,
  // which is why the shape is called a butterfly and why the key has to
  // answer for arrows as well as for cells.
  'iterative-fft': [
    ['look', 'the two values a butterfly combines'],
    ['move', 'the two values it produces, or a coefficient being permuted'],
    ['scope', 'the block this stage is combining, and the ω it uses'],
    ['done', 'a stage already computed'],
    ['rest', 'a value this butterfly does not touch'],
  ],
  'lup-decomposition': [
    ['mark', 'the pivot — chosen for size, which is what makes it stable'],
    ['look', 'the entries the elimination reads'],
    ['move', 'an entry just rewritten, or a row just swapped'],
    ['scope', 'the column being searched, or the part of a row that changes'],
    ['done', 'the finished factorization'],
    ['rest', 'an entry this step does not touch'],
  ],
  'lup-solve': [
    [
      'look',
      'the coefficients and known unknowns a step subtracts, or the zero pivot that stops it',
    ],
    ['move', 'the unknown just solved for'],
    ['scope', 'the part of the row this pass is allowed to read'],
    ['done', 'both vectors, once every unknown is known'],
    ['rest', 'an entry this step does not touch'],
  ],
  'suffix-array': [
    ['mark', 'the prefix this round compares, and the block the query lands on'],
    ['look', 'the two suffixes being separated, or the characters they share'],
    ['move', 'a rank or an lcp just written'],
    ['scope', 'the rows the binary search has not ruled out'],
    ['done', 'sorted, and no later round can move it'],
    ['rest', 'a character this step is not reading'],
  ],
  // Only proposals actually made are drawn, so a dashed edge is a proposal
  // that is no longer held. The badge on each vertex is how far down their
  // own list their current partner sits.
  'gale-shapley': [
    ['mark', 'the proposer making an offer'],
    ['look', 'the offer being made, and the receiver weighing it'],
    ['move', 'an offer just accepted'],
    ['scope', 'the ring round the proposers still unmatched'],
    ['done', 'currently paired — held, not yet final'],
    ['rest', 'nobody this step is talking to'],
  ],
  hungarian: [
    ['mark', 'the cheapest way the alternating path can grow'],
    ['look', 'the pairs on the frontier, being priced'],
    ['move', 'a pair just made tight, or a path just flipped'],
    ['scope', 'the row being worked on, or the potentials that just moved'],
    ['done', 'assigned'],
    ['rest', 'a pair this step is not pricing'],
  ],
  // Five entries: a value not yet computed is an empty outline in the neutral
  // ramp, not a coded colour, so this key has no `rest`.
  'extended-euclid': [
    ['look', 'the level this one is built from'],
    ['move', 'the values just written'],
    ['scope', 'the recursion level being worked on'],
    ['mark', 'the answer: the gcd and its two coefficients'],
    ['done', 'a level already settled'],
  ],
  'modular-exponentiation': [
    ['mark', 'the bit being read, and the answer at the end'],
    ['look', 'the previous d, which this one is the square of'],
    ['move', 'c and d, just updated'],
    ['scope', 'the exponent in binary — one squaring per bit'],
    ['done', 'a bit already processed'],
    ['rest', 'a value this step is not using'],
  ],
  rsa: [
    ['look', 'the quantities this one is derived from, and the exponent being applied'],
    ['move', 'the value just computed'],
    ['mark', 'the original message, for comparison with what came back'],
    ['scope', 'the key being generated, and then the ciphertext'],
    ['done', 'settled — the key, and the recovered message'],
    ['rest', 'a value this step is not using'],
  ],
  // The bracket is the *cost*: its width is what the access paid. That is the
  // one thing move-to-front is trying to keep narrow.
  'move-to-front': [
    ['scope', 'the walk to the item — its width is what the access cost'],
    ['mark', 'the request being served'],
    ['look', 'the items stepped over on the way'],
    ['move', 'the item being moved to the front'],
    ['done', 'a request already served'],
    ['rest', 'an item this access did not reach'],
  ],
  // The bracket points *backwards* here, where chapter 15's pointed forwards.
  // That is the whole difference between offline and online, in one mark.
  'online-caching': [
    ['scope', 'the requests already served — all an online policy may look at'],
    ['mark', 'the request being served'],
    ['look', 'the block being evicted, or the hit that was found'],
    ['move', 'the block being brought in'],
    ['done', 'a request already served'],
    ['rest', 'a request not yet reached, or a block sitting in the cache'],
  ],
  // Chapter 35's four keys all have to answer the same extra question: which
  // mark is the *proof*? An approximation algorithm is only worth anything
  // with its bound attached, and in three of the four the bound is visible on
  // the picture rather than only in the prose.
  //
  // Here it is the matching: those edges share no endpoints, so every vertex
  // cover ever written must contain one end of each.
  'approx-vertex-cover': [
    ['mark', 'the matching — the lower bound the factor of 2 rests on'],
    ['look', 'the edge just picked, and the edges it covers'],
    ['move', 'the two ends going into C'],
    ['scope', 'the vertices E′ still reaches'],
    ['done', 'in the cover, and the edges already covered'],
    ['rest', 'still uncovered'],
  ],
  'approx-tsp-tour': [
    ['look', 'the cheapest hop out of the tree'],
    ['move', 'just added — first to the tree, then to the tour'],
    ['mark', 'where the preorder walk has got to'],
    ['done', 'settled: the tree edges, then the tour and the cities it reached'],
    ['rest', 'not reached yet'],
  ],
  'greedy-set-cover': [
    ['look', 'what each set is worth right now'],
    ['mark', 'the largest of those — the set greedy takes'],
    ['move', 'elements this set covers for the first time'],
    ['scope', 'the row joining C'],
    ['done', 'already covered'],
    ['rest', 'still uncovered'],
  ],
  'approx-subset-sum': [
    ['scope', 'the list L, captioned with its length'],
    ['mark', 'the number being folded in, and z* at the end'],
    ['move', 'sums this number just created'],
    ['look', 'about to be discarded — trimmed away, or over t'],
    ['done', 'a number already folded in'],
    ['rest', 'not reached yet'],
  ],
  // Chapter 26 has two running times rather than one, and each key has to say
  // which of them the colour is about. Work is how much is lit; span is the
  // one path through it that nothing can overlap.
  'p-fib': [
    ['move', 'the invocation this processor is in right now'],
    ['look', 'the call it is about to make — spawned, or not'],
    ['mark', 'the longest chain of dependencies: the span'],
    ['done', 'returned, with its value on its shoulder'],
    ['rest', 'not run yet'],
  ],
  'p-matrix-multiply': [
    ['look', 'the column of A and the row of B this step reads'],
    ['move', 'every entry of C — all of them, in one step'],
    ['scope', 'the whole of C, which is one parallel region'],
    ['done', 'the finished product'],
    ['rest', 'an entry this step is not reading'],
  ],
  'p-merge': [
    ['scope', 'the slice of A this call owns — its width is the subproblem'],
    ['mark', 'the median of the longer run, which splits both'],
    ['look', 'the runs being searched for where it belongs'],
    ['move', 'the element being placed, and the slot it lands in'],
    ['done', 'already placed'],
    ['rest', 'not reached yet'],
  ],
  // Chapter 33 is the only one whose pictures are continuous, and each key has
  // to say what the *distance* on screen means, not just which box is which.
  //
  // Here the spokes are the objective function: their squared lengths add up
  // to exactly what k-means minimises.
  'k-means': [
    ['mark', 'the centres, and the point being measured against them'],
    ['look', 'the centres it is measuring to'],
    ['move', 'a point changing centre, or a centre sliding to its mean'],
    ['scope', 'one cluster, boxed with the centre it pulls'],
    ['done', 'settled: no point has a nearer centre'],
    ['rest', 'a point this step is not touching'],
  ],
  'multiplicative-weights': [
    ['mark', 'you — the weighted bet, and what it has cost'],
    ['look', 'the advisors, as this round’s verdict arrives'],
    ['move', 'an advisor who got it wrong, and whose weight is cut'],
    ['done', 'the best advisor in hindsight: the line you are judged against'],
    ['rest', 'an advisor the last step is no longer weighing'],
  ],
  'gradient-descent': [
    ['mark', 'where it is now'],
    ['look', 'the tangent — the gradient it is about to follow'],
    ['move', 'the step just taken, and where it landed'],
    // No `rest`: a position on this chart has either been visited or is the
    // one being visited, and there is no third state for it to be in.
    ['done', 'positions already left behind'],
  ],
  // The band is the definition, and n₀ is the only thing being searched for.
  'asymptotic-bound': [
    ['look', 'the n being tested'],
    ['move', 'an n where f falls outside the band'],
    ['mark', 'n₀ — the first n it never escapes after'],
    ['scope', 'n ≥ n₀, the only region the definition speaks about'],
    ['done', 'inside both bounds'],
    ['rest', 'not tested yet'],
  ],
  'randomize-in-place': [
    ['mark', 'the slot the draw chose'],
    ['move', 'the exchange'],
    ['scope', 'still in play — the draw picks from here'],
    ['done', 'fixed, and never touched again'],
    ['rest', 'still unplaced'],
  ],
};

export function legendFor(algorithmId: string): Legend {
  return LEGENDS[algorithmId] ?? DEFAULT_LEGEND;
}
