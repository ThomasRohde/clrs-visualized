import type { AlgorithmModule } from './types.ts';

import { insertionSort } from './sorting/insertion-sort.ts';
import { binarySearch } from './searching/binary-search.ts';
import { countInversions } from './sorting/count-inversions.ts';
import { hoarePartition } from './sorting/hoare-partition.ts';
import { mergeSort } from './sorting/merge-sort.ts';
import { heapsort } from './sorting/heapsort.ts';
import { maxPriorityQueue } from './sorting/max-priority-queue.ts';
import { quicksort } from './sorting/quicksort.ts';
import { randomizedQuicksort } from './sorting/randomized-quicksort.ts';
import { countingSort } from './sorting/counting-sort.ts';
import { radixSort } from './sorting/radix-sort.ts';
import { bucketSort } from './sorting/bucket-sort.ts';
import { minimumMaximum } from './selection/minimum-maximum.ts';
import { randomizedSelect } from './selection/randomized-select.ts';
import { select } from './selection/select.ts';
import { hireAssistant } from './randomized/hire-assistant.ts';
import { permuteBySorting } from './randomized/permute-by-sorting.ts';
import { randomizeInPlace } from './randomized/randomize-in-place.ts';
import { stack } from './structures/stack.ts';
import { linkedList } from './structures/linked-list.ts';
import { chainedHash } from './structures/chained-hash.ts';
import { openAddressing } from './structures/open-addressing.ts';
import { binaryCounter } from './structures/binary-counter.ts';
import { multipop } from './structures/multipop.ts';
import { dynamicTable } from './structures/dynamic-table.ts';
import { bst } from './trees/bst.ts';
import { redBlackTree } from './trees/red-black-tree.ts';
import { activitySelection } from './greedy/activity-selection.ts';
import { huffman } from './greedy/huffman.ts';
import { offlineCaching } from './greedy/offline-caching.ts';
import { orderStatisticTree } from './trees/order-statistic-tree.ts';
import { intervalTree } from './trees/interval-tree.ts';
import { bTree } from './trees/b-tree.ts';
import { disjointSets } from './trees/disjoint-sets.ts';
import { bfs } from './graphs/bfs.ts';
import { dfs } from './graphs/dfs.ts';
import { topologicalSort } from './graphs/topological-sort.ts';
import { stronglyConnectedComponents } from './graphs/strongly-connected-components.ts';
import { mstKruskal } from './graphs/mst-kruskal.ts';
import { mstPrim } from './graphs/mst-prim.ts';
import { bellmanFord } from './graphs/bellman-ford.ts';
import { dagShortestPaths } from './graphs/dag-shortest-paths.ts';
import { dijkstra } from './graphs/dijkstra.ts';
import { fordFulkerson } from './graphs/ford-fulkerson.ts';
import { edmondsKarp } from './graphs/edmonds-karp.ts';
import { bipartiteMatching } from './graphs/bipartite-matching.ts';
import { rodCutting } from './dp/rod-cutting.ts';
import { matrixChainOrder } from './dp/matrix-chain-order.ts';
import { lcs } from './dp/lcs.ts';
import { optimalBst } from './dp/optimal-bst.ts';
import { matrixMultiply } from './matrix/matrix-multiply.ts';
import { strassen } from './matrix/strassen.ts';
import { floydWarshall } from './matrix/floyd-warshall.ts';
import { transitiveClosure } from './matrix/transitive-closure.ts';
import { apspMatrixMultiply } from './matrix/apsp-matrix-multiply.ts';
import { johnson } from './graphs/johnson.ts';
import { naiveStringMatcher } from './strings/naive-string-matcher.ts';
import { rabinKarp } from './strings/rabin-karp.ts';
import { finiteAutomatonMatcher } from './strings/finite-automaton-matcher.ts';
import { kmp } from './strings/kmp.ts';
import { iterativeFft } from './fft/iterative-fft.ts';
import { lupDecomposition } from './matrix/lup-decomposition.ts';
import { lupSolve } from './matrix/lup-solve.ts';
import { suffixArray } from './strings/suffix-array.ts';
import { galeShapley } from './graphs/gale-shapley.ts';
import { hungarian } from './matrix/hungarian.ts';
import { extendedEuclid } from './numbers/extended-euclid.ts';
import { modularExponentiation } from './numbers/modular-exponentiation.ts';
import { rsa } from './numbers/rsa.ts';
import { moveToFront } from './online/move-to-front.ts';
import { onlineCaching } from './online/online-caching.ts';
import { approxVertexCover } from './approx/approx-vertex-cover.ts';
import { approxTspTour } from './approx/approx-tsp-tour.ts';
import { greedySetCover } from './approx/greedy-set-cover.ts';
import { approxSubsetSum } from './approx/approx-subset-sum.ts';
import { pFib } from './parallel/p-fib.ts';
import { pMatrixMultiply } from './parallel/p-matrix-multiply.ts';
import { pMerge } from './parallel/p-merge.ts';
import { kMeans } from './learning/k-means.ts';
import { multiplicativeWeights } from './learning/multiplicative-weights.ts';
import { gradientDescent } from './learning/gradient-descent.ts';
import { asymptoticBound } from './growth/asymptotic-bound.ts';

/**
 * Every algorithm the site can animate.
 *
 * TO ADD AN ALGORITHM:
 *   1. Write `src/algorithms/<area>/<name>.ts` exporting an AlgorithmModule.
 *   2. Import it and add it to the array below.
 *   3. Reference its `id` from a chapter's frontmatter (`algorithms: [...]`).
 *
 * Nothing else needs to change — the chapter page picks up the visualizer,
 * the pseudocode and the complexity table from the module itself.
 */
export const ALGORITHMS: AlgorithmModule[] = [
  // Book order. Chapter 5 comes first because that is where it sits in the
  // book, even though it was written after the sorts.
  hireAssistant,
  permuteBySorting,
  randomizeInPlace,
  insertionSort,
  mergeSort,
  binarySearch,
  countInversions,
  heapsort,
  maxPriorityQueue,
  quicksort,
  randomizedQuicksort,
  hoarePartition,
  countingSort,
  radixSort,
  bucketSort,
  minimumMaximum,
  randomizedSelect,
  select,
  stack,
  linkedList,
  chainedHash,
  openAddressing,
  binaryCounter,
  multipop,
  dynamicTable,
  bst,
  redBlackTree,
  activitySelection,
  huffman,
  offlineCaching,
  orderStatisticTree,
  intervalTree,
  bTree,
  disjointSets,
  bfs,
  dfs,
  topologicalSort,
  stronglyConnectedComponents,
  mstKruskal,
  mstPrim,
  bellmanFord,
  dagShortestPaths,
  dijkstra,
  fordFulkerson,
  edmondsKarp,
  bipartiteMatching,
  rodCutting,
  matrixChainOrder,
  lcs,
  optimalBst,
  matrixMultiply,
  strassen,
  floydWarshall,
  transitiveClosure,
  apspMatrixMultiply,
  johnson,
  naiveStringMatcher,
  rabinKarp,
  finiteAutomatonMatcher,
  kmp,
  iterativeFft,
  lupDecomposition,
  lupSolve,
  suffixArray,
  galeShapley,
  hungarian,
  extendedEuclid,
  modularExponentiation,
  rsa,
  moveToFront,
  onlineCaching,
  approxVertexCover,
  approxTspTour,
  greedySetCover,
  approxSubsetSum,
  pFib,
  pMatrixMultiply,
  pMerge,
  kMeans,
  multiplicativeWeights,
  gradientDescent,
  asymptoticBound,
];

const BY_ID = new Map(ALGORITHMS.map((a) => [a.id, a]));

export function getAlgorithm(id: string): AlgorithmModule | undefined {
  return BY_ID.get(id);
}

export function requireAlgorithm(id: string): AlgorithmModule {
  const found = BY_ID.get(id);
  if (!found) {
    throw new Error(
      `Unknown algorithm id "${id}". Known ids: ${[...BY_ID.keys()].join(', ')}. ` +
        `Register it in src/algorithms/registry.ts.`,
    );
  }
  return found;
}

/** Ids of everything implemented, for build-time validation of frontmatter. */
export const ALGORITHM_IDS = ALGORITHMS.map((a) => a.id);
