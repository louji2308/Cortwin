import type { Registry, RegistryStructure, RegistryTarget, TargetId, VesselId } from "../contracts";
import { RegistryError } from "./errors";

/**
 * C-02 §5.2 — the identity chain, as typed pure functions.
 *
 * `vessel ID → target ID → model key → structure ID → mesh node → camera
 * preset → UI card → explanation target → Trust target`
 *
 * No second mapping table exists anywhere: every hop is resolved from the
 * registry itself (a vessel is a structure that some `kind: "vessel"` target
 * links to; the card label is the target's own label; the explanation target
 * and the Trust filter target ARE the target id). A broken hop throws the
 * typed `IDENTITY_CHAIN_BROKEN` error rather than returning a default — the
 * chain either holds or the caller fails visibly.
 */

/** The three probability-driven vessels, always derived — never a fixed truth. */
export const VESSEL_TARGET_IDS: readonly VesselId[] = ["LAD", "LCX", "RCA"];

/** One resolved correspondence row for a single vessel. */
export type VesselIdentity = {
  vesselId: VesselId;
  targetId: TargetId;
  modelKey: string;
  structureId: string;
  meshNode: string;
  cameraPreset: RegistryStructure["cameraPreset"];
  cardLabel: string;
  cardLabelDefinition: string;
  explanationTargetId: TargetId;
  trustTargetId: TargetId;
};

function broken(path: string, detail: string): never {
  throw new RegistryError([{ code: "IDENTITY_CHAIN_BROKEN", path, detail }]);
}

/** vessel ID → target ID (via the registry's own vessel-target links). */
export function targetForVessel(registry: Registry, vesselId: VesselId): RegistryTarget {
  const target = registry.targets.find(
    (candidate) => candidate.kind === "vessel" && candidate.structureId === vesselId
  );
  if (target === undefined) broken(`targets[structureId=${vesselId}]`, "no vessel target");
  return target;
}

/** target ID → vessel ID; `null` for the overall (non-vessel) target. */
export function vesselForTarget(registry: Registry, targetId: TargetId): VesselId | null {
  const target = registry.targets.find((candidate) => candidate.id === targetId);
  if (target === undefined) broken(`targets[${targetId}]`, "unknown target");
  if (target.kind !== "vessel") return null;
  if (target.structureId === null) broken(`targets[${targetId}].structureId`, "vessel without structure");
  return target.structureId as VesselId;
}

/** target ID → model key (the bundle component that scores this target). */
export function modelKeyForTarget(registry: Registry, targetId: TargetId): string {
  const target = registry.targets.find((candidate) => candidate.id === targetId);
  if (target === undefined) broken(`targets[${targetId}]`, "unknown target");
  if (target.modelKey === "") broken(`targets[${targetId}].modelKey`, "empty model key");
  return target.modelKey;
}

/** vessel ID → structure row (identity + mesh node + camera preset source). */
export function structureForVessel(registry: Registry, vesselId: VesselId): RegistryStructure {
  const structure = registry.structures.find((candidate) => candidate.id === vesselId);
  if (structure === undefined) broken(`structures[${vesselId}]`, "unknown structure");
  return structure;
}

/** target ID → structure row, or `null` for the overall target. */
export function structureForTarget(
  registry: Registry,
  targetId: TargetId
): RegistryStructure | null {
  const vesselId = vesselForTarget(registry, targetId);
  return vesselId === null ? null : structureForVessel(registry, vesselId);
}

/** vessel ID → mesh node name inside the structure source. */
export function meshNodeForVessel(registry: Registry, vesselId: VesselId): string {
  const structure = structureForVessel(registry, vesselId);
  if (structure.meshNode === "") broken(`structures[${vesselId}].meshNode`, "empty mesh node");
  return structure.meshNode;
}

/** vessel ID → camera preset (C-11 §8.1 flight target for this vessel). */
export function cameraPresetForVessel(
  registry: Registry,
  vesselId: VesselId
): RegistryStructure["cameraPreset"] {
  return structureForVessel(registry, vesselId).cameraPreset;
}

/** target ID → UI card identity (the card always shows the target's own label). */
export function cardForTarget(
  registry: Registry,
  targetId: TargetId
): { label: string; labelDefinition: string } {
  const target = registry.targets.find((candidate) => candidate.id === targetId);
  if (target === undefined) broken(`targets[${targetId}]`, "unknown target");
  return { label: target.label, labelDefinition: target.labelDefinition };
}

/**
 * Full chain for one vessel: every downstream consumer (stage, vessel card,
 * inspector, explanation request, Trust filter, camera) reads its identity
 * from here, so a single registry row change moves all of them together.
 */
export function identityForVessel(registry: Registry, vesselId: VesselId): VesselIdentity {
  const target = targetForVessel(registry, vesselId);
  const structure = structureForVessel(registry, vesselId);
  const card = cardForTarget(registry, target.id);
  return {
    vesselId,
    targetId: target.id,
    modelKey: modelKeyForTarget(registry, target.id),
    structureId: structure.id,
    meshNode: structure.meshNode,
    cameraPreset: structure.cameraPreset,
    cardLabel: card.label,
    cardLabelDefinition: card.labelDefinition,
    explanationTargetId: target.id,
    trustTargetId: target.id
  };
}

/**
 * The correspondence table asserted end-to-end by the C-02 test gate:
 * one row per vessel, resolved only through registry fields.
 */
export function identityChainTable(registry: Registry): Record<VesselId, VesselIdentity> {
  const rows = {} as Record<VesselId, VesselIdentity>;
  for (const vesselId of VESSEL_TARGET_IDS) {
    rows[vesselId] = identityForVessel(registry, vesselId);
  }
  return rows;
}
