/**
 * P6-INSPECTOR-R3 — engine-backed Inspector scenarios (test-only).
 *
 * Every `ExploreInspectorProps` the Inspector tests render is produced by the
 * SHIPPED artifacts: `public/registry.json`, `public/model.json` and
 * `public/cases.json` are read from disk, the real `loadEngine` + encoder run,
 * and the resulting C-08 `Evaluation`/`Explanation` payloads are handed to the
 * component. Nothing in this file — and therefore nothing in any assertion
 * downstream of it — types a probability, a threshold, a contribution or a
 * cohort statistic: expected values are always read back out of the payload
 * the engine just produced (AGENTS §7 law 8, INV-04).
 *
 * This module imports the domain. It is deliberately NOT imported by anything
 * under `panels/inspector` outside `*.test.*` — the Inspector itself stays
 * prop-driven, store-free and artifact-free (the source-law test asserts it).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CaseDefinition,
  CasesBundle,
  EvalStatus,
  Evaluation,
  Explanation,
  FeatureId,
  FeatureValue,
  ModalityId,
  Registry,
  TargetId
} from "../../contracts";
import { COMPUTE_PROTOCOL_VERSION, type ComputeRequest } from "../../contracts/compute";
import { createCaseEncoder, loadEngine } from "../../domain";
import type { ExploreCaseSnapshot, ExploreInspectorProps, ExploreInspectorSelection } from "../../explore/types";

const PUBLIC_DIR = fileURLToPath(new URL("../../../public", import.meta.url));

function readPublicJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, name), "utf8")) as T;
}

export const registry = readPublicJson<Registry>("registry.json");
const model = readPublicJson<unknown>("model.json");
const casesBundle = readPublicJson<CasesBundle>("cases.json");

const engine = loadEngine({ model, registry });
const encode = createCaseEncoder();

const cases = new Map<string, CaseDefinition>(casesBundle.cases.map((entry) => [entry.id, entry]));

/** Shipped case IDs, for assertions that a scenario used real content. */
export const caseIds = [...cases.keys()];

export function requireCase(caseId: string): CaseDefinition {
  const found = cases.get(caseId);
  if (found === undefined) throw new Error(`fixture case not found: ${caseId}`);
  return found;
}

/** A registry copy with one target removed — the unknown-target depth path. */
export function withoutTarget(targetId: TargetId): Registry {
  return { ...registry, targets: registry.targets.filter((entry) => entry.id !== targetId) };
}

/**
 * C-05 snapshot for a shipped case. `valueOverrides` marks the touched feature
 * provided so the override is actually observed by the encoder; the override
 * itself is evaluated by the real engine, never faked.
 */
export function snapshotFor(
  caseId: string,
  valueOverrides: Record<FeatureId, FeatureValue> = {}
): ExploreCaseSnapshot {
  const definition = requireCase(caseId);
  const providedFeatures = { ...definition.providedFeatures };
  for (const key of Object.keys(valueOverrides)) providedFeatures[key] = true;
  return {
    id: definition.id,
    label: definition.label,
    provenance: definition.provenance,
    revision: 1,
    values: { ...definition.values, ...valueOverrides },
    providedFeatures,
    providedModalities: { ...definition.providedModalities }
  };
}

function request(
  snapshot: ExploreCaseSnapshot,
  overrides: Omit<Partial<ComputeRequest>, "operation"> & { operation: ComputeRequest["operation"] }
): ComputeRequest {
  const encoded = encode({
    registry,
    values: snapshot.values,
    providedFeatures: snapshot.providedFeatures,
    providedModalities: snapshot.providedModalities
  });
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: `inspector-fixture-${snapshot.id}`,
    channel: "case" as const,
    revision: snapshot.revision,
    lane: "L0" as const,
    ...overrides,
    featureVector: encoded.featureVector,
    observedMask: encoded.observedMask
  };
}

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`engine response is missing ${label}`);
  return value;
}

/** Real C-08 evaluation for a snapshot. */
export function evaluate(snapshot: ExploreCaseSnapshot): Evaluation {
  const response = engine.execute(request(snapshot, { operation: "evaluate" }));
  if (response.status !== "ok") {
    throw new Error(`evaluate failed for ${snapshot.id}: ${response.error?.code ?? "unknown"}`);
  }
  return must(response.evaluation, "evaluation");
}

/** Real C-08 explanation for a snapshot and target. */
export function explain(snapshot: ExploreCaseSnapshot, targetId: TargetId): Explanation {
  const response = engine.execute(request(snapshot, { operation: "explain", targetId }));
  if (response.status !== "ok") {
    throw new Error(`explain failed for ${snapshot.id}/${targetId}: ${response.error?.code ?? "unknown"}`);
  }
  return must(response.explanation, "explanation");
}

export type ScenarioOptions = {
  /** Shipped case to load. Default `hypo1` (every feature provided). */
  caseId?: string;
  /** Value overrides applied to the shipped case before encoding. */
  values?: Record<FeatureId, FeatureValue>;
  /** `null` (default) = Case depth; a registry target = target depth. */
  targetId?: TargetId | null;
  /** Depth-2 feature focus. */
  featureId?: FeatureId | null;
  modalityId?: ModalityId | null;
  /** Registry to render against — use `withoutTarget` for the unknown path. */
  registry?: Registry;
  /** `false` renders the designed no-evaluation state. */
  withEvaluation?: boolean;
  /** `false` renders the designed no-explanation state. */
  withExplanation?: boolean;
  /**
   * Target the explanation payload belongs to. Defaults to `targetId`; set it
   * alone to render the Case depth with a real explanation (Top reasons).
   */
  explanationTargetId?: TargetId;
  evalStatus?: EvalStatus;
  stale?: boolean;
  hovered?: ExploreInspectorSelection["hovered"];
  onHoverTarget?: (targetId: TargetId | null) => void;
  /** Collects every `onEditFeature` call for the dispatch assertions. */
  editLog?: Array<{ featureId: FeatureId; value: FeatureValue }>;
};

/**
 * One Inspector scenario: snapshot -> real engine -> frozen props. All the
 * assertions that follow read their expected numbers back out of `props`.
 */
export function scenario(options: ScenarioOptions = {}): ExploreInspectorProps {
  const {
    caseId = "hypo1",
    values = {},
    targetId = null,
    featureId = null,
    modalityId = null,
    registry: registryOverride = registry,
    withEvaluation = true,
    withExplanation = true,
    explanationTargetId,
    evalStatus,
    stale = false,
    hovered = null,
    onHoverTarget,
    editLog
  } = options;

  const snapshot = snapshotFor(caseId, values);
  const evaluation = withEvaluation ? evaluate(snapshot) : null;
  const explainedFor = explanationTargetId ?? targetId;
  const wantsExplanation =
    withExplanation && explainedFor !== null && evaluation !== null;
  const explanation = wantsExplanation ? explain(snapshot, explainedFor as TargetId) : null;

  return {
    registry: registryOverride,
    caseSnapshot: snapshot,
    evaluation,
    explanation,
    selection: { targetId, featureId, modalityId, hovered },
    evalStatus: evalStatus ?? (evaluation === null ? "idle" : "ready"),
    stale,
    onEditFeature:
      editLog === undefined
        ? () => undefined
        : (featureId, value) => editLog.push({ featureId, value }),
    onSelectTarget: () => undefined,
    onSelectFeature: () => undefined,
    ...(onHoverTarget === undefined ? {} : { onHoverTarget })
  };
}
