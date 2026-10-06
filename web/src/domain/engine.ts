/**
 * C-07 compute engine over one immutable runtime-form document (C-03) plus
 * the C-02 registry. References: `pipeline/oracle.py`, `pipeline/shap_exact.py`,
 * `pipeline/encode.py`, `tests/test_fixtures.py`.
 *
 * Arithmetic (C-03/C-08, unchanged from the validated pipeline):
 *
 * * `treeMargin(x) = baseScore + Σ leaves`, float32 split comparisons and
 *   float64 accumulation;
 * * `linearMargin(x) = intercept + Σ coef·(x − mean)/scale`;
 * * `rawMargin = 0.5·treeMargin + 0.5·linearMargin`;
 * * `calibratedMargin = slope·rawMargin + intercept`, `p = sigmoid(...)`;
 * * decisions live in **raw** margin space: `above` iff `raw > thr + h`,
 *   `below` iff `raw < thr − h`, otherwise `indeterminate` (band edges belong
 *   to `indeterminate`);
 * * reliability is looked up from `reliabilityReferences`, never derived;
 * * headline CAD: argmax over the four targets (first maximum wins in C-03
 *   target order); decision/reliability/threshold come from CAD.
 *
 * Missing evidence (the only allowed value function, C-08): with `O` the
 * observed features, `B` the shipped background rows and
 * `g(x) = slope·0.5·(tree+linear) + intercept`:
 *
 *     v(S) = mean over b∈B of g(x restricted to S, b elsewhere),  S ⊆ O
 *     p    = sigmoid(v(O));  reference = v(∅) in calibrated-margin space
 *     φ_i  = exact Shapley of i in game (O, v), scaled by 0.5·slope
 *     Σφ + reference = output   (|residual| ≤ 1e-6)
 *
 * Purity (C-08 §6.2): no React, Zustand, three.js, DOM, storage, network or
 * worker APIs — the same code runs in the worker, the main-thread adapter and
 * Node. Errors are typed (`DomainError`) and their messages never carry
 * patient values (C-07 §6.1).
 */
import type { FixtureTolerance, Registry } from "../contracts/artifacts";
import {
  COMPUTE_CHANNELS,
  COMPUTE_ERROR_CODES,
  COMPUTE_LANES,
  COMPUTE_OPERATIONS,
  COMPUTE_PROTOCOL_VERSION,
} from "../contracts/compute";
import type {
  ComputeChannel,
  ComputeErrorCode,
  ComputeLane,
  ComputeOperation,
  ComputeRequest,
  ComputeResponse,
  IntegrityPayload,
  LadderPayload,
} from "../contracts/compute";
import type {
  Evaluation,
  Explanation,
  HeadlineCad,
  TargetEvaluation,
} from "../contracts/evaluation";
import type { DecisionState, ReliabilityTier, StageId, TargetId } from "../contracts/primitives";
import { encodeCase } from "./encoder";
import { DomainError } from "./errors";
import { CONTRACT_TARGETS, parseModelDocument, validateRegistryCorrespondence } from "./model";
import type { ModelDocument, PercentileEntry } from "./model";
import { directionOf, rawMarginFromProbability, sigmoid } from "./numbers";
import { DecisionTree, addTreeShapley, createTreeShapleyScratch } from "./tree";

/** C-08 §6.2 caveats, in contract order (rendered verbatim by the UI). */
export const CAVEATS = [
  "ATTRIBUTION_NOT_CAUSATION",
  "CORRELATED_FEATURES_SHARE_CREDIT",
  "BACKGROUND_SET_DEPENDENT",
] as const;

/** Narrative templates are deterministic and copy-free (Architecture ADR-18). */
export const NARRATIVE_TEMPLATE_ATTRIBUTION = "explanation-attribution";
export const NARRATIVE_TEMPLATE_NO_EVIDENCE = "explanation-no-evidence";

/** C-07 §6.1 `recoverable` honesty rule (mirrors `worker/protocol.ts`). */
const RECOVERABLE_BY_CODE: Record<ComputeErrorCode, boolean> = {
  MALFORMED_REQUEST: true,
  UNSUPPORTED_OPERATION: true,
  INVALID_FEATURE_VECTOR: true,
  NONFINITE_INPUT: true,
  ARTIFACT_INVALID: false,
  INTERNAL_COMPUTE_FAILURE: false,
};

const CAVEAT_LIST: string[] = [...CAVEATS];
const INTERNAL_MESSAGE = "Internal compute failure";

type LinearBlock = {
  intercept: number;
  coefficients: Float64Array;
  means: Float64Array;
  scales: Float64Array;
};

type PreparedTarget = {
  targetId: TargetId;
  trees: DecisionTree[];
  baseScore: number;
  linear: LinearBlock;
  plattSlope: number;
  plattIntercept: number;
  thresholdProbability: number;
  thresholdMargin: number;
  halfWidthMargin: number;
  lowerProbability: number;
  upperProbability: number;
  reliability: ReliabilityTier;
};

/** Everything `execute` needs, built once by `prepareArtifacts`. */
export type PreparedEngine = {
  modelId: string;
  dataSha256: string | null;
  registry: Registry;
  featureIds: string[];
  featureCount: number;
  backgroundCount: number;
  /** Background rounded to float32, row-major (`count × features`). */
  backgroundRounded: Float64Array;
  /** Empirical mean of the RAW background rows — what keeps INV-02 exact. */
  backgroundMean: Float64Array;
  referenceRaw: Float64Array;
  targets: PreparedTarget[];
  targetIndex: Map<TargetId, number>;
  modalityOfFeature: string[];
  modalityOrder: string[];
  modalityMembers: Map<string, number[]>;
  groupOfFeature: string[];
  groupOrder: string[];
  groupMembers: Map<string, number[]>;
  percentiles: PercentileEntry[];
  isContinuous: Uint8Array;
  rangeMin: Float64Array;
  rangeMax: Float64Array;
  stages: Array<{ id: StageId; modalities: Set<string> }>;
};

/** Per-`execute` scratch so hot paths allocate nothing per target. */
type ComputeScratch = {
  matrix: Float64Array;
  tree: Float64Array;
  leaves: Float64Array;
};

type FixtureFailure = { code: ComputeErrorCode; featureId: string };

type FixtureTarget = {
  targetId: string;
  probability: number;
  calibratedMargin: number;
  thresholdProbability: number;
  decision: string;
  reliability: string;
  abstention: {
    lowerProbability: number;
    upperProbability: number;
    halfWidthMargin: number;
  };
};

type FixtureAttribution = {
  featureId: string;
  value: number;
  contribution: number;
  direction: string;
};

type FixtureAggregation = {
  id: string;
  contribution: number;
  memberFeatureIds: string[];
};

type FixtureExplanation = {
  targetId: string;
  referenceMargin: number;
  outputMargin: number;
  efficiencyResidual: number;
  featureAttributions: FixtureAttribution[];
  displayGroups: FixtureAggregation[];
  modalityContributions: FixtureAggregation[];
  caveats: string[];
};

type FixtureExpectation = {
  targets: Record<TargetId, FixtureTarget>;
  headline: {
    probability: number;
    valueSourceTargetId: string;
    decision: string;
    reliability: string;
  };
  rangeFlags: Record<string, boolean>;
  explanations: Record<TargetId, FixtureExplanation>;
};

type Fixture = {
  id: string;
  coverageTags: string[];
  values: Record<string, unknown>;
  providedFeatures: Record<string, boolean>;
  failure: FixtureFailure | null;
  expectation: FixtureExpectation | null;
};

type FixtureSet = {
  fixtureSetId: string;
  tolerance: FixtureTolerance;
  fixtures: Fixture[];
};

type DeviationState = {
  probability: number;
  margin: number;
  attribution: number;
  efficiency: number;
  passed: boolean;
};

function malformed(message: string): DomainError {
  return new DomainError("MALFORMED_REQUEST", message);
}

function artifactInvalid(message: string): DomainError {
  return new DomainError("ARTIFACT_INVALID", message);
}

function nowMs(): number {
  const host = globalThis.performance;
  return typeof host?.now === "function" ? host.now() : Date.now();
}

function codeOf(error: unknown): ComputeErrorCode {
  return error instanceof DomainError ? error.code : "INTERNAL_COMPUTE_FAILURE";
}

function messageOf(error: unknown): string {
  if (error instanceof DomainError) return error.message.slice(0, 200);
  return INTERNAL_MESSAGE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw artifactInvalid(`${label} is not an object`);
  return value;
}

function requireFinite(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw artifactInvalid(`${label}.${key} is not a finite number`);
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw artifactInvalid(`${label}.${key} is not a string`);
  }
  return value;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toFloatMatrix(rows: number[][], featureCount: number): Float64Array {
  const matrix = new Float64Array(rows.length * featureCount);
  for (let row = 0; row < rows.length; row += 1) {
    const source = rows[row];
    const base = row * featureCount;
    for (let index = 0; index < featureCount; index += 1) matrix[base + index] = source[index];
  }
  return matrix;
}

function roundToFloat32(values: Float64Array): Float64Array {
  const rounded = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    rounded[index] = Math.fround(values[index]);
  }
  return rounded;
}

/** Mean raw ensemble margin over the coalition rows, in C-03 order. */
function meanRawMargin(
  target: PreparedTarget,
  matrix: Float64Array,
  rows: number,
  featureCount: number,
  treeOut: Float64Array,
  leavesOut: Float64Array,
): number {
  for (let row = 0; row < rows; row += 1) treeOut[row] = 0;
  for (const tree of target.trees) {
    tree.leavesInto(matrix, rows, featureCount, leavesOut);
    for (let row = 0; row < rows; row += 1) treeOut[row] += leavesOut[row];
  }
  for (let row = 0; row < rows; row += 1) treeOut[row] += target.baseScore;

  const linear = target.linear;
  let total = 0;
  for (let row = 0; row < rows; row += 1) {
    const base = row * featureCount;
    let standard = 0;
    for (let index = 0; index < featureCount; index += 1) {
      standard +=
        ((matrix[base + index] - linear.means[index]) / linear.scales[index]) *
        linear.coefficients[index];
    }
    total += 0.5 * treeOut[row] + 0.5 * (linear.intercept + standard);
  }
  return total / rows;
}

/**
 * Rows evaluated for `v(S)`: one row when fully observed, otherwise the whole
 * background with the observed columns pinned to the case (C-08 §6.2).
 */
function buildCoalition(
  engine: PreparedEngine,
  caseRow: Float64Array,
  mask: Uint8Array,
  matrix: Float64Array,
): number {
  const featureCount = engine.featureCount;
  let observedCount = 0;
  for (let index = 0; index < featureCount; index += 1) {
    if (mask[index] === 1) observedCount += 1;
  }
  if (observedCount === featureCount) {
    for (let index = 0; index < featureCount; index += 1) matrix[index] = caseRow[index];
    return 1;
  }
  matrix.set(engine.backgroundRounded);
  for (let index = 0; index < featureCount; index += 1) {
    if (mask[index] !== 1) continue;
    const value = caseRow[index];
    for (let row = 0; row < engine.backgroundCount; row += 1) {
      matrix[row * featureCount + index] = value;
    }
  }
  return engine.backgroundCount;
}

function decideState(
  rawMargin: number,
  thresholdMargin: number,
  halfWidth: number,
): DecisionState {
  if (rawMargin > thresholdMargin + halfWidth) return "above";
  if (rawMargin < thresholdMargin - halfWidth) return "below";
  return "indeterminate";
}

/** Percentile of a value against the 101-point quantile curve (C-03). */
function percentileOf(points: number[], value: number): number {
  const last = points.length - 1;
  if (last < 1) return 0;
  if (value <= points[0]) return 0;
  if (value >= points[last]) return 100;
  for (let index = 0; index <= last; index += 1) {
    if (points[index] === value) {
      let plateauEnd = index;
      while (plateauEnd + 1 <= last && points[plateauEnd + 1] === value) plateauEnd += 1;
      return ((index + plateauEnd) / 2) * (100 / last);
    }
    if (points[index] > value) {
      const below = points[index - 1];
      const fraction = (value - below) / (points[index] - below);
      return (index - 1 + fraction) * (100 / last);
    }
  }
  return 100;
}

function cohortPosition(
  entry: PercentileEntry,
  value: number,
): { kind: "percentile"; value: number } | { kind: "cohort-share"; value: number } {
  if (entry.kind === "continuous") {
    return { kind: "percentile", value: percentileOf(entry.points, value) };
  }
  const index = entry.levels.indexOf(value);
  return { kind: "cohort-share", value: index >= 0 ? entry.shares[index] : 0 };
}

function observedFeatureIds(engine: PreparedEngine, mask: Uint8Array): string[] {
  const ids: string[] = [];
  for (let index = 0; index < engine.featureCount; index += 1) {
    if (mask[index] === 1) ids.push(engine.featureIds[index]);
  }
  return ids;
}

function rangeFlags(
  engine: PreparedEngine,
  caseRow: Float64Array,
  mask: Uint8Array,
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (let index = 0; index < engine.featureCount; index += 1) {
    const outside =
      mask[index] === 1 &&
      engine.isContinuous[index] === 1 &&
      (caseRow[index] < engine.rangeMin[index] || caseRow[index] > engine.rangeMax[index]);
    flags[engine.featureIds[index]] = outside;
  }
  return flags;
}

/** C-08 headline: argmax source, CAD decision (first maximum wins). */
function headline(targets: Record<TargetId, TargetEvaluation>): HeadlineCad {
  let source = targets[CONTRACT_TARGETS[0]];
  for (const targetId of CONTRACT_TARGETS) {
    const candidate = targets[targetId];
    if (candidate.probability > source.probability) source = candidate;
  }
  const cad = targets.CAD;
  return {
    probability: source.probability,
    valueSourceTargetId: source.targetId,
    decisionReferenceTargetId: "CAD",
    decision: cad.decision,
    reliability: cad.reliability,
    thresholdProbability: cad.thresholdProbability,
    explanationSourceTargetId: source.targetId,
  };
}

/** Build the immutable engine state from validated artifacts. */
export function prepareArtifacts(model: unknown, registry: Registry): PreparedEngine {
  validateRegistryCorrespondence(registry);
  const document: ModelDocument = parseModelDocument(model, registry);
  const featureCount = document.featureCount;
  const featureIds = document.features;

  const targets: PreparedTarget[] = [];
  for (const targetId of CONTRACT_TARGETS) {
    const block = document.components[targetId];
    const decision = document.decisionParameters[targetId];
    const trees: DecisionTree[] = [];
    for (const tree of block.trees.trees) {
      const built = new DecisionTree(tree.nodes);
      if (built.maxFeatureIndex >= featureCount) {
        throw artifactInvalid(`tree split feature ${built.maxFeatureIndex} is outside the registry`);
      }
      trees.push(built);
    }
    const thresholdMargin = rawMarginFromProbability(decision.thresholdProbability, block.platt);
    const reference = document.reliabilityReferences.find((entry) => entry.targetId === targetId);
    if (reference === undefined) throw artifactInvalid(`no reliability reference for ${targetId}`);
    targets.push({
      targetId,
      trees,
      baseScore: block.trees.baseScore,
      linear: {
        intercept: block.linear.intercept,
        coefficients: Float64Array.from(block.linear.coefficientByFeature),
        means: Float64Array.from(block.linear.meanByFeature),
        scales: Float64Array.from(block.linear.scaleByFeature),
      },
      plattSlope: block.platt.slope,
      plattIntercept: block.platt.intercept,
      thresholdProbability: decision.thresholdProbability,
      thresholdMargin,
      halfWidthMargin: decision.abstentionHalfWidthMargin,
      lowerProbability: sigmoid(
        block.platt.slope * (thresholdMargin - decision.abstentionHalfWidthMargin) +
          block.platt.intercept,
      ),
      upperProbability: sigmoid(
        block.platt.slope * (thresholdMargin + decision.abstentionHalfWidthMargin) +
          block.platt.intercept,
      ),
      reliability: reference.tier,
    });
  }

  const backgroundCount = document.background.count;
  const backgroundRaw = toFloatMatrix(document.background.rows, featureCount);
  const backgroundRounded = roundToFloat32(backgroundRaw);
  const backgroundMean = new Float64Array(featureCount);
  for (let index = 0; index < featureCount; index += 1) {
    let total = 0;
    for (let row = 0; row < backgroundCount; row += 1) {
      total += backgroundRaw[row * featureCount + index];
    }
    backgroundMean[index] = total / backgroundCount;
  }

  const scratchTree = new Float64Array(backgroundCount);
  const scratchLeaves = new Float64Array(backgroundCount);
  const referenceRaw = new Float64Array(targets.length);
  for (let index = 0; index < targets.length; index += 1) {
    referenceRaw[index] = meanRawMargin(
      targets[index],
      backgroundRounded,
      backgroundCount,
      featureCount,
      scratchTree,
      scratchLeaves,
    );
  }

  const groupOfFeature: string[] = new Array(featureCount);
  const groupMembers = new Map<string, number[]>();
  const groupOrder: string[] = [];
  const modalityOfFeature: string[] = new Array(featureCount);
  const modalityMembers = new Map<string, number[]>();
  for (let index = 0; index < featureCount; index += 1) {
    const feature = registry.features[index];
    const groupId = feature.displayGroup ?? feature.id;
    groupOfFeature[index] = groupId;
    if (!groupMembers.has(groupId)) {
      groupMembers.set(groupId, []);
      groupOrder.push(groupId);
    }
    (groupMembers.get(groupId) as number[]).push(index);
    modalityOfFeature[index] = feature.modality;
    if (!modalityMembers.has(feature.modality)) modalityMembers.set(feature.modality, []);
    (modalityMembers.get(feature.modality) as number[]).push(index);
  }

  const modalityOrder = registry.modalities
    .map((entry) => ({ id: entry.id, order: entry.order }))
    .sort((a, b) => (a.order === b.order ? compareIds(a.id, b.id) : a.order - b.order))
    .map((entry) => entry.id);

  const isContinuous = new Uint8Array(featureCount);
  const rangeMin = new Float64Array(featureCount);
  const rangeMax = new Float64Array(featureCount);
  for (let index = 0; index < featureCount; index += 1) {
    const feature = registry.features[index];
    isContinuous[index] = feature.kind === "continuous" ? 1 : 0;
    rangeMin[index] = feature.range.min;
    rangeMax[index] = feature.range.max;
  }

  const stages = registry.stages
    .slice()
    .sort((a, b) => (a.order === b.order ? compareIds(a.id, b.id) : a.order - b.order))
    .map((stage) => ({ id: stage.id, modalities: new Set<string>(stage.modalitiesThrough) }));

  const targetIndex = new Map<TargetId, number>();
  targets.forEach((target, index) => targetIndex.set(target.targetId, index));

  const provenance = document.provenance;

  return {
    modelId: document.modelId,
    dataSha256: typeof provenance.dataSha256 === "string" ? provenance.dataSha256 : null,
    registry,
    featureIds,
    featureCount,
    backgroundCount,
    backgroundRounded,
    backgroundMean,
    referenceRaw,
    targets,
    targetIndex,
    modalityOfFeature,
    modalityOrder,
    modalityMembers,
    groupOfFeature,
    groupOrder,
    groupMembers,
    percentiles: document.percentiles,
    isContinuous,
    rangeMin,
    rangeMax,
    stages,
  };
}

function createScratch(engine: PreparedEngine): ComputeScratch {
  const size = Math.max(engine.backgroundCount, 1);
  return {
    matrix: new Float64Array(engine.backgroundCount * engine.featureCount),
    tree: new Float64Array(size),
    leaves: new Float64Array(size),
  };
}

/** C-08 `Evaluation` for one encoded case (revision supplied by the caller). */
function evaluateVectors(
  engine: PreparedEngine,
  caseRow: Float64Array,
  mask: Uint8Array,
  revision: number,
  scratch: ComputeScratch,
): Evaluation {
  const rows = buildCoalition(engine, caseRow, mask, scratch.matrix);
  const targets = {} as Record<TargetId, TargetEvaluation>;
  for (const prepared of engine.targets) {
    const raw = meanRawMargin(
      prepared,
      scratch.matrix,
      rows,
      engine.featureCount,
      scratch.tree,
      scratch.leaves,
    );
    const calibratedMargin = prepared.plattSlope * raw + prepared.plattIntercept;
    const probability = sigmoid(calibratedMargin);
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new DomainError(
        "NONFINITE_INPUT",
        `${prepared.targetId} produced a non-finite probability`,
      );
    }
    targets[prepared.targetId] = {
      targetId: prepared.targetId,
      probability,
      calibratedMargin,
      thresholdProbability: prepared.thresholdProbability,
      decision: decideState(raw, prepared.thresholdMargin, prepared.halfWidthMargin),
      reliability: prepared.reliability,
      abstention: {
        lowerProbability: prepared.lowerProbability,
        upperProbability: prepared.upperProbability,
        halfWidthMargin: prepared.halfWidthMargin,
      },
    };
  }
  return {
    revision,
    observedFeatureIds: observedFeatureIds(engine, mask),
    targets,
    headlineCad: headline(targets),
    rangeFlags: rangeFlags(engine, caseRow, mask),
  };
}

/** C-08 `Explanation` for one target (exact Shapley + aggregation chain). */
function explainVectors(
  engine: PreparedEngine,
  caseRow: Float64Array,
  mask: Uint8Array,
  targetId: TargetId,
  revision: number,
  scratch: ComputeScratch,
): Explanation {
  const target = engine.targetIndex.get(targetId);
  if (target === undefined) throw malformed(`unknown target ${targetId}`);
  const prepared = engine.targets[target];
  const featureCount = engine.featureCount;

  const phi = new Float64Array(featureCount);
  const shapley = createTreeShapleyScratch(engine.backgroundCount, featureCount);
  for (const tree of prepared.trees) {
    addTreeShapley(
      tree,
      engine.backgroundRounded,
      caseRow,
      mask,
      featureCount,
      engine.backgroundCount,
      shapley,
      phi,
    );
  }

  const scale = 0.5 * prepared.plattSlope;
  const linear = prepared.linear;
  for (let index = 0; index < featureCount; index += 1) {
    if (mask[index] !== 1) {
      phi[index] = 0;
      continue;
    }
    // The interventional game replaces unobserved columns with background
    // rows, so the exact linear attribution is centred on the BACKGROUND mean
    // (not the model's `meanByFeature`, which centres the margin function
    // itself). Only this centring makes `sum(phi) + reference = output` hold
    // to 1e-6 (INV-02, ref `pipeline/shap_exact.py`).
    const linearPhi =
      (linear.coefficients[index] * (caseRow[index] - engine.backgroundMean[index])) /
      linear.scales[index];
    phi[index] = scale * (phi[index] + linearPhi);
  }

  const rows = buildCoalition(engine, caseRow, mask, scratch.matrix);
  const raw = meanRawMargin(
    prepared,
    scratch.matrix,
    rows,
    featureCount,
    scratch.tree,
    scratch.leaves,
  );
  const outputMargin = prepared.plattSlope * raw + prepared.plattIntercept;
  const referenceMargin = prepared.plattSlope * engine.referenceRaw[target] + prepared.plattIntercept;

  let phiTotal = 0;
  for (let index = 0; index < featureCount; index += 1) phiTotal += phi[index];
  const efficiencyResidual = phiTotal + referenceMargin - outputMargin;
  if (!Number.isFinite(efficiencyResidual)) {
    throw new DomainError(
      "NONFINITE_INPUT",
      `${targetId} produced a non-finite efficiency residual`,
    );
  }

  const featureAttributions: Explanation["featureAttributions"] = [];
  const measurements: Explanation["measurements"] = [];
  for (let index = 0; index < featureCount; index += 1) {
    if (mask[index] !== 1) continue;
    const contribution = phi[index];
    const direction = directionOf(contribution);
    const value = caseRow[index];
    featureAttributions.push({ featureId: engine.featureIds[index], value, contribution, direction });
    measurements.push({
      featureId: engine.featureIds[index],
      value,
      cohortPosition: cohortPosition(engine.percentiles[index], value),
      contribution,
      direction,
    });
  }

  const displayGroups = aggregate(
    engine,
    phi,
    mask,
    engine.groupOrder,
    engine.groupMembers,
  ).map((entry) => ({
    groupId: entry.id,
    contribution: entry.contribution,
    memberFeatureIds: entry.memberFeatureIds,
  }));
  const modalityContributions = aggregate(
    engine,
    phi,
    mask,
    engine.modalityOrder,
    engine.modalityMembers,
  ).map((entry) => ({
    modalityId: entry.id,
    contribution: entry.contribution,
    memberFeatureIds: entry.memberFeatureIds,
  }));

  let topFeatureIndex = -1;
  for (let index = 0; index < featureCount; index += 1) {
    if (mask[index] !== 1) continue;
    if (
      topFeatureIndex === -1 ||
      Math.abs(phi[index]) > Math.abs(phi[topFeatureIndex])
    ) {
      topFeatureIndex = index;
    }
  }
  let topModalityIndex = -1;
  for (let index = 0; index < modalityContributions.length; index += 1) {
    if (
      topModalityIndex === -1 ||
      Math.abs(modalityContributions[index].contribution) >
        Math.abs(modalityContributions[topModalityIndex].contribution)
    ) {
      topModalityIndex = index;
    }
  }

  const slots: Record<string, string | number> = {
    targetId,
    observedCount: featureAttributions.length,
    totalFeatureCount: featureCount,
  };
  if (topFeatureIndex >= 0) {
    slots.topFeatureId = engine.featureIds[topFeatureIndex];
    slots.topFeatureContribution = phi[topFeatureIndex];
    slots.topFeatureDirection = directionOf(phi[topFeatureIndex]);
  }
  if (topModalityIndex >= 0) {
    slots.topModalityId = modalityContributions[topModalityIndex].modalityId;
    slots.topModalityContribution = modalityContributions[topModalityIndex].contribution;
  }

  return {
    revision,
    targetId,
    referenceMargin,
    outputMargin,
    efficiencyResidual,
    featureAttributions,
    displayGroups,
    modalityContributions,
    measurements,
    caveats: [...CAVEAT_LIST],
    narrative: {
      templateId:
        featureAttributions.length > 0
          ? NARRATIVE_TEMPLATE_ATTRIBUTION
          : NARRATIVE_TEMPLATE_NO_EVIDENCE,
      slots,
    },
  };
}

function aggregate(
  engine: PreparedEngine,
  phi: Float64Array,
  mask: Uint8Array,
  order: string[],
  membersById: Map<string, number[]>,
): Array<{ id: string; contribution: number; memberFeatureIds: string[] }> {
  const out: Array<{ id: string; contribution: number; memberFeatureIds: string[] }> = [];
  for (const id of order) {
    const members = membersById.get(id);
    if (members === undefined) continue;
    let observed = false;
    let contribution = 0;
    for (const member of members) {
      if (mask[member] !== 1) continue;
      observed = true;
      contribution += phi[member];
    }
    if (!observed) continue;
    out.push({
      id,
      contribution,
      memberFeatureIds: members.map((member) => engine.featureIds[member]),
    });
  }
  return out;
}

/** C-08 ladder: one evaluation per cumulative stage mask (Architecture §8.5). */
function buildLadder(
  engine: PreparedEngine,
  caseRow: Float64Array,
  mask: Uint8Array,
  revision: number,
  scratch: ComputeScratch,
): LadderPayload {
  const ladder: Record<string, Evaluation> = {};
  const stageMask = new Uint8Array(engine.featureCount);
  for (const stage of engine.stages) {
    for (let index = 0; index < engine.featureCount; index += 1) {
      stageMask[index] =
        mask[index] === 1 && stage.modalities.has(engine.modalityOfFeature[index]) ? 1 : 0;
    }
    ladder[stage.id] = evaluateVectors(engine, caseRow, stageMask, revision, scratch);
  }
  return ladder as LadderPayload;
}

function parseAggregation(
  value: unknown,
  label: string,
  idKey: "groupId" | "modalityId",
): FixtureAggregation {
  const record = requireRecord(value, label);
  const members = record.memberFeatureIds;
  if (!Array.isArray(members) || members.some((item) => typeof item !== "string")) {
    throw artifactInvalid(`${label}.memberFeatureIds is not a list of ids`);
  }
  return {
    id: requireString(record, idKey, label),
    contribution: requireFinite(record, "contribution", label),
    memberFeatureIds: members as string[],
  };
}

function parseAttribution(value: unknown, label: string): FixtureAttribution {
  const record = requireRecord(value, label);
  return {
    featureId: requireString(record, "featureId", label),
    value: requireFinite(record, "value", label),
    contribution: requireFinite(record, "contribution", label),
    direction: requireString(record, "direction", label),
  };
}

function parseFixtureTarget(value: unknown, label: string): FixtureTarget {
  const record = requireRecord(value, label);
  const abstention = requireRecord(record.abstention, `${label}.abstention`);
  return {
    targetId: requireString(record, "targetId", label),
    probability: requireFinite(record, "probability", label),
    calibratedMargin: requireFinite(record, "calibratedMargin", label),
    thresholdProbability: requireFinite(record, "thresholdProbability", label),
    decision: requireString(record, "decision", label),
    reliability: requireString(record, "reliability", label),
    abstention: {
      lowerProbability: requireFinite(abstention, "lowerProbability", `${label}.abstention`),
      upperProbability: requireFinite(abstention, "upperProbability", `${label}.abstention`),
      halfWidthMargin: requireFinite(abstention, "halfWidthMargin", `${label}.abstention`),
    },
  };
}

function parseExplanation(value: unknown, label: string): FixtureExplanation {
  const record = requireRecord(value, label);
  const attributions = record.featureAttributions;
  const groups = record.displayGroups;
  const modalities = record.modalityContributions;
  const caveats = record.caveats;
  if (!Array.isArray(attributions)) throw artifactInvalid(`${label}.featureAttributions missing`);
  if (!Array.isArray(groups)) throw artifactInvalid(`${label}.displayGroups missing`);
  if (!Array.isArray(modalities)) throw artifactInvalid(`${label}.modalityContributions missing`);
  if (!Array.isArray(caveats) || caveats.some((item) => typeof item !== "string")) {
    throw artifactInvalid(`${label}.caveats is not a list of keys`);
  }
  return {
    targetId: requireString(record, "targetId", label),
    referenceMargin: requireFinite(record, "referenceMargin", label),
    outputMargin: requireFinite(record, "outputMargin", label),
    efficiencyResidual: requireFinite(record, "efficiencyResidual", label),
    featureAttributions: attributions.map((item, index) =>
      parseAttribution(item, `${label}.featureAttributions[${index}]`),
    ),
    displayGroups: groups.map((item, index) =>
      parseAggregation(item, `${label}.displayGroups[${index}]`, "groupId"),
    ),
    modalityContributions: modalities.map((item, index) =>
      parseAggregation(item, `${label}.modalityContributions[${index}]`, "modalityId"),
    ),
    caveats: caveats as string[],
  };
}

const EXPECTED_NORMAL_KEYS = ["explanations", "headlineCad", "rangeFlags", "targets"];

function parseFixture(
  value: unknown,
  position: number,
  engine: PreparedEngine,
  featureIdSet: Set<string>,
): Fixture {
  const label = `fixture ${position + 1}`;
  const entry = requireRecord(value, label);
  const id = requireString(entry, "id", label);
  const coverageTags = entry.coverageTags;
  if (!Array.isArray(coverageTags) || coverageTags.length === 0 || coverageTags.some((tag) => typeof tag !== "string")) {
    throw artifactInvalid(`${label} has no coverage tags`);
  }
  const input = requireRecord(entry.input, `${label} input`);
  const values = requireRecord(input.values, `${label} values`);
  const providedRaw = requireRecord(input.providedFeatures, `${label} providedFeatures`);

  const forbiddenIds = new Set(engine.registry.forbiddenInputColumns.map((column) => column.id));
  for (const key of Object.keys(values)) {
    if (forbiddenIds.has(key)) throw artifactInvalid(`${label} carries a forbidden column`);
    if (!featureIdSet.has(key)) throw artifactInvalid(`${label} values name an unknown feature`);
  }
  const providedFeatures: Record<string, boolean> = {};
  for (const featureId of engine.featureIds) {
    const flag = providedRaw[featureId];
    if (typeof flag !== "boolean") {
      throw artifactInvalid(`${label} providedFeatures must cover every registry feature`);
    }
    providedFeatures[featureId] = flag;
  }

  const expected = requireRecord(entry.expected, `${label} expected`);
  const failureRaw = expected.failure;
  if (failureRaw !== undefined) {
    if (Object.keys(expected).length !== 1) {
      throw artifactInvalid(`${label} expected must contain only the failure block`);
    }
    const record = requireRecord(failureRaw, `${label} failure`);
    const code = requireString(record, "code", `${label} failure`);
    if (!(COMPUTE_ERROR_CODES as readonly string[]).includes(code)) {
      throw artifactInvalid(`${label} failure code is outside the C-07 vocabulary`);
    }
    return {
      id,
      coverageTags: coverageTags as string[],
      values,
      providedFeatures,
      failure: { code: code as ComputeErrorCode, featureId: requireString(record, "featureId", `${label} failure`) },
      expectation: null,
    };
  }

  const actualKeys = Object.keys(expected).sort();
  if (actualKeys.length !== EXPECTED_NORMAL_KEYS.length || actualKeys.some((key, index) => key !== EXPECTED_NORMAL_KEYS[index])) {
    throw artifactInvalid(`${label} expected must carry exactly ${EXPECTED_NORMAL_KEYS.join(", ")}`);
  }

  const targetsRaw = requireRecord(expected.targets, `${label} targets`);
  const headlineRaw = requireRecord(expected.headlineCad, `${label} headlineCad`);
  const rangeFlagsRaw = requireRecord(expected.rangeFlags, `${label} rangeFlags`);
  const explanationsRaw = requireRecord(expected.explanations, `${label} explanations`);

  const targets = {} as Record<TargetId, FixtureTarget>;
  const explanations = {} as Record<TargetId, FixtureExplanation>;
  for (const targetId of CONTRACT_TARGETS) {
    if (!(targetId in targetsRaw)) throw artifactInvalid(`${label} targets are missing ${targetId}`);
    if (!(targetId in explanationsRaw)) throw artifactInvalid(`${label} explanations are missing ${targetId}`);
    targets[targetId] = parseFixtureTarget(targetsRaw[targetId], `${label} targets.${targetId}`);
    explanations[targetId] = parseExplanation(explanationsRaw[targetId], `${label} explanations.${targetId}`);
  }
  if (Object.keys(targetsRaw).length !== CONTRACT_TARGETS.length) {
    throw artifactInvalid(`${label} targets carry an unexpected target`);
  }
  if (Object.keys(explanationsRaw).length !== CONTRACT_TARGETS.length) {
    throw artifactInvalid(`${label} explanations carry an unexpected target`);
  }
  const rangeFlags: Record<string, boolean> = {};
  for (const featureId of engine.featureIds) {
    const flag = rangeFlagsRaw[featureId];
    if (typeof flag !== "boolean") throw artifactInvalid(`${label} rangeFlags must cover every feature`);
    rangeFlags[featureId] = flag;
  }
  if (Object.keys(rangeFlagsRaw).length !== engine.featureCount) {
    throw artifactInvalid(`${label} rangeFlags carry an unexpected feature`);
  }

  return {
    id,
    coverageTags: coverageTags as string[],
    values,
    providedFeatures,
    failure: null,
    expectation: {
      targets,
      headline: {
        probability: requireFinite(headlineRaw, "probability", `${label} headlineCad`),
        valueSourceTargetId: requireString(headlineRaw, "valueSourceTargetId", `${label} headlineCad`),
        decision: requireString(headlineRaw, "decision", `${label} headlineCad`),
        reliability: requireString(headlineRaw, "reliability", `${label} headlineCad`),
      },
      rangeFlags,
      explanations,
    },
  };
}

/**
 * Parse and bind the frozen golden-fixture corpus to this engine. The
 * `fixtureSetId` is derived from the provenance triple so the System view can
 * show exactly which corpus a parity report was produced against; a
 * model-id/data-hash mismatch rejects the corpus (artifact integrity).
 */
export function parseFixtureSet(value: unknown, engine: PreparedEngine): FixtureSet {
  const root = requireRecord(value, "fixture set");
  const schemaVersion = requireString(root, "schemaVersion", "fixture set");
  if (schemaVersion !== "1.0.0") throw artifactInvalid("fixture set schemaVersion is not 1.0.0");

  const toleranceRaw = requireRecord(root.tolerance, "fixture set tolerance");
  const tolerance: FixtureTolerance = {
    probability: requireFinite(toleranceRaw, "probability", "fixture tolerance"),
    margin: requireFinite(toleranceRaw, "margin", "fixture tolerance"),
    attribution: requireFinite(toleranceRaw, "attribution", "fixture tolerance"),
    efficiency: requireFinite(toleranceRaw, "efficiency", "fixture tolerance"),
  };
  if (
    tolerance.probability !== 1e-5 ||
    tolerance.margin !== 1e-5 ||
    tolerance.attribution !== 1e-5 ||
    tolerance.efficiency !== 1e-6
  ) {
    throw artifactInvalid("fixture tolerances do not match the C-06 band");
  }

  const provenance = requireRecord(root.provenance, "fixture set provenance");
  const provenanceModelId = requireString(provenance, "modelId", "fixture provenance");
  if (provenanceModelId !== engine.modelId) {
    throw artifactInvalid("fixture provenance modelId does not match the loaded model");
  }
  const provenanceData = provenance.dataSha256;
  if (
    typeof provenanceData === "string" &&
    engine.dataSha256 !== null &&
    provenanceData !== engine.dataSha256
  ) {
    throw artifactInvalid("fixture provenance dataSha256 does not match the loaded model");
  }
  const oracleRevision = requireString(provenance, "oracleRevision", "fixture provenance");
  const generationSeed = provenance.generationSeed;
  if (typeof generationSeed !== "number" || !Number.isInteger(generationSeed)) {
    throw artifactInvalid("fixture provenance generationSeed is not an integer");
  }

  const fixturesRaw = root.fixtures;
  if (!Array.isArray(fixturesRaw) || fixturesRaw.length === 0) {
    throw artifactInvalid("fixture set contains no fixtures");
  }
  const featureIdSet = new Set(engine.featureIds);
  const fixtures: Fixture[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < fixturesRaw.length; index += 1) {
    const fixture = parseFixture(fixturesRaw[index], index, engine, featureIdSet);
    if (seen.has(fixture.id)) throw artifactInvalid(`fixture id ${fixture.id} is used twice`);
    seen.add(fixture.id);
    fixtures.push(fixture);
  }

  return {
    fixtureSetId: `golden-${schemaVersion}-${oracleRevision}-seed${generationSeed}`,
    tolerance,
    fixtures,
  };
}

/* ------------------------------------------------------------------ *
 * Golden-fixture verification (tests/test_fixtures.py semantics)
 * ------------------------------------------------------------------ */

function createState(): DeviationState {
  return { probability: 0, margin: 0, attribution: 0, efficiency: 0, passed: true };
}

function sameStrings(observed: readonly string[], expected: readonly string[]): boolean {
  if (observed.length !== expected.length) return false;
  for (let index = 0; index < observed.length; index += 1) {
    if (observed[index] !== expected[index]) return false;
  }
  return true;
}

function compareExact(state: DeviationState, observed: string, expected: string): void {
  if (observed !== expected) state.passed = false;
}

function compareScalar(
  state: DeviationState,
  bucket: "probability" | "margin" | "attribution",
  observed: number,
  expected: number,
  tolerance: number,
): void {
  const delta = Math.abs(observed - expected);
  if (delta <= state[bucket]) {
    if (!(delta <= tolerance)) state.passed = false;
    return;
  }
  state[bucket] = delta;
  if (!(delta <= tolerance)) state.passed = false;
}

function compareAggregations<T extends { contribution: number; memberFeatureIds: string[] }>(
  state: DeviationState,
  fresh: readonly T[],
  stored: readonly FixtureAggregation[],
  idOf: (entry: T) => string,
  tolerance: FixtureTolerance,
): void {
  if (fresh.length !== stored.length) {
    state.passed = false;
    return;
  }
  for (let index = 0; index < fresh.length; index += 1) {
    if (idOf(fresh[index]) !== stored[index].id) state.passed = false;
    if (!sameStrings(fresh[index].memberFeatureIds, stored[index].memberFeatureIds)) {
      state.passed = false;
    }
    compareScalar(
      state,
      "attribution",
      fresh[index].contribution,
      stored[index].contribution,
      tolerance.attribution,
    );
  }
}

function compareExplanation(
  state: DeviationState,
  fixture: Fixture,
  fresh: Explanation,
  stored: FixtureExplanation,
  tolerance: FixtureTolerance,
): void {
  compareExact(state, fresh.targetId, stored.targetId);
  if (!sameStrings(fresh.caveats, stored.caveats)) state.passed = false;
  if (fresh.caveats.length === 0) state.passed = false;
  compareScalar(state, "margin", fresh.referenceMargin, stored.referenceMargin, tolerance.margin);
  compareScalar(state, "margin", fresh.outputMargin, stored.outputMargin, tolerance.margin);

  const residual = Math.abs(fresh.efficiencyResidual);
  if (residual > state.efficiency) state.efficiency = residual;
  if (!(residual <= tolerance.efficiency)) state.passed = false;
  if (!(Math.abs(fresh.efficiencyResidual - stored.efficiencyResidual) <= tolerance.efficiency)) {
    state.passed = false;
  }

  const freshByFeature = new Map<string, Explanation["featureAttributions"][number]>();
  for (const item of fresh.featureAttributions) freshByFeature.set(item.featureId, item);
  const storedByFeature = new Map<string, FixtureAttribution>();
  for (const item of stored.featureAttributions) storedByFeature.set(item.featureId, item);
  if (freshByFeature.size !== storedByFeature.size) state.passed = false;

  let featureSum = 0;
  for (const item of fresh.featureAttributions) {
    featureSum += item.contribution;
    if (fixture.providedFeatures[item.featureId] !== true) state.passed = false;
    const match = storedByFeature.get(item.featureId);
    if (match === undefined) {
      state.passed = false;
      continue;
    }
    compareExact(state, item.direction, match.direction);
    if (!(Math.abs(item.value - match.value) <= 1e-9)) state.passed = false;
    compareScalar(state, "attribution", item.contribution, match.contribution, tolerance.attribution);
  }

  compareAggregations(
    state,
    fresh.displayGroups,
    stored.displayGroups,
    (entry) => entry.groupId,
    tolerance,
  );
  compareAggregations(
    state,
    fresh.modalityContributions,
    stored.modalityContributions,
    (entry) => entry.modalityId,
    tolerance,
  );

  let groupSum = 0;
  for (const entry of fresh.displayGroups) groupSum += entry.contribution;
  let modalitySum = 0;
  for (const entry of fresh.modalityContributions) modalitySum += entry.contribution;
  if (!(Math.abs(featureSum - groupSum) <= 1e-9)) state.passed = false;
  if (!(Math.abs(featureSum - modalitySum) <= 1e-9)) state.passed = false;
}

/**
 * `tests/test_fixtures.py::test_every_normal_fixture_recomputes` plus the
 * `test_stored_explanations_reconcile` invariant set: one fixture, one
 * observed evaluation + explanation set, one `passed` verdict with per-bucket
 * maxima (never hides a failure � the flag and the number travel together).
 */
function compareFixture(
  engine: PreparedEngine,
  fixture: Fixture,
  evaluation: Evaluation,
  explanations: ReadonlyMap<TargetId, Explanation>,
  tolerance: FixtureTolerance,
  state: DeviationState,
): void {
  const expected = fixture.expectation;
  if (expected === null) {
    state.passed = false;
    return;
  }

  const providedObserved = engine.featureIds.filter(
    (featureId) => fixture.providedFeatures[featureId] === true,
  );
  if (!sameStrings(evaluation.observedFeatureIds, providedObserved)) state.passed = false;
  for (const featureId of engine.featureIds) {
    if (evaluation.rangeFlags[featureId] !== expected.rangeFlags[featureId]) {
      state.passed = false;
      break;
    }
  }

  compareExact(state, evaluation.headlineCad.valueSourceTargetId, expected.headline.valueSourceTargetId);
  compareExact(state, evaluation.headlineCad.decision, expected.headline.decision);
  compareExact(state, evaluation.headlineCad.reliability, expected.headline.reliability);
  compareScalar(
    state,
    "probability",
    evaluation.headlineCad.probability,
    expected.headline.probability,
    tolerance.probability,
  );

  for (const targetId of CONTRACT_TARGETS) {
    const fresh = evaluation.targets[targetId];
    const stored = expected.targets[targetId];
    if (fresh === undefined) {
      state.passed = false;
      continue;
    }
    compareExact(state, fresh.targetId, stored.targetId);
    compareExact(state, fresh.decision, stored.decision);
    compareExact(state, fresh.reliability, stored.reliability);
    compareScalar(state, "probability", fresh.probability, stored.probability, tolerance.probability);
    compareScalar(state, "margin", fresh.calibratedMargin, stored.calibratedMargin, tolerance.margin);
    compareScalar(
      state,
      "probability",
      fresh.thresholdProbability,
      stored.thresholdProbability,
      tolerance.probability,
    );
    compareScalar(
      state,
      "probability",
      fresh.abstention.lowerProbability,
      stored.abstention.lowerProbability,
      tolerance.probability,
    );
    compareScalar(
      state,
      "probability",
      fresh.abstention.upperProbability,
      stored.abstention.upperProbability,
      tolerance.probability,
    );
    compareScalar(
      state,
      "margin",
      fresh.abstention.halfWidthMargin,
      stored.abstention.halfWidthMargin,
      tolerance.margin,
    );

    const freshExplanation = explanations.get(targetId);
    if (freshExplanation === undefined) {
      state.passed = false;
      continue;
    }
    compareExplanation(state, fixture, freshExplanation, expected.explanations[targetId], tolerance);
  }
}

/** Run one fixture through the engine path (encode -> evaluate/explain). */
function verifyFixture(
  engine: PreparedEngine,
  fixture: Fixture,
  tolerance: FixtureTolerance,
  scratch: ComputeScratch,
): DeviationState {
  const state = createState();
  const encoderInput = {
    registry: engine.registry,
    values: fixture.values,
    providedFeatures: fixture.providedFeatures,
    providedModalities: {} as Record<string, boolean>,
  };
  if (fixture.failure !== null) {
    try {
      const encoded = encodeCase(encoderInput);
      const caseRow = Float64Array.from(encoded.featureVector);
      evaluateVectors(engine, caseRow, encoded.observedMask, 0, scratch);
      state.passed = false;
    } catch (error) {
      const featureId =
        error instanceof DomainError ? (error.featureId ?? error.columnId) : undefined;
      if (codeOf(error) !== fixture.failure.code || featureId !== fixture.failure.featureId) {
        state.passed = false;
      }
    }
    return state;
  }
  try {
    const encoded = encodeCase(encoderInput);
    const caseRow = Float64Array.from(encoded.featureVector);
    const evaluation = evaluateVectors(engine, caseRow, encoded.observedMask, 0, scratch);
    const explanations = new Map<TargetId, Explanation>();
    for (const targetId of CONTRACT_TARGETS) {
      explanations.set(
        targetId,
        explainVectors(engine, caseRow, encoded.observedMask, targetId, 0, scratch),
      );
    }
    compareFixture(engine, fixture, evaluation, explanations, tolerance, state);
  } catch {
    state.passed = false;
  }
  return state;
}

export type FixtureVerification = {
  fixtureId: string;
  coverageTags: string[];
  passed: boolean;
  maxProbabilityDeviation: number;
  maxMarginDeviation: number;
  maxAttributionDeviation: number;
  maxEfficiencyResidual: number;
};

export type FixtureVerificationReport = {
  fixtureSetId: string;
  modelId: string;
  tolerance: FixtureTolerance;
  total: number;
  passed: number;
  failed: number;
  maxProbabilityDeviation: number;
  maxMarginDeviation: number;
  maxAttributionDeviation: number;
  maxEfficiencyResidual: number;
  fixtures: FixtureVerification[];
};

/** Verify every attached fixture against C-06 tolerances (blocking evidence). */
export function verifyFixtureSet(
  engine: PreparedEngine,
  fixtureSet: FixtureSet,
): FixtureVerificationReport {
  const scratch = createScratch(engine);
  const results: FixtureVerification[] = [];
  let passedCount = 0;
  let maxProbability = 0;
  let maxMargin = 0;
  let maxAttribution = 0;
  let maxEfficiency = 0;
  for (const fixture of fixtureSet.fixtures) {
    const state = verifyFixture(engine, fixture, fixtureSet.tolerance, scratch);
    if (state.passed) passedCount += 1;
    maxProbability = Math.max(maxProbability, state.probability);
    maxMargin = Math.max(maxMargin, state.margin);
    maxAttribution = Math.max(maxAttribution, state.attribution);
    maxEfficiency = Math.max(maxEfficiency, state.efficiency);
    results.push({
      fixtureId: fixture.id,
      coverageTags: fixture.coverageTags,
      passed: state.passed,
      maxProbabilityDeviation: state.probability,
      maxMarginDeviation: state.margin,
      maxAttributionDeviation: state.attribution,
      maxEfficiencyResidual: state.efficiency,
    });
  }
  return {
    fixtureSetId: fixtureSet.fixtureSetId,
    modelId: engine.modelId,
    tolerance: fixtureSet.tolerance,
    total: fixtureSet.fixtures.length,
    passed: passedCount,
    failed: fixtureSet.fixtures.length - passedCount,
    maxProbabilityDeviation: maxProbability,
    maxMarginDeviation: maxMargin,
    maxAttributionDeviation: maxAttribution,
    maxEfficiencyResidual: maxEfficiency,
    fixtures: results,
  };
}

/* ------------------------------------------------------------------ *
 * C-07 envelope validation, echo and the engine runtime
 * ------------------------------------------------------------------ */

type Framing = {
  operation: ComputeOperation;
  targetId?: TargetId;
  verificationFixtureId?: string;
};

function isChannel(value: unknown): value is ComputeChannel {
  return typeof value === "string" && (COMPUTE_CHANNELS as readonly string[]).includes(value);
}

function isLane(value: unknown): value is ComputeLane {
  return typeof value === "string" && (COMPUTE_LANES as readonly string[]).includes(value);
}

function isOperation(value: unknown): value is ComputeOperation {
  return typeof value === "string" && (COMPUTE_OPERATIONS as readonly string[]).includes(value);
}

function isTargetId(value: unknown): value is TargetId {
  return (
    typeof value === "string" &&
    (CONTRACT_TARGETS as readonly string[]).includes(value)
  );
}

/**
 * C-07 request rules, mirrored from `worker/protocol.ts::validateRequest`
 * (the worker is free to re-validate; the engine never trusts its caller).
 * First violation wins; every message is fixed text with no patient content.
 */
function validateEnvelope(request: unknown, engine: PreparedEngine): Framing {
  if (typeof request !== "object" || request === null) {
    throw malformed("Compute request must be an object");
  }
  const candidate = request as Partial<ComputeRequest>;
  if (candidate.protocolVersion !== COMPUTE_PROTOCOL_VERSION) {
    throw malformed(`Compute request protocol version must be ${COMPUTE_PROTOCOL_VERSION}`);
  }
  if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0) {
    throw malformed("Compute request requestId must be a non-empty string");
  }
  if (!isChannel(candidate.channel)) {
    throw malformed("Compute request channel must be case or verification");
  }
  if (!Number.isInteger(candidate.revision) || (candidate.revision as number) < 0) {
    throw malformed("Compute request revision must be a non-negative integer");
  }
  if (candidate.channel === "case" && (candidate.revision as number) < 1) {
    throw malformed("Case-channel revision must be 1 or higher");
  }
  if (!isLane(candidate.lane)) {
    throw malformed("Compute request lane must be L0, L1, L2 or L3");
  }
  if (!isOperation(candidate.operation)) {
    throw new DomainError("UNSUPPORTED_OPERATION", "Compute request operation is not supported");
  }
  if (candidate.targetId !== undefined && !isTargetId(candidate.targetId)) {
    throw malformed("Compute request targetId must be CAD, LAD, LCX or RCA");
  }
  if (candidate.operation === "explain" && candidate.targetId === undefined) {
    throw malformed("Compute request explain operation requires a targetId");
  }
  if (
    candidate.verificationFixtureId !== undefined &&
    (typeof candidate.verificationFixtureId !== "string" ||
      candidate.verificationFixtureId.length === 0)
  ) {
    throw malformed("Compute request verificationFixtureId must be a non-empty string");
  }
  if (!(candidate.featureVector instanceof Float32Array)) {
    throw malformed("Compute request featureVector must be a Float32Array");
  }
  if (!(candidate.observedMask instanceof Uint8Array)) {
    throw malformed("Compute request observedMask must be a Uint8Array");
  }
  const vector = candidate.featureVector;
  const mask = candidate.observedMask;
  const lengthOk =
    vector.length > 0 &&
    vector.length === mask.length &&
    vector.length === engine.featureCount;
  if (!lengthOk) {
    throw new DomainError(
      "INVALID_FEATURE_VECTOR",
      "featureVector and observedMask lengths must be equal and match the registry feature count",
    );
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 0 && mask[index] !== 1) {
      throw new DomainError("INVALID_FEATURE_VECTOR", "Observed mask must contain only 0 or 1");
    }
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1 && !Number.isFinite(vector[index])) {
      throw new DomainError("NONFINITE_INPUT", "Observed feature values must be finite");
    }
  }
  return {
    operation: candidate.operation,
    ...(candidate.targetId !== undefined ? { targetId: candidate.targetId } : {}),
    ...(candidate.verificationFixtureId !== undefined
      ? { verificationFixtureId: candidate.verificationFixtureId }
      : {}),
  };
}

/** Response framing echo (C-07; `worker/protocol.ts::echoEnvelope` twin). */
function echoEnvelope(request: unknown): Pick<
  ComputeResponse,
  "protocolVersion" | "requestId" | "channel" | "revision" | "lane" | "operation"
> {
  const source: Partial<ComputeRequest> =
    typeof request === "object" && request !== null
      ? (request as Partial<ComputeRequest>)
      : {};
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: typeof source.requestId === "string" ? source.requestId : "",
    channel: isChannel(source.channel) ? source.channel : "case",
    revision:
      typeof source.revision === "number" && Number.isFinite(source.revision)
        ? source.revision
        : 0,
    lane: isLane(source.lane) ? source.lane : "L0",
    operation: isOperation(source.operation) ? source.operation : "evaluate",
  };
}

function errorResponse(
  request: unknown,
  error: unknown,
  computeMs: number,
): ComputeResponse {
  const code = codeOf(error);
  return {
    ...echoEnvelope(request),
    status: "error",
    error: { code, message: messageOf(error), recoverable: RECOVERABLE_BY_CODE[code] },
    timing: { computeMs },
  };
}

export type EngineApi = {
  readonly modelId: string;
  execute(request: ComputeRequest): ComputeResponse;
};

/**
 * D-16 runtime engine: immutable artifacts, one typed `execute` entry point
 * (never throws � failures become `status: "error"` C-07 responses) plus the
 * verification surface used by the parity test and the `integrity` operation.
 */
export class DomainEngine implements EngineApi {
  readonly modelId: string;
  private readonly prepared: PreparedEngine;
  private fixtureSet: FixtureSet | null = null;

  constructor(model: unknown, registry: Registry) {
    this.prepared = prepareArtifacts(model, registry);
    this.modelId = this.prepared.modelId;
  }

  attachFixtureSet(fixtures: unknown): void {
    this.fixtureSet = parseFixtureSet(fixtures, this.prepared);
  }

  get fixtureSetId(): string | null {
    return this.fixtureSet === null ? null : this.fixtureSet.fixtureSetId;
  }

  verify(): FixtureVerificationReport {
    if (this.fixtureSet === null) {
      throw artifactInvalid("Verification fixtures are not attached");
    }
    return verifyFixtureSet(this.prepared, this.fixtureSet);
  }

  execute(request: ComputeRequest): ComputeResponse {
    const started = nowMs();
    try {
      const framing = validateEnvelope(request, this.prepared);
      const envelope = echoEnvelope(request);
      const scratch = createScratch(this.prepared);
      const caseRow = Float64Array.from(request.featureVector);
      const mask = request.observedMask;
      const revision = request.revision;
      let payload:
        | { evaluation: Evaluation }
        | { explanation: Explanation }
        | { ladder: LadderPayload }
        | { integrity: IntegrityPayload };
      switch (framing.operation) {
        case "evaluate":
          payload = {
            evaluation: evaluateVectors(this.prepared, caseRow, mask, revision, scratch),
          };
          break;
        case "explain":
          payload = {
            explanation: explainVectors(
              this.prepared,
              caseRow,
              mask,
              framing.targetId as TargetId,
              revision,
              scratch,
            ),
          };
          break;
        case "ladder":
          payload = { ladder: buildLadder(this.prepared, caseRow, mask, revision, scratch) };
          break;
        default:
          payload = { integrity: this.runIntegrity(framing.verificationFixtureId) };
          break;
      }
      return {
        ...envelope,
        status: "ok",
        ...payload,
        timing: { computeMs: nowMs() - started },
      };
    } catch (error) {
      return errorResponse(request, error, nowMs() - started);
    }
  }

  private runIntegrity(fixtureId?: string): IntegrityPayload {
    if (this.fixtureSet === null) {
      throw artifactInvalid("Verification fixtures are not attached");
    }
    const set = this.fixtureSet;
    const scratch = createScratch(this.prepared);
    const results: Array<{ fixtureId: string; passed: boolean }> = [];
    let maxProbability = 0;
    let maxMargin = 0;
    let maxAttribution = 0;
    let maxEfficiency = 0;
    for (const fixture of set.fixtures) {
      if (fixtureId !== undefined && fixture.id !== fixtureId) continue;
      const state = verifyFixture(this.prepared, fixture, set.tolerance, scratch);
      results.push({ fixtureId: fixture.id, passed: state.passed });
      maxProbability = Math.max(maxProbability, state.probability);
      maxMargin = Math.max(maxMargin, state.margin);
      maxAttribution = Math.max(maxAttribution, state.attribution);
      maxEfficiency = Math.max(maxEfficiency, state.efficiency);
    }
    if (fixtureId !== undefined && results.length === 0) {
      throw malformed(`Unknown verification fixture ${fixtureId}`);
    }
    return {
      fixtures: results,
      maxProbabilityDeviation: maxProbability,
      maxMarginDeviation: maxMargin,
      maxAttributionDeviation: maxAttribution,
      maxEfficiencyResidual: maxEfficiency,
      tolerance: set.tolerance,
      modelId: this.prepared.modelId,
      fixtureSetId: set.fixtureSetId,
    };
  }
}

const ENGINE_INSTANCES = new WeakMap<EngineApi, DomainEngine>();

export function createDomainEngine(model: unknown, registry: Registry): DomainEngine {
  const engine = new DomainEngine(model, registry);
  ENGINE_INSTANCES.set(engine, engine);
  return engine;
}

/**
 * Resolve an `Engine` handle back to its `DomainEngine` without casts — the
 * indirection lives in this module-level registry so the D-16 `Engine`
 * surface stays exactly `{ modelId, execute }` (AGENTS §7 law 6).
 */
export function resolveDomainEngine(engine: EngineApi): DomainEngine {
  const instance = ENGINE_INSTANCES.get(engine);
  if (instance === undefined) {
    throw artifactInvalid("expected an engine created by loadEngine");
  }
  return instance;
}

/** Attach the golden-fixture corpus to an engine produced by `loadEngine`. */
export function attachFixtureSet(engine: EngineApi, fixtures: unknown): void {
  resolveDomainEngine(engine).attachFixtureSet(fixtures);
}
