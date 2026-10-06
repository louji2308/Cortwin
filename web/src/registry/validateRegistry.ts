import type { Registry } from "../contracts";
import { RegistryError, type RegistryIssue, type RegistryIssueCode } from "./errors";

/**
 * C-02 §5.2 — runtime validation of the registry, the sole correspondence
 * authority.
 *
 * Two layers, both collecting EVERY issue before failing (a doctored registry
 * reports its full list of findings, not just the first hit):
 *
 * 1. **Shape** — the artifact parses: right collections, right field types,
 *    well-formed encodings and ranges.
 * 2. **Referential integrity** — the C-02 rules verbatim: features → known
 *    modality; targets → known model key; vessel targets → exactly one known
 *    structure; every structure → a valid mesh node; unique feature ids (the
 *    registry carries rows in feature order, so id uniqueness IS the unique-
 *    index rule); forbidden columns disjoint from model features; display
 *    groups contain only existing features; stage sequences monotonic with
 *    true modality prefixes; no id collisions; plus the C-02 "required
 *    entities" set (4 targets, 54 features, modality counts 17/13/7/14/3).
 */

const SCHEMA_VERSION = "1.0.0";
const TARGET_IDS = ["CAD", "LAD", "LCX", "RCA"] as const;
const STRUCTURE_IDS = ["HEART", "AORTA", "LAD", "LCX", "RCA"] as const;
const CAMERA_PRESETS = ["Overview", "LAD", "LCX", "RCA"] as const;
const FEATURE_KINDS = ["continuous", "binary", "categorical"] as const;
const TARGET_KINDS = ["overall", "vessel"] as const;
const UNIT_STATUSES = ["verified", "unverified"] as const;
const ENCODING_TYPES = ["identity", "map", "ordinal"] as const;

/** C-02 §5.2 required entities: modality label → exact feature count. */
const MODALITY_COUNTS: Record<string, number> = {
  History: 17,
  "Exam & symptoms": 13,
  ECG: 7,
  Labs: 14,
  Echo: 3
};
const FEATURE_COUNT = 54;

const COLLECTIONS = [
  "modalities",
  "features",
  "targets",
  "structures",
  "displayGroups",
  "stages",
  "forbiddenInputColumns"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function issue(
  issues: RegistryIssue[],
  code: RegistryIssueCode,
  path: string,
  detail?: string
): void {
  issues.push(detail === undefined ? { code, path } : { code, path, detail });
}

function checkEntry(
  issues: RegistryIssue[],
  entry: unknown,
  path: string,
  check: (value: Record<string, unknown>, path: string) => void
): void {
  if (!isRecord(entry)) {
    issue(issues, "MALFORMED_ENTRY", path);
    return;
  }
  check(entry, path);
}

function checkStringField(
  issues: RegistryIssue[],
  entry: Record<string, unknown>,
  path: string,
  field: string
): void {
  if (!isString(entry[field])) issue(issues, "MALFORMED_FIELD", `${path}.${field}`);
}

function checkNullableString(
  issues: RegistryIssue[],
  entry: Record<string, unknown>,
  path: string,
  field: string
): void {
  const value = entry[field];
  if (value !== null && !isString(value)) issue(issues, "MALFORMED_FIELD", `${path}.${field}`);
}

function checkShape(raw: unknown): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  if (!isRecord(raw)) {
    issue(issues, "MALFORMED_JSON", "$");
    return issues;
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    issue(issues, "SCHEMA_VERSION", "schemaVersion", String(raw.schemaVersion));
  }
  for (const key of COLLECTIONS) {
    if (!Array.isArray(raw[key])) issue(issues, "MALFORMED_COLLECTION", key);
  }
  if (issues.some((entry) => entry.code === "MALFORMED_COLLECTION")) return issues;

  for (const [index, entry] of (raw.modalities as unknown[]).entries()) {
    const path = `modalities[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      checkStringField(issues, value, at, "label");
      if (!isFiniteNumber(value.order)) issue(issues, "MALFORMED_FIELD", `${at}.order`);
    });
  }

  for (const [index, entry] of (raw.features as unknown[]).entries()) {
    const path = `features[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      checkStringField(issues, value, at, "label");
      checkStringField(issues, value, at, "modality");
      if (!(FEATURE_KINDS as readonly unknown[]).includes(value.kind)) {
        issue(issues, "MALFORMED_FIELD", `${at}.kind`);
      }
      checkNullableString(issues, value, at, "displayGroup");
      checkNullableString(issues, value, at, "unit");
      if (!(UNIT_STATUSES as readonly unknown[]).includes(value.unitStatus)) {
        issue(issues, "MALFORMED_FIELD", `${at}.unitStatus`);
      }

      const encoding = value.encoding;
      if (!isRecord(encoding) || !(ENCODING_TYPES as readonly unknown[]).includes(encoding.type)) {
        issue(issues, "ENCODING_MALFORMED", `${at}.encoding`);
      } else if (encoding.type === "map") {
        const map = encoding.map;
        if (!isRecord(map)) {
          issue(issues, "ENCODING_MALFORMED", `${at}.encoding.map`);
        } else {
          for (const [key, mapped] of Object.entries(map)) {
            if (!isFiniteNumber(mapped)) {
              issue(issues, "ENCODING_MALFORMED", `${at}.encoding.map.${key}`);
            }
          }
        }
      } else if (encoding.type === "ordinal") {
        const levels = encoding.levels;
        if (!Array.isArray(levels) || levels.length === 0 || !levels.every(isFiniteNumber)) {
          issue(issues, "ENCODING_MALFORMED", `${at}.encoding.levels`);
        }
      }

      const range = value.range;
      if (!isRecord(range) || !isFiniteNumber(range.min) || !isFiniteNumber(range.max)) {
        issue(issues, "RANGE_MALFORMED", `${at}.range`);
      } else if (range.min > range.max) {
        issue(issues, "RANGE_MALFORMED", `${at}.range`, `${range.min} > ${range.max}`);
      }

      const derived = value.derived;
      if (derived !== null) {
        if (!isRecord(derived) || !isString(derived.formula) || !Array.isArray(derived.inputs)) {
          issue(issues, "MALFORMED_FIELD", `${at}.derived`);
        } else if (!derived.inputs.every((input) => isString(input))) {
          issue(issues, "MALFORMED_FIELD", `${at}.derived.inputs`);
        }
      }
    });
  }

  for (const [index, entry] of (raw.targets as unknown[]).entries()) {
    const path = `targets[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      checkStringField(issues, value, at, "label");
      if (!(TARGET_KINDS as readonly unknown[]).includes(value.kind)) {
        issue(issues, "MALFORMED_FIELD", `${at}.kind`);
      }
      // modelKey must be a string (empty/duplicate are referential issues);
      // structureId is a string or null (missing link is referential).
      if (typeof value.modelKey !== "string") {
        issue(issues, "MALFORMED_FIELD", `${at}.modelKey`);
      }
      if (value.structureId !== null && typeof value.structureId !== "string") {
        issue(issues, "MALFORMED_FIELD", `${at}.structureId`);
      }
      checkStringField(issues, value, at, "labelDefinition");
    });
  }

  for (const [index, entry] of (raw.structures as unknown[]).entries()) {
    const path = `structures[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      checkStringField(issues, value, at, "label");
      checkStringField(issues, value, at, "meshNode");
      if (!(CAMERA_PRESETS as readonly unknown[]).includes(value.cameraPreset)) {
        issue(issues, "MALFORMED_FIELD", `${at}.cameraPreset`);
      }
      checkNullableString(issues, value, at, "schematicPath");
    });
  }

  for (const [index, entry] of (raw.displayGroups as unknown[]).entries()) {
    const path = `displayGroups[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      checkStringField(issues, value, at, "label");
      if (!Array.isArray(value.features) || !value.features.every((id) => isString(id))) {
        issue(issues, "MALFORMED_FIELD", `${at}.features`);
      }
    });
  }

  for (const [index, entry] of (raw.stages as unknown[]).entries()) {
    const path = `stages[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      if (!isFiniteNumber(value.order)) issue(issues, "MALFORMED_FIELD", `${at}.order`);
      if (
        !Array.isArray(value.modalitiesThrough) ||
        !value.modalitiesThrough.every((id) => isString(id))
      ) {
        issue(issues, "MALFORMED_FIELD", `${at}.modalitiesThrough`);
      }
    });
  }

  for (const [index, entry] of (raw.forbiddenInputColumns as unknown[]).entries()) {
    const path = `forbiddenInputColumns[${index}]`;
    checkEntry(issues, entry, path, (value, at) => {
      checkStringField(issues, value, at, "id");
      checkStringField(issues, value, at, "reason");
    });
  }

  return issues;
}

function checkUniqueIds(
  issues: RegistryIssue[],
  entries: ReadonlyArray<{ id: string }>,
  path: string
): void {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (seen.has(entry.id)) {
      issue(issues, "DUPLICATE_ID", `${path}[${index}].id`, entry.id);
    }
    seen.add(entry.id);
  }
}

/** C-02 §5.2 referential integrity — the executable form of the rule list. */
export function validateRegistryIntegrity(registry: Registry): RegistryIssue[] {
  const issues: RegistryIssue[] = [];

  checkUniqueIds(issues, registry.modalities, "modalities");
  checkUniqueIds(issues, registry.features, "features");
  checkUniqueIds(issues, registry.targets, "targets");
  checkUniqueIds(issues, registry.structures, "structures");
  checkUniqueIds(issues, registry.displayGroups, "displayGroups");
  checkUniqueIds(issues, registry.stages, "stages");
  checkUniqueIds(issues, registry.forbiddenInputColumns, "forbiddenInputColumns");

  // Required entities: exactly 54 features in the five contract modalities.
  const modalityById = new Map(registry.modalities.map((modality) => [modality.id, modality]));
  const labelToCount = new Map<string, number>();
  for (const [index, feature] of registry.features.entries()) {
    if (!modalityById.has(feature.modality)) {
      issue(issues, "UNKNOWN_MODALITY", `features[${index}].modality`, feature.modality);
      continue;
    }
    const label = modalityById.get(feature.modality)!.label;
    labelToCount.set(label, (labelToCount.get(label) ?? 0) + 1);
  }
  if (registry.features.length !== FEATURE_COUNT) {
    issue(issues, "FEATURE_COUNT", "features", String(registry.features.length));
  }
  for (const modality of registry.modalities) {
    if (!(modality.label in MODALITY_COUNTS)) {
      issue(issues, "UNEXPECTED_MODALITY", "modalities", modality.label);
    }
  }
  for (const [label, expected] of Object.entries(MODALITY_COUNTS)) {
    const found = labelToCount.get(label) ?? 0;
    if (found !== expected) {
      issue(issues, "MODALITY_FEATURE_COUNT", "features", `${label}: expected ${expected}, found ${found}`);
    }
  }

  // Targets: exactly the four contract targets, each with a unique model key.
  const targetIds = registry.targets.map((target) => target.id);
  for (const required of TARGET_IDS) {
    if (!targetIds.includes(required)) {
      issue(issues, "TARGET_SET", "targets", `missing ${required}`);
    }
  }
  for (const [index, target] of registry.targets.entries()) {
    if (!(TARGET_IDS as readonly string[]).includes(target.id)) {
      issue(issues, "TARGET_SET", `targets[${index}].id`, target.id);
    }
    const expectedKind = (TARGET_IDS as readonly string[]).includes(target.id)
      ? target.id === "CAD" ? "overall" : "vessel"
      : target.kind;
    if (target.kind !== expectedKind) {
      issue(issues, "TARGET_KIND", `targets[${index}].kind`, `${target.id} is ${target.kind}`);
    }
    if (typeof target.modelKey !== "string" || target.modelKey.trim() === "") {
      issue(issues, "TARGET_MODEL_KEY", `targets[${index}].modelKey`, "empty");
    }
  }
  const modelKeys = new Set<string>();
  for (const [index, target] of registry.targets.entries()) {
    if (modelKeys.has(target.modelKey)) {
      issue(issues, "TARGET_MODEL_KEY", `targets[${index}].modelKey`, `duplicate ${target.modelKey}`);
    }
    modelKeys.add(target.modelKey);
  }

  // Vessel targets → exactly one known structure; no shared structure.
  const structureById = new Map(registry.structures.map((structure) => [structure.id, structure]));
  const structureOwner = new Map<string, string>();
  for (const [index, target] of registry.targets.entries()) {
    if (target.kind !== "vessel") continue;
    if (target.structureId === null || !structureById.has(target.structureId)) {
      issue(
        issues,
        "VESSEL_STRUCTURE_MISSING",
        `targets[${index}].structureId`,
        target.structureId ?? "null"
      );
      continue;
    }
    const owner = structureOwner.get(target.structureId);
    if (owner !== undefined) {
      issue(
        issues,
        "VESSEL_STRUCTURE_SHARED",
        `targets[${index}].structureId`,
        `${owner} and ${target.id}`
      );
    } else {
      structureOwner.set(target.structureId, target.id);
    }
  }

  // Structures: exactly the five named nodes, each with a valid mesh node.
  const structureIds = registry.structures.map((structure) => structure.id);
  for (const required of STRUCTURE_IDS) {
    if (!structureIds.includes(required)) {
      issue(issues, "STRUCTURE_SET", "structures", `missing ${required}`);
    }
  }
  for (const [index, structure] of registry.structures.entries()) {
    if (!(STRUCTURE_IDS as readonly string[]).includes(structure.id)) {
      issue(issues, "STRUCTURE_SET", `structures[${index}].id`, structure.id);
    }
    if (!(STRUCTURE_IDS as readonly string[]).includes(structure.meshNode)) {
      issue(issues, "STRUCTURE_MESH_NODE", `structures[${index}].meshNode`, structure.meshNode);
    }
  }

  // Forbidden columns are disjoint from the model features.
  const featureIds = new Set(registry.features.map((feature) => feature.id));
  for (const [index, column] of registry.forbiddenInputColumns.entries()) {
    if (featureIds.has(column.id)) {
      issue(issues, "FORBIDDEN_OVERLAP", `forbiddenInputColumns[${index}].id`, column.id);
    }
  }

  // Display groups contain only existing features.
  for (const [index, group] of registry.displayGroups.entries()) {
    for (const [member, featureId] of group.features.entries()) {
      if (!featureIds.has(featureId)) {
        issue(issues, "DISPLAY_GROUP_UNKNOWN_FEATURE", `displayGroups[${index}].features[${member}]`, featureId);
      }
    }
  }

  // Stages: monotonic orders, and each list is the true prefix of modality order.
  const modalityOrder = [...registry.modalities]
    .sort((a, b) => a.order - b.order)
    .map((modality) => modality.id);
  for (let index = 1; index < registry.stages.length; index += 1) {
    if (registry.stages[index].order <= registry.stages[index - 1].order) {
      issue(issues, "STAGE_ORDER_NOT_MONOTONIC", `stages[${index}].order`);
    }
  }
  for (const [index, stage] of registry.stages.entries()) {
    const known = stage.modalitiesThrough.every((id) => modalityById.has(id));
    if (!known) {
      issue(issues, "UNKNOWN_MODALITY", `stages[${index}].modalitiesThrough`);
      continue;
    }
    const expected = modalityOrder.slice(0, stage.modalitiesThrough.length);
    if (stage.modalitiesThrough.length === 0 || stage.modalitiesThrough.some((id, position) => id !== expected[position])) {
      issue(issues, "STAGE_PREFIX_INVALID", `stages[${index}].modalitiesThrough`);
    }
  }

  // Derived features reference existing inputs.
  for (const [index, feature] of registry.features.entries()) {
    if (feature.derived === null) continue;
    for (const [position, input] of feature.derived.inputs.entries()) {
      if (!featureIds.has(input)) {
        issue(issues, "DERIVED_INPUT_UNKNOWN", `features[${index}].derived.inputs[${position}]`, input);
      }
    }
  }

  return issues;
}

/**
 * Total audit: shape first, then integrity when (and only when) the shape is
 * trustworthy. Never throws — the caller decides how to fail.
 */
export function auditRegistry(raw: unknown): RegistryIssue[] {
  const input = typeof raw === "string" ? tryParse(raw) : raw;
  if (input === null) return [{ code: "MALFORMED_JSON", path: "$" }];
  const shapeIssues = checkShape(input);
  if (shapeIssues.length > 0) return shapeIssues;
  return validateRegistryIntegrity(input as Registry);
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * C-02 §5.2 — runtime entry point. Returns the validated registry or throws
 * `RegistryError` carrying every issue. Load-gate behaviour (visible
 * degradation, never a silent default) belongs to the caller.
 */
export function parseRegistry(json: unknown): Registry {
  const issues = auditRegistry(json);
  if (issues.length > 0) throw new RegistryError(issues);
  return (typeof json === "string" ? (tryParse(json) as Registry) : (json as Registry));
}
