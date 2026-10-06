import type { TargetId } from "../design";

/**
 * Scene view-model types — a local projection of the frozen contract text.
 *
 * TODO(integration): merge into `web/src/contracts/scene.ts` (owned by P5A-1 per
 * Decision D-14) once that module exists. `contracts/` did not exist when this
 * unit started, so `Project/Contracts.md` §8.1 `C-11`, §7.1 `C-09` and §6.2
 * `C-08` are projected here verbatim instead. This unit never edits
 * `web/src/contracts/**`; when the shared module lands, these declarations move
 * there and `scene/` re-exports them.
 *
 * Law this file encodes (Contracts.md):
 * - `C-11`: `SceneModel` shape, `StructureSource` shape, HEART/AORTA neutral.
 * - `C-09`: the store slices this projection reads (read-only input).
 * - `C-08`: the `Evaluation` payload fields the projection passes through.
 * - `INV-C14`: the scene never reads the model artifact (no import of it here).
 */

/**
 * The three probability-driven vessels. Mirrors `config/targets.json` vessel
 * targets (`kind: "vessel"` → `structureId`) exactly as `design/types.ts`
 * mirrors `TargetId`; runtime membership is still derived from the registry
 * (INV-C15), never from this alias.
 */
export type VesselId = "LAD" | "LCX" | "RCA";

/** The five named structure nodes of the `C-11` node contract. */
export type StructureId = "HEART" | "AORTA" | "LAD" | "LCX" | "RCA";

/** `C-08` decision state. A property of the current case, never recomputed here. */
export type DecisionState = "above" | "below" | "indeterminate";

/** `C-16` / `C-09` quality tiers (downgrade-only within a session). */
export type QualityTier = "Q0" | "Q1" | "Q2" | "Q3";

/** `C-11` camera targets: overview plus one preset per vessel. */
export type CameraTarget = "overview" | "LAD" | "LCX" | "RCA";

/**
 * `C-09` `view.cameraPreset` — a superset of {@link CameraTarget}: the store may
 * hold `"CAD"` even though `CAD` has no dedicated camera.
 */
export type CameraPreset = "overview" | "CAD" | "LAD" | "LCX" | "RCA";

/** `C-09` hover channel: one channel for three entity types. */
export type HoveredEntity = { kind: "vessel" | "modality" | "feature"; id: string } | null;

/** Per-vessel visual state (`C-11` L336). Colour itself is never stored here. */
export type VesselVisualState = {
  probability: number;
  decision: DecisionState;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
};

/** `C-11` `SceneModel` — verbatim shape. Pure projection, holds no truth of its own. */
export type SceneModel = {
  vessels: Record<VesselId, VesselVisualState>;
  cameraTarget: CameraTarget;
  selectedTargetId: TargetId | null;
  hoveredEntity: HoveredEntity;
  qualityTier: QualityTier;
  reducedMotion: boolean;
};

/**
 * A resolved named node of a loaded structure (`SceneNode` is referenced but not
 * defined by `C-11`, so this unit defines the minimal descriptor: identity comes
 * from the registry, `neutral` marks the structures the model never predicts
 * (HEART/AORTA). Pure data — no three.js objects, so it is testable without WebGL.
 */
export type SceneNode = {
  structureId: StructureId;
  meshNode: string;
  neutral: boolean;
};

/** The subset of a schematic path this unit owns (SVG stroke data, no colour). */
export type SchematicPath = {
  structureId: VesselId;
  d: string;
  labelAnchor: { x: number; y: number };
  strokeWidth: number;
  origin: "authored" | "registry";
};

/** `C-11` `StructureSource` — verbatim shape. */
export type StructureSource = {
  kind: "gltf" | "procedural";
  nodes: {
    HEART: SceneNode;
    AORTA: SceneNode;
    LAD: SceneNode;
    LCX: SceneNode;
    RCA: SceneNode;
    };
  schematic: { LAD: SchematicPath; LCX: SchematicPath; RCA: SchematicPath };
};

/**
 * The `C-08` `Evaluation` slice this projection reads: probabilities and
 * decisions come only from here (INV-C14 / INV-C17), never from artifacts.
 * Structurally compatible with the full `Evaluation` (extra properties such as
 * `CAD`, `headlineCad`, `revision` are accepted and ignored).
 */
export type SceneEvaluationSlice = {
  targets: Record<VesselId, { probability: number; decision: DecisionState }>;
};

/** The `C-09` store slices `buildSceneModel` consumes (read-only). */
export type SceneStateInput = {
  eval: { current: SceneEvaluationSlice | null };
  selection: { targetId: TargetId | null; hovered: HoveredEntity };
  view: {
    cameraPreset: CameraPreset;
    qualityTier: QualityTier;
    reducedMotion: boolean;
  };
};

/** `C-02` registry `structures[]` row, projected to the fields the scene reads. */
export type RegistryStructure = {
  id: string;
  label: string;
  meshNode: string;
  cameraPreset: string;
  schematicPath: string | null;
};

/** `C-02` registry `targets[]` row, projected to the fields the scene reads. */
export type RegistryTarget = {
  id: string;
  label: string;
  kind: string;
  modelKey: string;
  structureId: string | null;
};

/** The `C-02` registry slice the scene reads — identity authority, never a second map. */
export type RegistrySlice = {
  structures: readonly RegistryStructure[];
  targets: readonly RegistryTarget[];
};

export type { TargetId };
