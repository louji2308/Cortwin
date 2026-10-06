/**
 * C-03 model-bundle boundary: structural validation of the runtime-form
 * document plus the C-02 correspondence checks the loader owes (Contracts
 * L120: "reject on registry/model feature-order or target-identity mismatch").
 *
 * Nothing here computes clinical truth; it only turns `unknown` into a
 * validated `ModelDocument` or throws a typed `ARTIFACT_INVALID` failure.
 * The reference implementation is `pipeline/oracle.py::Oracle.__init__`,
 * whose checks are reproduced here (plus the C-03 sections that document
 * declares).
 */
import type { Registry } from "../contracts/artifacts";
import type { ReliabilityTier, TargetId } from "../contracts/primitives";
import { artifactError, DomainError } from "./errors";

/** C-03/C-08: the four prediction targets, in contract order. */
export const CONTRACT_TARGETS: readonly TargetId[] = ["CAD", "LAD", "LCX", "RCA"];
export const CONTRACT_TIERS: readonly ReliabilityTier[] = ["strong", "moderate", "limited"];

/** C-03 `components.<target>.trees.trees[].nodes[]` — one split or one leaf. */
export type ModelNode = {
  featureIndex: number | null;
  threshold: number | null;
  left: number | null;
  right: number | null;
  leaf: number | null;
};

export type ModelTree = { nodes: ModelNode[] };

export type ModelTreeBlock = {
  targetId: string | undefined;
  baseScore: number;
  treeCount: number;
  trees: ModelTree[];
};

export type ModelLinearBlock = {
  intercept: number;
  coefficientByFeature: number[];
  meanByFeature: number[];
  scaleByFeature: number[];
};

export type ModelPlattBlock = { slope: number; intercept: number };

export type ModelDecisionBlock = {
  thresholdProbability: number;
  abstentionHalfWidthMargin: number;
};

export type ModelReliabilityReference = {
  targetId: TargetId;
  tier: ReliabilityTier;
  ruleId: string | undefined;
  evidenceRef: string | undefined;
};

/** C-03 `percentiles[]`: quantile points or level shares per feature. */
export type PercentileEntry =
  | { featureId: string; kind: "continuous"; points: number[] }
  | { featureId: string; kind: "binary" | "categorical"; levels: number[]; shares: number[] };

export type ModelDocument = {
  modelId: `sha256:${string}`;
  schemaVersion: string;
  modelFamily: string;
  featureCount: number;
  features: string[];
  targets: TargetId[];
  components: Record<
    TargetId,
    {
      trees: ModelTreeBlock;
      linear: ModelLinearBlock;
      platt: ModelPlattBlock;
    }
  >;
  decisionParameters: Record<TargetId, ModelDecisionBlock>;
  reliabilityReferences: ModelReliabilityReference[];
  background: { count: number; rows: number[][] };
  percentiles: PercentileEntry[];
  provenance: Record<string, unknown>;
};

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw artifactError(message);
}

function requireRecord(value: unknown, label: string): RecordLike {
  if (!isRecord(value)) fail(`model document has no ${label} block`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} is not a finite number`);
  }
  return value;
}

function requireNumberArray(value: unknown, label: string, size: number): number[] {
  if (!Array.isArray(value) || value.length !== size) {
    fail(`${label} does not have ${size} entries`);
  }
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      fail(`${label} contains a non-finite entry`);
    }
  }
  return value as number[];
}

function parseTreeBlock(value: unknown, targetId: string, featureCount: number): ModelTreeBlock {
  const block = requireRecord(value, `${targetId} trees`);
  const baseScore = requireNumber(block.baseScore, `${targetId} baseScore`);
  const treeCount = block.treeCount;
  const entries = block.trees;
  if (typeof treeCount !== "number" || !Number.isInteger(treeCount)) {
    fail(`${targetId} treeCount is not an integer`);
  }
  if (!Array.isArray(entries)) fail(`${targetId} trees block is not a list`);
  if (entries.length !== treeCount) fail(`${targetId} treeCount differs from the tree list`);
  const trees: ModelTree[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const nodes = isRecord(entry) ? entry.nodes : entry;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      fail(`${targetId} tree ${index} has no node list`);
    }
    trees.push({ nodes: parseNodes(nodes, targetId, index, featureCount) });
  }
  return { targetId: typeof block.targetId === "string" ? block.targetId : undefined, baseScore, treeCount, trees };
}

function parseNodes(
  nodes: unknown[],
  targetId: string,
  treeIndex: number,
  featureCount: number,
): ModelNode[] {
  const parsed: ModelNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!isRecord(node)) fail(`${targetId} tree ${treeIndex} node ${index} is not an object`);
    const leaf = node.leaf;
    const featureIndex = node.featureIndex;
    if (leaf !== null && leaf !== undefined) {
      if (featureIndex !== null && featureIndex !== undefined) {
        fail(`${targetId} tree ${treeIndex} node ${index} mixes leaf and split fields`);
      }
      if (node.left !== null && node.left !== undefined) {
        fail(`${targetId} tree ${treeIndex} node ${index} mixes leaf and split fields`);
      }
      parsed.push({
        featureIndex: null,
        threshold: null,
        left: null,
        right: null,
        leaf: requireNumber(leaf, `${targetId} tree ${treeIndex} node ${index} leaf`),
      });
      continue;
    }
    if (typeof featureIndex !== "number" || !Number.isInteger(featureIndex) || featureIndex < 0) {
      fail(`${targetId} tree ${treeIndex} node ${index} has no valid featureIndex`);
    }
    if (featureIndex >= featureCount) {
      fail(`${targetId} tree ${treeIndex} node ${index} split feature is outside the registry`);
    }
    const threshold = requireNumber(node.threshold, `${targetId} threshold`);
    const left = node.left;
    const right = node.right;
    if (typeof left !== "number" || !Number.isInteger(left) || left < 0) {
      fail(`${targetId} tree ${treeIndex} node ${index} has no child indices`);
    }
    if (typeof right !== "number" || !Number.isInteger(right) || right < 0) {
      fail(`${targetId} tree ${treeIndex} node ${index} has no child indices`);
    }
    if (left >= nodes.length || right >= nodes.length) {
      fail(`${targetId} tree ${treeIndex} node ${index} child is outside the node list`);
    }
    if (left === index || right === index) {
      fail(`${targetId} tree ${treeIndex} node ${index} references itself`);
    }
    parsed.push({ featureIndex, threshold, left, right, leaf: null });
  }
  return parsed;
}

function parseLinearBlock(value: unknown, targetId: string, size: number): ModelLinearBlock {
  const block = requireRecord(value, `${targetId} linear`);
  return {
    intercept: requireNumber(block.intercept, `${targetId} linear intercept`),
    coefficientByFeature: requireNumberArray(
      block.coefficientByFeature,
      `${targetId} coefficientByFeature`,
      size,
    ),
    meanByFeature: requireNumberArray(block.meanByFeature, `${targetId} meanByFeature`, size),
    scaleByFeature: requireNumberArray(block.scaleByFeature, `${targetId} scaleByFeature`, size),
  };
}

function parsePlattBlock(value: unknown, targetId: string): ModelPlattBlock {
  const block = requireRecord(value, `${targetId} platt`);
  const slope = requireNumber(block.slope, `${targetId} platt slope`);
  const intercept = requireNumber(block.intercept, `${targetId} platt intercept`);
  if (slope <= 0) fail(`${targetId} platt slope is not positive`);
  return { slope, intercept };
}

function parseDecisionBlock(value: unknown, targetId: string): ModelDecisionBlock {
  const block = requireRecord(value, `${targetId} decisionParameters`);
  const thresholdProbability = requireNumber(
    block.thresholdProbability,
    `${targetId} thresholdProbability`,
  );
  const abstentionHalfWidthMargin = requireNumber(
    block.abstentionHalfWidthMargin,
    `${targetId} abstentionHalfWidthMargin`,
  );
  if (!(thresholdProbability > 0 && thresholdProbability < 1)) {
    fail(`${targetId} thresholdProbability is outside (0, 1)`);
  }
  if (abstentionHalfWidthMargin <= 0) fail(`${targetId} abstention half width is not positive`);
  return { thresholdProbability, abstentionHalfWidthMargin };
}

function parseReliability(value: unknown): ModelReliabilityReference[] {
  if (!Array.isArray(value)) fail("model document has no reliabilityReferences block");
  const seen = new Set<string>();
  const references: ModelReliabilityReference[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) fail("reliability reference is not an object");
    const targetId = entry.targetId;
    const tier = entry.tier;
    if (typeof targetId !== "string" || !CONTRACT_TARGETS.includes(targetId as TargetId)) {
      fail("reliability reference names an unknown target");
    }
    if (typeof tier !== "string" || !CONTRACT_TIERS.includes(tier as ReliabilityTier)) {
      fail("reliability reference has an unknown tier");
    }
    if (seen.has(targetId)) fail("reliability references name a target twice");
    seen.add(targetId);
    references.push({
      targetId: targetId as TargetId,
      tier: tier as ReliabilityTier,
      ruleId: typeof entry.ruleId === "string" ? entry.ruleId : undefined,
      evidenceRef: typeof entry.evidenceRef === "string" ? entry.evidenceRef : undefined,
    });
  }
  if (CONTRACT_TARGETS.some((targetId) => !seen.has(targetId))) {
    fail("reliability references do not cover every target");
  }
  return references;
}

function parseBackground(value: unknown, featureCount: number): ModelDocument["background"] {
  const block = requireRecord(value, "background");
  const rows = block.rows;
  const count = block.count;
  if (!Array.isArray(rows) || rows.length === 0) fail("background rows are empty");
  if (typeof count !== "number" || !Number.isInteger(count) || count !== rows.length) {
    fail("background count differs from the row list");
  }
  const parsed: number[][] = [];
  for (const row of rows) {
    parsed.push(requireNumberArray(row, "background row", featureCount));
  }
  return { count, rows: parsed };
}

function parsePercentiles(value: unknown, featureIds: string[]): PercentileEntry[] {
  if (!Array.isArray(value)) fail("model document has no percentiles block");
  const byId = new Map<string, PercentileEntry>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.featureId !== "string") {
      fail("percentiles entry has no featureId");
    }
    if (byId.has(entry.featureId)) fail("percentiles name a feature twice");
    if (entry.kind === "continuous") {
      const points = entry.points;
      if (!Array.isArray(points) || points.length < 2) {
        fail(`percentiles for ${entry.featureId} have no quantile points`);
      }
      for (const point of points) {
        if (typeof point !== "number" || !Number.isFinite(point)) {
          fail(`percentiles for ${entry.featureId} contain a non-finite point`);
        }
      }
      byId.set(entry.featureId, {
        featureId: entry.featureId,
        kind: "continuous",
        points: points as number[],
      });
      continue;
    }
    if (entry.kind === "binary" || entry.kind === "categorical") {
      const levels = entry.levels;
      const shares = entry.shares;
      if (!Array.isArray(levels) || levels.length === 0 || !Array.isArray(shares)) {
        fail(`percentiles for ${entry.featureId} have no level shares`);
      }
      if (levels.length !== shares.length) {
        fail(`percentiles for ${entry.featureId} levels and shares differ in length`);
      }
      for (const level of levels) {
        if (typeof level !== "number" || !Number.isFinite(level)) {
          fail(`percentiles for ${entry.featureId} contain a non-finite level`);
        }
      }
      for (const share of shares) {
        if (typeof share !== "number" || !Number.isFinite(share)) {
          fail(`percentiles for ${entry.featureId} contain a non-finite share`);
        }
      }
      byId.set(entry.featureId, {
        featureId: entry.featureId,
        kind: entry.kind,
        levels: levels as number[],
        shares: shares as number[],
      });
      continue;
    }
    fail(`percentiles for ${entry.featureId} have an unknown kind`);
  }
  const ordered: PercentileEntry[] = [];
  for (const featureId of featureIds) {
    const entry = byId.get(featureId);
    if (entry === undefined) fail(`percentiles are missing feature ${featureId}`);
    ordered.push(entry);
  }
  return ordered;
}

/**
 * Validate one model document against the registry it will be evaluated with.
 * Throws `DomainError("ARTIFACT_INVALID")` on the first structural violation.
 */
export function parseModelDocument(input: unknown, registry: Registry): ModelDocument {
  if (!isRecord(input)) fail("model document root is not an object");

  const metadata = requireRecord(input.metadata, "metadata");
  if (metadata.schemaVersion !== "1.0.0") fail("model metadata schemaVersion is not 1.0.0");
  const modelId = metadata.modelId;
  if (typeof modelId !== "string" || !modelId.startsWith("sha256:") || modelId.length !== 71) {
    fail("model metadata modelId is not a sha256 identity");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(modelId)) fail("model metadata modelId is not a sha256 identity");
  const modelFamily = metadata.modelFamily;
  if (modelFamily !== "additive-ensemble") fail("model metadata modelFamily is not supported");
  if (metadata.featureCount !== registry.features.length) {
    fail("model metadata featureCount differs from the registry");
  }

  const features = input.features;
  if (!Array.isArray(features) || features.length === 0) fail("model features block is empty");
  if (!features.every((item) => typeof item === "string")) fail("model features block is not a list of ids");
  const registryIds = registry.features.map((feature) => feature.id);
  if (features.length !== registryIds.length) {
    fail("model feature count differs from the registry");
  }
  for (let index = 0; index < registryIds.length; index += 1) {
    if (features[index] !== registryIds[index]) {
      fail("registry feature order differs from the model");
    }
  }

  const targets = input.targets;
  if (!Array.isArray(targets) || targets.length !== CONTRACT_TARGETS.length) {
    fail("model target order differs from the C-03 contract");
  }
  for (let index = 0; index < CONTRACT_TARGETS.length; index += 1) {
    if (targets[index] !== CONTRACT_TARGETS[index]) {
      fail("model target order differs from the C-03 contract");
    }
  }

  const registryTargets = registry.targets.map((target) => target.id);
  for (const targetId of CONTRACT_TARGETS) {
    if (!registryTargets.includes(targetId)) fail(`registry has no target ${targetId}`);
  }

  const size = registryIds.length;
  const components = requireRecord(input.components, "components");
  const parameters = requireRecord(input.decisionParameters, "decisionParameters");
  const parsedComponents = {} as ModelDocument["components"];
  const parsedParameters = {} as ModelDocument["decisionParameters"];
  for (const targetId of CONTRACT_TARGETS) {
    const block = requireRecord(components[targetId], `${targetId} component`);
    parsedComponents[targetId] = {
      trees: parseTreeBlock(block.trees, targetId, size),
      linear: parseLinearBlock(block.linear, targetId, size),
      platt: parsePlattBlock(block.platt, targetId),
    };
    parsedParameters[targetId] = parseDecisionBlock(parameters[targetId], targetId);
  }

  const provenance = requireRecord(input.provenance, "provenance");

  return {
    modelId: modelId as `sha256:${string}`,
    schemaVersion: metadata.schemaVersion,
    modelFamily,
    featureCount: size,
    features: registryIds,
    targets: [...CONTRACT_TARGETS],
    components: parsedComponents,
    decisionParameters: parsedParameters,
    reliabilityReferences: parseReliability(input.reliabilityReferences),
    background: parseBackground(input.background, size),
    percentiles: parsePercentiles(input.percentiles, registryIds),
    provenance,
  };
}

/**
 * C-02 correspondence the loader owes before any evaluation runs: every
 * feature belongs to a declared modality, display-group membership agrees
 * with `features[].displayGroup`, and the forbidden-column list is present.
 */
export function validateRegistryCorrespondence(registry: Registry): void {
  if (registry.schemaVersion !== "1.0.0") fail("registry schemaVersion is not 1.0.0");
  const modalityIds = new Set(registry.modalities.map((modality) => modality.id));
  if (modalityIds.size !== registry.modalities.length) fail("registry modalities are not unique");
  const featureIds = new Set<string>();
  const groupOf = new Map<string, string | null>();
  for (const feature of registry.features) {
    if (featureIds.has(feature.id)) fail(`registry feature ${feature.id} is declared twice`);
    featureIds.add(feature.id);
    if (!modalityIds.has(feature.modality)) {
      fail(`registry feature ${feature.id} has no known modality`);
    }
    groupOf.set(feature.id, feature.displayGroup);
  }
  const seenInGroup = new Set<string>();
  for (const group of registry.displayGroups) {
    if (!Array.isArray(group.features) || group.features.length === 0) {
      fail("registry display group has no members");
    }
    for (const member of group.features) {
      if (!featureIds.has(member)) fail("registry display group names an unknown feature");
      if (seenInGroup.has(member)) fail("registry feature belongs to two display groups");
      seenInGroup.add(member);
      if (groupOf.get(member) !== group.id) fail("registry display group membership disagrees");
    }
  }
  for (const [featureId, declared] of groupOf) {
    if (declared !== null && groupOf.get(featureId) !== declared) {
      fail("registry display group membership disagrees");
    }
    if (declared !== null && !seenInGroup.has(featureId)) {
      fail("registry display group membership disagrees");
    }
  }
  if (!Array.isArray(registry.forbiddenInputColumns) || registry.forbiddenInputColumns.length === 0) {
    fail("registry has no forbidden input columns");
  }
  for (const column of registry.forbiddenInputColumns) {
    if (typeof column.id !== "string" || column.id.length === 0) {
      fail("registry forbidden column has no id");
    }
    if (featureIds.has(column.id)) fail("forbidden column overlaps a model feature");
  }
}

export { DomainError };
