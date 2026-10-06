/**
 * Architecture §8.4 / C-08 encoding boundary — the strict domain encoder.
 *
 * Reference implementation: `pipeline/encode.py::encode_case` +
 * `pipeline/encode.py::encode_value`. Domain rules (each raises a typed
 * `DomainError`, never a bare `TypeError`):
 *
 * * forbidden input column present in `values` (leakage guard) -> MALFORMED;
 * * unknown categorical level / unknown feature id / malformed ordinal /
 *   discrete value outside its allowed set / observed feature with no value /
 *   non-numeric continuous value -> INVALID_FEATURE_VECTOR;
 * * non-finite value (NaN / Infinity) -> NONFINITE_INPUT.
 *
 * Out-of-range *continuous* values are never an error (Contracts 39.5): they
 * stay valid input and surface as `rangeFlags` in the evaluation only.
 *
 * Missingness (INV-C08/C09): an unobserved feature — unprovided itself, or
 * provided inside an unprovided modality — is excluded by `observedMask`. The
 * engine never reads an unobserved slot, so the transported slot carries a
 * neutral finite placeholder (`0`) purely because C-07 transports a
 * `Float32Array` and the store validates every transported entry as finite
 * (the mask, not the value, decides participation — exactly the behaviour of
 * the store's own encoder double in `store/testFixtures.ts`).
 *
 * The browser registry (`C-02`) publishes `encoding.type` plus `range`, but no
 * `allowedValues`; for identity-encoded non-continuous features the allowed set
 * is the integer codes inside `range` (binary -> {0, 1}), which is exactly the
 * set `config/features.json` publishes for those features.
 */
import type { Registry, RegistryFeature } from "../contracts/artifacts";
import type { CaseEncoder, EncodedCase } from "../contracts/compute";
import { DomainError } from "./errors";
import { levelEquals, parseFiniteNumber } from "./numbers";

/** Transport placeholder for an unobserved slot (never read by the engine). */
const UNOBSERVED_SLOT = 0;

function invalid(featureId: string, reason: string): DomainError {
  return new DomainError("INVALID_FEATURE_VECTOR", `case value rejected for ${featureId}`, {
    featureId,
    reason,
  });
}

function unsupportedEncoding(featureId: string): DomainError {
  return invalid(featureId, "unsupported encoding type");
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** `pipeline/encode.py::encode_value` — source space -> model-space float. */
function encodeValue(feature: RegistryFeature, raw: unknown): number {
  const featureId = feature.id;
  const encoding = feature.encoding;

  if (encoding.type === "identity") {
    const parsed = parseFiniteNumber(raw);
    if (parsed.kind === "missing") {
      throw invalid(featureId, "provided feature has no value");
    }
    if (parsed.kind === "non-numeric") {
      throw invalid(featureId, "non-numeric continuous value");
    }
    if (parsed.kind === "non-finite") {
      throw new DomainError("NONFINITE_INPUT", `case value for ${featureId} is not finite`, {
        featureId,
        reason: "non-finite value",
      });
    }
    if (feature.kind !== "continuous") {
      const { min, max } = feature.range;
      const discrete = Number.isInteger(parsed.value) && parsed.value >= min && parsed.value <= max;
      if (!discrete) throw invalid(featureId, "discrete value out of range");
    }
    return parsed.value;
  }

  if (encoding.type === "map") {
    const table = encoding.map;
    if (typeof raw !== "string" || !hasOwn(table, raw)) {
      throw invalid(featureId, "unknown categorical level");
    }
    const encoded = table[raw];
    if (typeof encoded !== "number" || !Number.isFinite(encoded)) {
      throw new DomainError("ARTIFACT_INVALID", `registry map encoding for ${featureId} is invalid`, {
        featureId,
        reason: "unsupported encoding type",
      });
    }
    return encoded;
  }

  if (encoding.type === "ordinal") {
    const levels = encoding.levels;
    if (levels.length === 0) throw unsupportedEncoding(featureId);
    if (raw === null || raw === undefined) {
      throw invalid(featureId, "provided feature has no value");
    }
    for (let index = 0; index < levels.length; index += 1) {
      if (levelEquals(raw, levels[index])) return index;
    }
    throw invalid(featureId, "malformed ordinal value");
  }

  throw unsupportedEncoding(featureId);
}

function observedState(
  feature: RegistryFeature,
  providedFeatures: Record<string, boolean>,
  providedModalities: Record<string, boolean>,
): boolean {
  const featureProvided = hasOwn(providedFeatures, feature.id)
    ? providedFeatures[feature.id]
    : true;
  const modalityProvided = hasOwn(providedModalities, feature.modality)
    ? providedModalities[feature.modality]
    : true;
  return featureProvided !== false && modalityProvided !== false;
}

/**
 * Encode one source-space case into the registry-ordered transport vectors.
 * Mirrors `pipeline/encode.py::encode_case` in check order: forbidden columns
 * first, then per-feature encoding in registry order, unknown ids last.
 */
export function encodeCase(input: {
  registry: Registry;
  values: Record<string, unknown>;
  providedFeatures: Record<string, boolean>;
  providedModalities: Record<string, boolean>;
}): EncodedCase {
  const { registry, values, providedFeatures, providedModalities } = input;

  for (const column of registry.forbiddenInputColumns) {
    if (hasOwn(values, column.id)) {
      throw new DomainError(
        "MALFORMED_REQUEST",
        `forbidden input column ${column.id} must never reach the engine`,
        { columnId: column.id, reason: column.reason },
      );
    }
  }

  const features = registry.features;
  const featureVector = new Float32Array(features.length);
  const observedMask = new Uint8Array(features.length);

  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    if (!observedState(feature, providedFeatures, providedModalities)) {
      featureVector[index] = UNOBSERVED_SLOT;
      observedMask[index] = 0;
      continue;
    }
    if (!hasOwn(values, feature.id)) {
      throw invalid(feature.id, "observed feature missing from case values");
    }
    featureVector[index] = Math.fround(encodeValue(feature, values[feature.id]));
    observedMask[index] = 1;
  }

  const known = new Set<string>();
  for (const feature of features) known.add(feature.id);
  const unknown = Object.keys(values).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    unknown.sort();
    throw invalid(unknown[0], "unknown feature id");
  }

  return { featureVector, observedMask };
}

/**
 * Strict domain encoder factory (D-16 `createCaseEncoder` payload). Stateless:
 * the returned function validates one case at a time and throws `DomainError`.
 */
export function buildCaseEncoder(): CaseEncoder {
  return (input) =>
    encodeCase({
      registry: input.registry,
      values: input.values as Record<string, unknown>,
      providedFeatures: input.providedFeatures as Record<string, boolean>,
      providedModalities: input.providedModalities as Record<string, boolean>,
    });
}
