import type { DecisionState, QualityTier, TargetId, VesselId } from "./primitives";

/**
 * C-11 §8.1 named-node contract: exactly these five structure nodes exist in
 * a `StructureSource` (`AGENTS.md` §8). Registry structure IDs and mesh node
 * names are validated against this closed set.
 */
export type StructureId = "HEART" | "AORTA" | "LAD" | "LCX" | "RCA";

/** C-11 §8.1 — verbatim. Pure presentation state assembled by store selectors. */
export type SceneModel = {
  vessels: Record<VesselId, { probability: number; decision: DecisionState;
    selected: boolean; hovered: boolean; dimmed: boolean }>;
  cameraTarget: "overview" | "LAD" | "LCX" | "RCA"; selectedTargetId: TargetId | null;
  hoveredEntity: { kind: "vessel" | "modality" | "feature"; id: string } | null;
  qualityTier: QualityTier; reducedMotion: boolean;
};

/**
 * C-11 §8.1 `StructureSource.nodes` slot. The contract names `SceneNode`
 * without defining it (opaque like `SchematicPath`); Decision **D-15**
 * reconciles this projection to the minimal structural descriptor both
 * consumers share — a pre-render identity record, never a three.js object, so
 * the type stays testable in Node and free of any renderer dependency:
 *
 * - `structureId` — registry structure identity (the named-node contract);
 * - `meshNode`    — the node name inside the loaded glTF / procedural source;
 * - `neutral`     — C-11 §8.1 "HEART and AORTA stay neutral": true exactly for
 *   structures no vessel target links to, so they can never carry a colour.
 */
export type SceneNode = {
  structureId: StructureId;
  meshNode: string;
  neutral: boolean;
};

/**
 * C-11 §8.1 `StructureSource.schematic` value (C-CONF-03 / D-15). C-02 §5.2
 * types the registry's own `structures[].schematicPath` as a nullable path
 * string; this is the structured, renderer-ready projection of one path:
 *
 * - `structureId`  — the vessel this path draws (correspondence preserved);
 * - `d`            — SVG path data (registry string, else authored);
 * - `labelAnchor`  — label anchor point in the fixed view box;
 * - `strokeWidth`  — stroke width in view-box units;
 * - `origin`       — whether `d` came from the registry or the authored set.
 */
export type SchematicPath = {
  structureId: VesselId;
  d: string;
  labelAnchor: { x: number; y: number };
  strokeWidth: number;
  origin: "authored" | "registry";
};

/** C-11 §8.1 — verbatim. */
export interface StructureSource {
  kind: "gltf" | "procedural";
  nodes: { HEART: SceneNode; AORTA: SceneNode; LAD: SceneNode; LCX: SceneNode; RCA: SceneNode };
  schematic: { LAD: SchematicPath; LCX: SchematicPath; RCA: SchematicPath };
}
