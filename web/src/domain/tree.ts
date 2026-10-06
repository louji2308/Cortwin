/**
 * C-03 runtime-form decision tree: float32 split walk plus the exact
 * reduced-game Shapley values. Reference: `pipeline/shap_exact.py`.
 *
 * Why the values are exact (Architecture §8.3): every tree is depth-2 and
 * therefore splits on at most 3 distinct features. A tree's leaf depends on
 * case evidence only through those <= 3 **observed** split features, so the
 * 54-player interventional game factorises into a <= 3-player game and the
 * tree's Shapley values are those of the reduced game (0 elsewhere) — 2^k
 * subset evaluations per tree, no sampling.
 *
 * Numerics: split comparisons are float32 (thresholds are rounded once at
 * construction with `Math.fround`; row values are rounded once before the
 * walk), all accumulations are float64. Determinism: split features sorted
 * ascending, subsets enumerated by bitmask, trees walked in document order.
 */
import { DomainError } from "./errors";
import type { ModelNode } from "./model";

/** C-03 exact-attribution bound, re-checked at export. */
export const MAX_SPLIT_FEATURES = 3;

const FACTORIAL = [1, 1, 2, 6];

function artifactError(message: string): DomainError {
  return new DomainError("ARTIFACT_INVALID", message);
}

function popcount(bits: number): number {
  let count = 0;
  let value = bits;
  while (value !== 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

/** Reusable buffers for `addTreeShapley` (one per explanation call). */
export type TreeShapleyScratch = {
  /** Coalition matrix copy: `backgroundCount * featureCount`. */
  buffer: Float64Array;
  /** Leaf of every row for the current subset. */
  leaves: Float64Array;
  /** `v(S)` for every subset of the reduced game. */
  subsetValues: Float64Array;
};

export function createTreeShapleyScratch(
  backgroundCount: number,
  featureCount: number,
): TreeShapleyScratch {
  return {
    buffer: new Float64Array(backgroundCount * featureCount),
    leaves: new Float64Array(backgroundCount),
    subsetValues: new Float64Array(1 << MAX_SPLIT_FEATURES),
  };
}

export class DecisionTree {
  /** Distinct split feature indices, ascending (C-03 determinism). */
  readonly splitFeatures: readonly number[];
  readonly maxFeatureIndex: number;

  private readonly feature: Int32Array;
  private readonly threshold: Float64Array;
  private readonly left: Int32Array;
  private readonly right: Int32Array;
  private readonly leafValue: Float64Array;
  private readonly isLeaf: Uint8Array;

  constructor(nodes: ModelNode[]) {
    if (nodes.length === 0) throw artifactError("tree has no nodes");
    const size = nodes.length;
    const feature = new Int32Array(size);
    const threshold = new Float64Array(size);
    const left = new Int32Array(size);
    const right = new Int32Array(size);
    const leafValue = new Float64Array(size);
    const isLeaf = new Uint8Array(size);
    const split = new Set<number>();
    let maxFeatureIndex = -1;

    for (let index = 0; index < size; index += 1) {
      const node = nodes[index];
      if (node.leaf !== null) {
        if (node.featureIndex !== null || node.left !== null) {
          throw artifactError(`tree node ${index} mixes leaf and split fields`);
        }
        feature[index] = -1;
        threshold[index] = 0;
        left[index] = -1;
        right[index] = -1;
        leafValue[index] = node.leaf;
        isLeaf[index] = 1;
        continue;
      }
      if (node.featureIndex === null || node.featureIndex < 0) {
        throw artifactError(`tree node ${index} has no valid featureIndex`);
      }
      const splitThreshold = node.threshold;
      if (splitThreshold === null || !Number.isFinite(splitThreshold)) {
        throw artifactError(`tree node ${index} threshold is not finite`);
      }
      if (node.left === null || node.right === null) {
        throw artifactError(`tree node ${index} has no child indices`);
      }
      feature[index] = node.featureIndex;
      threshold[index] = Math.fround(splitThreshold);
      left[index] = node.left;
      right[index] = node.right;
      leafValue[index] = 0;
      isLeaf[index] = 0;
      split.add(node.featureIndex);
      if (node.featureIndex > maxFeatureIndex) maxFeatureIndex = node.featureIndex;
    }

    for (let index = 0; index < size; index += 1) {
      if (isLeaf[index] === 1) continue;
      for (const child of [left[index], right[index]]) {
        if (child < 0 || child >= size) {
          throw artifactError(`tree node ${index} child ${child} outside [0, ${size})`);
        }
        if (child === index) throw artifactError(`tree node ${index} references itself`);
      }
    }
    rejectCycles(feature, left, right, isLeaf);

    this.feature = feature;
    this.threshold = threshold;
    this.left = left;
    this.right = right;
    this.leafValue = leafValue;
    this.isLeaf = isLeaf;
    this.maxFeatureIndex = maxFeatureIndex;
    this.splitFeatures = [...split].sort((a, b) => a - b);
    if (this.splitFeatures.length > MAX_SPLIT_FEATURES) {
      throw artifactError(
        `tree splits on ${this.splitFeatures.length} distinct features; ` +
          `the C-03 exact-attribution bound is ${MAX_SPLIT_FEATURES}`,
      );
    }
  }

  /**
   * Leaf value per row. `matrix` holds `rows * width` entries in row-major
   * order that are ALREADY rounded to float32 (the walk itself is a plain
   * comparison, exactly `pipeline/shap_exact.py::DecisionTree.leaves` after
   * its rounding step).
   */
  leavesInto(matrix: Float64Array, rows: number, width: number, out: Float64Array): void {
    const feature = this.feature;
    const threshold = this.threshold;
    const left = this.left;
    const right = this.right;
    const isLeaf = this.isLeaf;
    const leafValue = this.leafValue;
    if (width <= this.maxFeatureIndex) {
      throw artifactError("tree walk received rows narrower than its split features");
    }
    for (let row = 0; row < rows; row += 1) {
      const base = row * width;
      let node = 0;
      while (isLeaf[node] === 0) {
        node = matrix[base + feature[node]] < threshold[node] ? left[node] : right[node];
      }
      out[row] = leafValue[node];
    }
  }
}

/**
 * Reject any cycle reachable from the root (a cyclic walk would hang);
 * mirrors `pipeline/shap_exact.py::DecisionTree._reject_cycles` — colours are
 * 0 unseen, 1 on the DFS stack, 2 finished.
 */
function rejectCycles(
  feature: Int32Array,
  left: Int32Array,
  right: Int32Array,
  isLeaf: Uint8Array,
): void {
  const colour = new Uint8Array(feature.length);
  const stack: number[] = [0, 0];
  while (stack.length > 0) {
    const stage = stack.pop() as number;
    const node = stack.pop() as number;
    if (stage === 0) {
      if (colour[node] === 1) throw artifactError(`tree node ${node} is part of a cycle`);
      if (colour[node] === 2 || isLeaf[node] === 1) continue;
      colour[node] = 1;
      stack.push(node, 1, right[node], 0, left[node], 0);
    } else {
      colour[node] = 2;
    }
  }
}

/**
 * Add one tree's exact Shapley values into `out` (raw-margin space, unscaled).
 *
 * `backgroundRounded` and `caseRow` must already be rounded to float32, which
 * makes them identical to Python rounding the raw background inside every
 * subset walk (`Math.fround(Math.fround(x)) === Math.fround(x)`).
 */
export function addTreeShapley(
  tree: DecisionTree,
  backgroundRounded: Float64Array,
  caseRow: Float64Array,
  observedMask: Uint8Array,
  featureCount: number,
  backgroundCount: number,
  scratch: TreeShapleyScratch,
  out: Float64Array,
): void {
  const players: number[] = [];
  for (const index of tree.splitFeatures) {
    if (observedMask[index] === 1) players.push(index);
  }
  if (players.length === 0) return;

  const subsetCount = 1 << players.length;
  const buffer = scratch.buffer;
  buffer.set(backgroundRounded);

  for (let bits = 0; bits < subsetCount; bits += 1) {
    for (let position = 0; position < players.length; position += 1) {
      const index = players[position];
      const caseValue = caseRow[index];
      if ((bits & (1 << position)) !== 0) {
        for (let row = 0; row < backgroundCount; row += 1) {
          buffer[row * featureCount + index] = caseValue;
        }
      } else {
        for (let row = 0; row < backgroundCount; row += 1) {
          buffer[row * featureCount + index] = backgroundRounded[row * featureCount + index];
        }
      }
    }
    tree.leavesInto(buffer, backgroundCount, featureCount, scratch.leaves);
    let total = 0;
    for (let row = 0; row < backgroundCount; row += 1) total += scratch.leaves[row];
    scratch.subsetValues[bits] = total / backgroundCount;
  }

  const normaliser = FACTORIAL[players.length];
  for (let position = 0; position < players.length; position += 1) {
    let coordinate = 0;
    const flag = 1 << position;
    for (let bits = 0; bits < subsetCount; bits += 1) {
      if ((bits & flag) !== 0) continue;
      const size = popcount(bits);
      const weight = (FACTORIAL[size] * FACTORIAL[players.length - size - 1]) / normaliser;
      coordinate += weight * (scratch.subsetValues[bits | flag] - scratch.subsetValues[bits]);
    }
    out[players[position]] += coordinate;
  }
}
