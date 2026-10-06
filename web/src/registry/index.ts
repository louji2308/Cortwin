/**
 * C-02 §5.2 registry correspondence — runtime validator, referential-integrity
 * audit and the identity chain. One registry, one mapping authority: nothing
 * outside this module may translate vessel ↔ target ↔ structure ↔ mesh node.
 */
export {
  RegistryError,
  type RegistryIssue,
  type RegistryIssueCode
} from "./errors";
export {
  auditRegistry,
  parseRegistry,
  validateRegistryIntegrity
} from "./validateRegistry";
export {
  VESSEL_TARGET_IDS,
  cameraPresetForVessel,
  cardForTarget,
  identityChainTable,
  identityForVessel,
  meshNodeForVessel,
  modelKeyForTarget,
  structureForTarget,
  structureForVessel,
  targetForVessel,
  vesselForTarget,
  type VesselIdentity
} from "./identityChain";
