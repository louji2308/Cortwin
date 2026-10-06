/**
 * Scene view-model entry point (Contracts `C-11`, Architecture §10).
 *
 * Everything here is pure and WebGL-free: no three.js, no React, no store, no
 * network, no model artifact (INV-C14). The renderer consumes these
 * projections; the tests in this directory run in Node.
 *
 * TODO(integration): when `web/src/contracts/scene.ts` (P5A-1, D-14) exists,
 * re-export `SceneModel` / `StructureSource` from it instead of `./types`.
 */
export { buildSceneModel, hasSceneTruth } from "./buildSceneModel";
export {
  CAMERA_FLIGHT_MS,
  cameraFlightDuration,
  cameraFlightProgress,
  easeOutCubic
} from "./camera";
export { SceneError, isSceneError, type SceneErrorCode } from "./errors";
export {
  buildPickingProxies,
  structureIdForNode,
  PICK_PROXY_INFLATE,
  type PickingProxy
} from "./picking";
export {
  QUALITY_TIER_ORDER,
  SLOW_FRAME_MS,
  SLOW_FRAMES_TO_DOWNGRADE,
  effectiveQualityTier,
  initialGovernorState,
  isQualityTier,
  reduceGovernor,
  type GovernorState,
  type QualityEvent
} from "./qualityGovernor";
export {
  AUTHORED_SCHEMATIC_PATHS,
  SCHEMATIC_VIEW_BOX,
  resolveSchematic,
  validateSchematicPath,
  type AuthoredSchematicPath
} from "./schematic";
export {
  DECISION_GLYPH,
  buildSchematicViewModel,
  hatchingAvailableForTier,
  type DecisionGlyph,
  type SchematicIntensity,
  type SchematicVesselView,
  type SchematicViewModel
} from "./schematicViewModel";
export {
  SCENE_BUDGET,
  aggregateSceneStats,
  type SceneStats,
  type StructureNodeStats,
  type StructureStatsStruct
} from "./sceneStats";
export {
  CONTEXT_STRUCTURE_IDS,
  REQUIRED_STRUCTURE_IDS,
  cameraTargetForStructure,
  cameraTargetFromPreset,
  isNeutralStructure,
  isRequiredStructureId,
  structureById,
  validateRegistryStructures,
  vesselStructureIds
} from "./registryView";
export {
  PRIMARY_STRUCTURE_CANDIDATE,
  PROCEDURAL_STRUCTURE_CANDIDATE,
  buildSceneNodes,
  buildStructureSource,
  structureCandidates,
  type NodeLookup,
  type StructureCandidate,
  type StructureCandidateId
} from "./structureSource";
export {
  loadStructure,
  resolveStructureSource,
  type GltfLoader,
  type LoadStructureArgs,
  type LoadedGltf,
  type StructureAttempt,
  type StructureResolution
} from "./loadStructure";
export type {
  CameraPreset,
  CameraTarget,
  DecisionState,
  HoveredEntity,
  QualityTier,
  RegistrySlice,
  RegistryStructure,
  RegistryTarget,
  SceneEvaluationSlice,
  SceneModel,
  SceneNode,
  SceneStateInput,
  StructureId,
  StructureSource,
  SchematicPath,
  TargetId,
  VesselId,
  VesselVisualState
} from "./types";
