/**
 * P5B-1 — semantic validation of the verified artifact bytes (C-02 registry,
 * C-03 model, C-05 cases, C-04 results, C-06 fixtures, C-11 structures).
 *
 * This is the runtime schema gate: identity cross-checks that only a boot
 * loader can perform (manifest ↔ model ↔ fixtures ↔ registry ↔ mesh) run
 * here, before anything is published to the store. Deep model semantics stay
 * with `loadEngine` (D-16) and the Python pipeline tests — this layer checks
 * structure and cross-artifact identity, never clinical meaning.
 */
import type {
  CaseDefinition,
  Manifest,
  ModelMetadata,
  Registry,
  Results
} from "../contracts";
import { bootAbort } from "./errors";
import type { VerifiedArtifactBytes } from "./verify";

/** C-02/C-03 schema law: 54 model features (Project/Tech_Stack core facts). */
const EXPECTED_FEATURE_COUNT = 54;

const CASE_PROVENANCES = ["hypothetical", "cohort-record", "blank"];

const RESULTS_SECTIONS = [
  "protocol",
  "performance",
  "calibration",
  "decisions",
  "subgroups",
  "evidenceLadder",
  "reliability",
  "provenance"
] as const;

export type ParsedBundle = {
  registry: Registry;
  /** Raw `model.json` document — validated here for identity, deep-checked by `loadEngine`. */
  model: unknown;
  modelMetadata: ModelMetadata;
  cases: CaseDefinition[];
  /** `null` when `results.json` could not be fetched (FM-10 → §16.1 G5). */
  results: Results | null;
  fixtures: unknown;
  /** Node names actually present in the GLB, compared against `registry.structures[].meshNode`. */
  structureNodeNames: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(artifact: string, detail: string): never {
  bootAbort(
    "ARTIFACT_INVALID",
    `The "${artifact}" artifact failed validation: ${detail}.`,
    "Rebuild the bundle (`make reproduce`) and reload; the shipped artifacts are inconsistent."
  );
}

function parseJson(artifact: string, bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return invalid(artifact, "the document is not valid UTF-8 JSON");
  }
}

function requireStringArray(value: unknown, label: string, artifact: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return invalid(artifact, `${label} must be an array of strings`);
  }
  return value as string[];
}

function validateRegistry(doc: unknown): Registry {
  if (!isRecord(doc)) invalid("registry", "the document is not an object");
  if (doc.schemaVersion !== "1.0.0") invalid("registry", 'schemaVersion is not "1.0.0"');

  const modalities = doc.modalities;
  if (!Array.isArray(modalities) || modalities.length === 0) {
    invalid("registry", "modalities must be a non-empty array");
  }
  const modalityIds = new Set<string>();
  for (const modality of modalities as unknown[]) {
    if (!isRecord(modality) || typeof modality.id !== "string" || modality.id === "") {
      invalid("registry", "every modality needs a non-empty id");
    }
    if (modalityIds.has(modality.id)) invalid("registry", `duplicate modality id "${modality.id}"`);
    modalityIds.add(modality.id);
  }

  const structures = doc.structures;
  if (!Array.isArray(structures) || structures.length === 0) {
    invalid("registry", "structures must be a non-empty array");
  }
  const structureIds = new Set<string>();
  for (const structure of structures as unknown[]) {
    if (!isRecord(structure) || typeof structure.id !== "string" || structure.id === "") {
      invalid("registry", "every structure needs a non-empty id");
    }
    if (typeof structure.meshNode !== "string" || structure.meshNode === "") {
      invalid("registry", `structure "${structure.id}" has no meshNode`);
    }
    if (structureIds.has(structure.id)) {
      invalid("registry", `duplicate structure id "${structure.id}"`);
    }
    structureIds.add(structure.id);
  }

  const features = doc.features;
  if (!Array.isArray(features)) invalid("registry", "features must be an array");
  if (features.length !== EXPECTED_FEATURE_COUNT) {
    invalid("registry", `expected ${EXPECTED_FEATURE_COUNT} features, found ${features.length}`);
  }
  const featureIds = new Set<string>();
  for (const feature of features as unknown[]) {
    if (!isRecord(feature) || typeof feature.id !== "string" || feature.id === "") {
      invalid("registry", "every feature needs a non-empty id");
    }
    if (featureIds.has(feature.id)) invalid("registry", `duplicate feature id "${feature.id}"`);
    if (!modalityIds.has(feature.modality as string)) {
      invalid("registry", `feature "${feature.id}" references unknown modality`);
    }
    if (!isRecord(feature.encoding)) invalid("registry", `feature "${feature.id}" has no encoding`);
    featureIds.add(feature.id);
  }

  // INV: forbidden target columns must never be model inputs (leakage gate).
  const forbidden = doc.forbiddenInputColumns;
  if (!Array.isArray(forbidden)) invalid("registry", "forbiddenInputColumns must be an array");
  for (const entry of forbidden as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      invalid("registry", "every forbidden column needs an id");
    }
    if (featureIds.has(entry.id)) {
      invalid("registry", `forbidden column "${entry.id}" appears among model features`);
    }
  }

  const targets = doc.targets;
  if (!Array.isArray(targets) || targets.length === 0) invalid("registry", "targets must be non-empty");
  const targetIds = new Set<string>();
  for (const target of targets as unknown[]) {
    if (!isRecord(target) || typeof target.id !== "string" || target.id === "") {
      invalid("registry", "every target needs a non-empty id");
    }
    if (targetIds.has(target.id)) invalid("registry", `duplicate target id "${target.id}"`);
    const structureId = target.structureId;
    if (
      structureId !== null &&
      structureId !== undefined &&
      (typeof structureId !== "string" || !structureIds.has(structureId))
    ) {
      invalid("registry", `target "${target.id}" references an unknown structure`);
    }
    targetIds.add(target.id);
  }

  const stages = doc.stages;
  if (!Array.isArray(stages) || stages.length === 0) invalid("registry", "stages must be non-empty");
  for (const stage of stages as unknown[]) {
    if (!isRecord(stage) || typeof stage.id !== "string" || stage.id === "") {
      invalid("registry", "every stage needs a non-empty id");
    }
  }

  return doc as unknown as Registry;
}

function validateModel(doc: unknown, manifest: Manifest, registry: Registry): ModelMetadata {
  if (!isRecord(doc)) invalid("model", "the document is not an object");
  const metadata = doc.metadata;
  if (!isRecord(metadata)) invalid("model", "the model has no metadata block");
  if (metadata.schemaVersion !== "1.0.0") invalid("model", 'schemaVersion is not "1.0.0"');
  if (metadata.modelId !== manifest.modelId) {
    invalid("model", "modelId does not match the manifest modelId");
  }
  if (metadata.featureCount !== EXPECTED_FEATURE_COUNT) {
    invalid("model", `metadata.featureCount is not ${EXPECTED_FEATURE_COUNT}`);
  }
  if (metadata.featureCount !== registry.features.length) {
    invalid("model", "metadata.featureCount does not match the registry feature count");
  }
  if (metadata.modelFamily !== "additive-ensemble") invalid("model", "unknown modelFamily");
  if (typeof metadata.appVersion !== "string" || metadata.appVersion === "") {
    invalid("model", "metadata has no appVersion");
  }
  const targets = requireStringArray(metadata.targets, "metadata.targets", "model");
  const registryTargets = registry.targets.map((target) => target.id);
  if (targets.length !== registryTargets.length || registryTargets.some((id) => !targets.includes(id))) {
    invalid("model", "metadata.targets do not match the registry targets");
  }
  return metadata as unknown as ModelMetadata;
}

function validateCases(doc: unknown, registry: Registry): CaseDefinition[] {
  if (!isRecord(doc)) invalid("cases", "the document is not an object");
  if (doc.schemaVersion !== "1.0.0") invalid("cases", 'schemaVersion is not "1.0.0"');
  if (!Array.isArray(doc.cases) || doc.cases.length === 0) invalid("cases", "cases must be non-empty");

  const featureIds = new Set(registry.features.map((feature) => feature.id));
  const modalityIds = new Set(registry.modalities.map((modality) => modality.id));
  const seen = new Set<string>();

  for (const entry of doc.cases as unknown[]) {
    if (!isRecord(entry)) invalid("cases", "every case must be an object");
    if (typeof entry.id !== "string" || entry.id === "") invalid("cases", "every case needs an id");
    if (seen.has(entry.id)) invalid("cases", `duplicate case id "${entry.id}"`);
    seen.add(entry.id);
    if (typeof entry.label !== "string") invalid("cases", `case "${entry.id}" has no label`);
    if (!CASE_PROVENANCES.includes(entry.provenance as string)) {
      invalid("cases", `case "${entry.id}" has an unknown provenance`);
    }
    if (!isRecord(entry.values)) invalid("cases", `case "${entry.id}" has no values block`);
    for (const key of Object.keys(entry.values)) {
      if (!featureIds.has(key)) invalid("cases", `case "${entry.id}" carries unknown feature "${key}"`);
      const value = entry.values[key];
      if (typeof value === "number" ? !Number.isFinite(value) : typeof value !== "string") {
        invalid("cases", `case "${entry.id}" carries a non-finite or non-text value`);
      }
    }
    if (!isRecord(entry.providedFeatures) || !isRecord(entry.providedModalities)) {
      invalid("cases", `case "${entry.id}" has no missingness flags`);
    }
    for (const key of Object.keys(entry.providedFeatures)) {
      if (!featureIds.has(key)) {
        invalid("cases", `case "${entry.id}" flags unknown feature "${key}"`);
      }
      if (typeof entry.providedFeatures[key] !== "boolean") {
        invalid("cases", `case "${entry.id}" has a non-boolean feature flag`);
      }
    }
    for (const key of Object.keys(entry.providedModalities)) {
      if (!modalityIds.has(key)) {
        invalid("cases", `case "${entry.id}" flags unknown modality "${key}"`);
      }
      if (typeof entry.providedModalities[key] !== "boolean") {
        invalid("cases", `case "${entry.id}" has a non-boolean modality flag`);
      }
    }
    if (!Array.isArray(entry.notes) || entry.notes.some((note) => typeof note !== "string")) {
      invalid("cases", `case "${entry.id}" notes must be strings`);
    }
  }
  return doc.cases as CaseDefinition[];
}

function validateResults(doc: unknown): Results {
  if (!isRecord(doc)) invalid("results", "the document is not an object");
  if (doc.schemaVersion !== "1.0.0") invalid("results", 'schemaVersion is not "1.0.0"');
  for (const section of RESULTS_SECTIONS) {
    if (!(section in doc)) invalid("results", `missing "${section}" section`);
  }
  if (!isRecord(doc.protocol) || !isRecord(doc.performance)) {
    invalid("results", "protocol and performance must be objects");
  }
  if (!Array.isArray(doc.subgroups)) invalid("results", "subgroups must be an array");
  return doc as unknown as Results;
}

function validateFixtures(doc: unknown, manifest: Manifest): unknown {
  if (!isRecord(doc)) invalid("fixtures", "the document is not an object");
  if (doc.schemaVersion !== "1.0.0") invalid("fixtures", 'schemaVersion is not "1.0.0"');
  if (!isRecord(doc.provenance) || doc.provenance.modelId !== manifest.modelId) {
    invalid("fixtures", "provenance.modelId does not match the manifest modelId");
  }
  if (!Array.isArray(doc.fixtures) || doc.fixtures.length === 0) {
    invalid("fixtures", "fixtures must be non-empty");
  }
  if (!isRecord(doc.tolerance)) invalid("fixtures", "tolerance must be an object");
  return doc;
}

/** GLB chunk 0 must be JSON containing every `meshNode` the registry names. */
function validateStructures(bytes: Uint8Array, registry: Registry): string[] {
  if (bytes.byteLength < 20) invalid("structures", "the file is too small to be a glTF binary");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) invalid("structures", "the file is not a glTF binary");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) {
    invalid("structures", "the declared glTF length does not match the file size");
  }
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a) invalid("structures", "the first glTF chunk is not JSON");
  if (20 + chunkLength > bytes.byteLength) invalid("structures", "the glTF JSON chunk is truncated");

  let doc: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(20, 20 + chunkLength)
    );
    doc = JSON.parse(json) as unknown;
  } catch {
    return invalid("structures", "the glTF JSON chunk is not valid JSON");
  }
  if (!isRecord(doc) || !Array.isArray(doc.nodes)) invalid("structures", "the glTF has no nodes");

  const names = new Set<string>();
  for (const node of doc.nodes as unknown[]) {
    if (isRecord(node) && typeof node.name === "string") names.add(node.name);
  }
  for (const structure of registry.structures) {
    if (!names.has(structure.meshNode)) {
      invalid("structures", `mesh node "${structure.meshNode}" is missing from the asset`);
    }
  }
  return [...names];
}

/** Verify + validate all six artifacts into the typed bundle the boot publishes. */
export function validateBundle(manifest: Manifest, bytes: VerifiedArtifactBytes): ParsedBundle {
  const registry = validateRegistry(parseJson("registry", bytes.registry));
  const model = parseJson("model", bytes.model);
  const modelMetadata = validateModel(model, manifest, registry);
  const cases = validateCases(parseJson("cases", bytes.cases), registry);
  // `results` is the one optional slot (FM-10 → §16.1 G5): when it never
  // arrived the bundle carries an explicit absence, never a stand-in document.
  const results =
    bytes.results === null ? null : validateResults(parseJson("results", bytes.results));
  const fixtures = validateFixtures(parseJson("fixtures", bytes.fixtures), manifest);
  const structureNodeNames = validateStructures(bytes.structures, registry);
  return { registry, model, modelMetadata, cases, results, fixtures, structureNodeNames };
}
