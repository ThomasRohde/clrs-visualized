import type { AlgorithmModule } from './types.ts';

/**
 * Client-side loaders, one dynamic import per algorithm.
 *
 * The chapter page renders pseudocode and complexity tables at build time, so
 * the browser only needs the recorder for the algorithm actually on screen.
 * Each entry becomes its own Vite chunk, which keeps page weight flat as the
 * book fills out — add fifty algorithms and a reader still downloads one.
 *
 * Keep this in sync with registry.ts when adding an algorithm.
 */
export const ALGORITHM_LOADERS: Record<string, () => Promise<AlgorithmModule>> = {
  'hire-assistant': () => import('./randomized/hire-assistant.js').then((m) => m.hireAssistant),
  'permute-by-sorting': () =>
    import('./randomized/permute-by-sorting.js').then((m) => m.permuteBySorting),
  'randomize-in-place': () =>
    import('./randomized/randomize-in-place.js').then((m) => m.randomizeInPlace),
  'insertion-sort': () => import('./sorting/insertion-sort.js').then((m) => m.insertionSort),
  'merge-sort': () => import('./sorting/merge-sort.js').then((m) => m.mergeSort),
  'binary-search': () => import('./searching/binary-search.js').then((m) => m.binarySearch),
  'count-inversions': () => import('./sorting/count-inversions.js').then((m) => m.countInversions),
  'hoare-partition': () => import('./sorting/hoare-partition.js').then((m) => m.hoarePartition),
  heapsort: () => import('./sorting/heapsort.js').then((m) => m.heapsort),
  'max-priority-queue': () =>
    import('./sorting/max-priority-queue.js').then((m) => m.maxPriorityQueue),
  quicksort: () => import('./sorting/quicksort.js').then((m) => m.quicksort),
  'randomized-quicksort': () =>
    import('./sorting/randomized-quicksort.js').then((m) => m.randomizedQuicksort),
  'counting-sort': () => import('./sorting/counting-sort.js').then((m) => m.countingSort),
  'radix-sort': () => import('./sorting/radix-sort.js').then((m) => m.radixSort),
  'bucket-sort': () => import('./sorting/bucket-sort.js').then((m) => m.bucketSort),
  'minimum-maximum': () => import('./selection/minimum-maximum.js').then((m) => m.minimumMaximum),
  'randomized-select': () =>
    import('./selection/randomized-select.js').then((m) => m.randomizedSelect),
  select: () => import('./selection/select.js').then((m) => m.select),
  stack: () => import('./structures/stack.js').then((m) => m.stack),
  'linked-list': () => import('./structures/linked-list.js').then((m) => m.linkedList),
  'chained-hash': () => import('./structures/chained-hash.js').then((m) => m.chainedHash),
  'open-addressing': () => import('./structures/open-addressing.js').then((m) => m.openAddressing),
  'binary-counter': () => import('./structures/binary-counter.js').then((m) => m.binaryCounter),
  multipop: () => import('./structures/multipop.js').then((m) => m.multipop),
  'dynamic-table': () => import('./structures/dynamic-table.js').then((m) => m.dynamicTable),
  bst: () => import('./trees/bst.js').then((m) => m.bst),
  'red-black-tree': () => import('./trees/red-black-tree.js').then((m) => m.redBlackTree),
  'activity-selection': () =>
    import('./greedy/activity-selection.js').then((m) => m.activitySelection),
  huffman: () => import('./greedy/huffman.js').then((m) => m.huffman),
  'offline-caching': () => import('./greedy/offline-caching.js').then((m) => m.offlineCaching),
  'order-statistic-tree': () =>
    import('./trees/order-statistic-tree.js').then((m) => m.orderStatisticTree),
  'interval-tree': () => import('./trees/interval-tree.js').then((m) => m.intervalTree),
  'b-tree': () => import('./trees/b-tree.js').then((m) => m.bTree),
  'disjoint-sets': () => import('./trees/disjoint-sets.js').then((m) => m.disjointSets),
  bfs: () => import('./graphs/bfs.js').then((m) => m.bfs),
  dfs: () => import('./graphs/dfs.js').then((m) => m.dfs),
  'topological-sort': () => import('./graphs/topological-sort.js').then((m) => m.topologicalSort),
  'strongly-connected-components': () =>
    import('./graphs/strongly-connected-components.js').then((m) => m.stronglyConnectedComponents),
  'mst-kruskal': () => import('./graphs/mst-kruskal.js').then((m) => m.mstKruskal),
  'mst-prim': () => import('./graphs/mst-prim.js').then((m) => m.mstPrim),
  'bellman-ford': () => import('./graphs/bellman-ford.js').then((m) => m.bellmanFord),
  'dag-shortest-paths': () =>
    import('./graphs/dag-shortest-paths.js').then((m) => m.dagShortestPaths),
  dijkstra: () => import('./graphs/dijkstra.js').then((m) => m.dijkstra),
  'ford-fulkerson': () => import('./graphs/ford-fulkerson.js').then((m) => m.fordFulkerson),
  'edmonds-karp': () => import('./graphs/edmonds-karp.js').then((m) => m.edmondsKarp),
  'bipartite-matching': () =>
    import('./graphs/bipartite-matching.js').then((m) => m.bipartiteMatching),
  'maximum-subarray': () => import('./dp/maximum-subarray.js').then((m) => m.maximumSubarray),
  'rod-cutting': () => import('./dp/rod-cutting.js').then((m) => m.rodCutting),
  'matrix-chain-order': () => import('./dp/matrix-chain-order.js').then((m) => m.matrixChainOrder),
  lcs: () => import('./dp/lcs.js').then((m) => m.lcs),
  'optimal-bst': () => import('./dp/optimal-bst.js').then((m) => m.optimalBst),
  'matrix-multiply': () => import('./matrix/matrix-multiply.js').then((m) => m.matrixMultiply),
  strassen: () => import('./matrix/strassen.js').then((m) => m.strassen),
  'floyd-warshall': () => import('./matrix/floyd-warshall.js').then((m) => m.floydWarshall),
  'transitive-closure': () =>
    import('./matrix/transitive-closure.js').then((m) => m.transitiveClosure),
  'apsp-matrix-multiply': () =>
    import('./matrix/apsp-matrix-multiply.js').then((m) => m.apspMatrixMultiply),
  johnson: () => import('./graphs/johnson.js').then((m) => m.johnson),
  'naive-string-matcher': () =>
    import('./strings/naive-string-matcher.js').then((m) => m.naiveStringMatcher),
  'rabin-karp': () => import('./strings/rabin-karp.js').then((m) => m.rabinKarp),
  'finite-automaton-matcher': () =>
    import('./strings/finite-automaton-matcher.js').then((m) => m.finiteAutomatonMatcher),
  kmp: () => import('./strings/kmp.js').then((m) => m.kmp),
  'iterative-fft': () => import('./fft/iterative-fft.js').then((m) => m.iterativeFft),
  'lup-decomposition': () =>
    import('./matrix/lup-decomposition.js').then((m) => m.lupDecomposition),
  'lup-solve': () => import('./matrix/lup-solve.js').then((m) => m.lupSolve),
  'suffix-array': () => import('./strings/suffix-array.js').then((m) => m.suffixArray),
  'gale-shapley': () => import('./graphs/gale-shapley.js').then((m) => m.galeShapley),
  hungarian: () => import('./matrix/hungarian.js').then((m) => m.hungarian),
  'extended-euclid': () => import('./numbers/extended-euclid.js').then((m) => m.extendedEuclid),
  'modular-exponentiation': () =>
    import('./numbers/modular-exponentiation.js').then((m) => m.modularExponentiation),
  rsa: () => import('./numbers/rsa.js').then((m) => m.rsa),
  'move-to-front': () => import('./online/move-to-front.js').then((m) => m.moveToFront),
  'online-caching': () => import('./online/online-caching.js').then((m) => m.onlineCaching),
  'approx-vertex-cover': () =>
    import('./approx/approx-vertex-cover.js').then((m) => m.approxVertexCover),
  'approx-tsp-tour': () => import('./approx/approx-tsp-tour.js').then((m) => m.approxTspTour),
  'greedy-set-cover': () => import('./approx/greedy-set-cover.js').then((m) => m.greedySetCover),
  'approx-subset-sum': () => import('./approx/approx-subset-sum.js').then((m) => m.approxSubsetSum),
  'p-fib': () => import('./parallel/p-fib.js').then((m) => m.pFib),
  'p-matrix-multiply': () =>
    import('./parallel/p-matrix-multiply.js').then((m) => m.pMatrixMultiply),
  'p-merge': () => import('./parallel/p-merge.js').then((m) => m.pMerge),
  'k-means': () => import('./learning/k-means.js').then((m) => m.kMeans),
  'multiplicative-weights': () =>
    import('./learning/multiplicative-weights.js').then((m) => m.multiplicativeWeights),
  'gradient-descent': () => import('./learning/gradient-descent.js').then((m) => m.gradientDescent),
  'asymptotic-bound': () => import('./growth/asymptotic-bound.js').then((m) => m.asymptoticBound),
};

export async function loadAlgorithm(id: string): Promise<AlgorithmModule> {
  const loader = ALGORITHM_LOADERS[id];
  if (!loader) {
    throw new Error(
      `No client loader registered for algorithm "${id}" (see src/algorithms/lazy.ts).`,
    );
  }
  return loader();
}
